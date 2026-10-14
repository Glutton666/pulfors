import { KOREAN_COUNT_WORDS } from "./voice-count";

/** Platform-neutral contract, limits and ownership; safe to import in Node/web. */
export interface NoteTtsVoice {
  id: string;
  name: string;
  language: string;
  gender: "male" | "female" | "unknown";
}
export interface NoteTtsResult { uri: string; duration: number }
export interface NoteTtsNative {
  getVoices(): Promise<NoteTtsVoice[]>;
  getOfflineKoreanCountVoices(): Promise<NoteTtsVoice[]>;
  generate(text: string, voiceId: string, requestId: string): Promise<NoteTtsResult>;
  /** Release a completed synthesis result from the native unclaimed-file guard. */
  claim(uri: string): Promise<void>;
  cancel(requestId: string): Promise<void>;
  discard(uri: string): Promise<void>;
  /** Lists only completed files that are not being generated or claimed. */
  listFiles(): Promise<string[]>;
}
export const NOTE_TTS_MAX_TEXT = 300;
export const NOTE_TTS_MAX_DURATION = 30;
export const OFFLINE_KOREAN_COUNT_WORDS = KOREAN_COUNT_WORDS;

const retainedFiles = new Map<string, number>();
const playerLeases = new WeakMap<object, () => void>();
const fileReleaseListeners = new Set<(uri: string) => void>();

function canonicalTtsUri(uri: string): string | null {
  const path = uri.split("#", 1)[0];
  return /^file:\/\/.+\/tts-samples\/[a-f0-9-]{36}\.wav$/i.test(path) ? path : null;
}

