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
  generate(text: string, voiceId: string, requestId: string): Promise<NoteTtsResult>;
  cancel(requestId: string): Promise<void>;
  discard(uri: string): Promise<void>;
}
export const NOTE_TTS_MAX_TEXT = 300;
export const NOTE_TTS_MAX_DURATION = 30;
export function validateNoteTtsText(text: string): string {
  if (!text.trim() || text.length > NOTE_TTS_MAX_TEXT) throw new Error("invalidText");
  return text.trim();
}
export function noteTtsErrorCode(error: unknown): string {
  const code = (error as { code?: string })?.code ?? (error instanceof Error ? error.message : "failed");
  return ["unavailable", "noVoice", "invalidText", "tooLarge", "busy", "cancelled", "timeout"].includes(code) ? code : "failed";
}

let nextRequest = 0;
/** One recorder lifetime owns its work and unsaved files; IDs never repeat. */
export class NoteTtsSession {
  private epoch = 0;
  private request: string | null = null;
  private draft: string | null = null;
  constructor(private native: NoteTtsNative) {}

  async generate(text: string, voiceId: string): Promise<NoteTtsResult | null> {
    const clean = validateNoteTtsText(text);
    if (!voiceId) throw new Error("noVoice");
    if (this.request) throw new Error("busy");
    const epoch = ++this.epoch;
    const id = `note-tts-${Date.now()}-${++nextRequest}`;
    this.request = id;
    try {
      const result = await this.native.generate(clean, voiceId, id);
      if (epoch !== this.epoch) { await this.native.discard(result.uri); return null; }
      if (!result.uri.startsWith("file://") || !Number.isFinite(result.duration) ||
          result.duration <= 0 || result.duration > NOTE_TTS_MAX_DURATION) {
        await this.native.discard(result.uri);
        throw new Error("tooLarge");
      }
      if (this.draft) await this.native.discard(this.draft);
      // Discard may yield to a reset/target change.
      if (epoch !== this.epoch) { await this.native.discard(result.uri); return null; }
      this.draft = result.uri;
      return result;
    } catch (error) {
      if (epoch !== this.epoch) return null;
      throw error;
    } finally {
      if (this.request === id) this.request = null;
    }
  }

  commit(uri: string): void {
    if (this.draft === uri) this.draft = null;
  }
  async reset(): Promise<void> {
    ++this.epoch;
    const request = this.request;
    const draft = this.draft;
    this.request = null;
    this.draft = null;
    try {
      if (request) await this.native.cancel(request);
    } finally {
      if (draft) await this.native.discard(draft);
    }
  }
}