/** Protects a generated sample while playback, export, or a recorder owns it. */
export function retainNoteTtsFile(uri: string): () => void {
  const canonical = canonicalTtsUri(uri);
  if (!canonical) return () => {};
  retainedFiles.set(canonical, (retainedFiles.get(canonical) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = retainedFiles.get(canonical) ?? 0;
    if (count <= 1) {
      retainedFiles.delete(canonical);
      for (const listener of fileReleaseListeners) {
        try { listener(canonical); } catch {}
      }
    }
    else retainedFiles.set(canonical, count - 1);
  };
}

export function isNoteTtsFileRetained(uri: string): boolean {
  const canonical = canonicalTtsUri(uri);
  return canonical !== null && (retainedFiles.get(canonical) ?? 0) > 0;
}

export function subscribeNoteTtsFileRelease(listener: (uri: string) => void): () => void {
  fileReleaseListeners.add(listener);
  return () => fileReleaseListeners.delete(listener);
}

/** Keeps a file alive for the lifetime of a native sample player. */
export function attachNoteTtsPlayerLease(player: object, uri: string): void {
  playerLeases.get(player)?.();
  playerLeases.set(player, retainNoteTtsFile(uri));
}

export function releaseNoteTtsPlayerLease(player: object): void {
  playerLeases.get(player)?.();
  playerLeases.delete(player);
}

export function validateNoteTtsText(text: string): string {
  if (!text.trim() || text.length > NOTE_TTS_MAX_TEXT) throw new Error("invalidText");
  return text.trim();
}
export function noteTtsErrorCode(error: unknown): string {
  const code = (error as { code?: string })?.code ?? (error instanceof Error ? error.message : "failed");
  return ["unavailable", "noVoice", "invalidText", "invalidAudio", "tooLarge", "busy", "cancelled", "timeout"].includes(code) ? code : "failed";
}

let nextRequest = 0;
/** One recorder lifetime owns its work and unsaved files; IDs never repeat. */
export class NoteTtsSession {
  private epoch = 0;
  private request: string | null = null;
  private draft: string | null = null;
  private releaseDraft: (() => void) | null = null;
  private readonly pendingDraftSaves = new Map<string, { count: number; reset: boolean; saved: boolean }>();
  private readonly deferredDraftReleases = new Map<string, () => void>();
  constructor(
    private native: NoteTtsNative,
    private prepare?: (result: NoteTtsResult, isCurrent: () => boolean) => Promise<NoteTtsResult>,
  ) {}

  async generate(text: string, voiceId: string): Promise<NoteTtsResult | null> {
    const clean = validateNoteTtsText(text);
    if (!voiceId) throw new Error("noVoice");
    if (this.request) throw new Error("busy");
    const epoch = ++this.epoch;
    const id = `note-tts-${Date.now()}-${++nextRequest}`;
    this.request = id;
    let releaseGenerated: (() => void) | null = null;
    try {
      let result = await this.native.generate(clean, voiceId, id);
      releaseGenerated = retainNoteTtsFile(result.uri);
      try {
        await this.native.claim(result.uri);
      } catch (error) {
        await this.native.discard(result.uri);
        throw error;
      }
      if (epoch !== this.epoch) { await this.native.discard(result.uri); return null; }
      if (!result.uri.startsWith("file://") || !Number.isFinite(result.duration) ||
          result.duration <= 0 || result.duration > NOTE_TTS_MAX_DURATION) {
        await this.native.discard(result.uri);
        throw new Error("tooLarge");
      }
      if (this.prepare) {
        try { result = await this.prepare(result, () => epoch === this.epoch); }
        catch (error) { await this.native.discard(result.uri); throw error; }
        if (epoch !== this.epoch) { await this.native.discard(result.uri); return null; }
      }
      if (this.draft) await this.native.discard(this.draft);
      this.releaseDraft?.();
      this.releaseDraft = null;
      // Discard may yield to a reset/target change.
      if (epoch !== this.epoch) { await this.native.discard(result.uri); return null; }
      this.draft = result.uri;
      this.releaseDraft = releaseGenerated;
      releaseGenerated = null;
      return result;
    } catch (error) {
      if (epoch !== this.epoch) return null;
      throw error;
    } finally {
      releaseGenerated?.();
      if (this.request === id) this.request = null;
    }
  }

  commit(uri: string): void {
    if (this.draft === uri) {
      this.draft = null;
      this.releaseDraft?.();
      this.releaseDraft = null;
    }
  }

  /** Defers draft disposal until an in-flight slot save confirms its outcome. */
  beginCommit(uri: string): (saved: boolean) => void {
    if (this.draft !== uri) return (saved) => { if (saved) this.commit(uri); };
    const state = this.pendingDraftSaves.get(uri) ?? { count: 0, reset: false, saved: false };
    state.count += 1;
    this.pendingDraftSaves.set(uri, state);
    let settled = false;
    return (saved) => {
      if (settled) return;
      settled = true;
      state.count -= 1;
      state.saved ||= saved;
      if (state.saved) {
        this.commit(uri);
        this.deferredDraftReleases.get(uri)?.();
        this.deferredDraftReleases.delete(uri);
      } else if (state.count === 0 && state.reset) {
        const release = this.deferredDraftReleases.get(uri);
        this.deferredDraftReleases.delete(uri);
        void this.native.discard(uri).catch(() => {}).finally(() => release?.());
      }
      if (state.count === 0) this.pendingDraftSaves.delete(uri);
    };
  }

  async reset(): Promise<void> {
    ++this.epoch;
    const request = this.request;
    const draft = this.draft;
    const releaseDraft = this.releaseDraft;
    this.request = null;
    this.draft = null;
    this.releaseDraft = null;
    const pendingSave = draft ? this.pendingDraftSaves.get(draft) : undefined;
    if (draft && releaseDraft && pendingSave) {
      pendingSave.reset = true;
      this.deferredDraftReleases.set(draft, releaseDraft);
    }
    try {
      if (request) await this.native.cancel(request);
    } finally {
      try {
        if (draft && !pendingSave) await this.native.discard(draft);
      } finally {
        if (!pendingSave) releaseDraft?.();
      }
    }
  }
}
