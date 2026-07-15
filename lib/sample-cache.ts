import { Platform } from "react-native";
import type { SampleChannel } from "./stereo-channel";

export interface CacheEntry {
  rawUri: string;
  channel: SampleChannel;
  artifactPath: string | null;
  effectiveUri: string;
  createdAt: number;
}

export interface SyncResult {
  uri: string;
  changed: boolean;
}

export interface SyncDeps {
  decode?: (uri: string) => Promise<Float32Array | null>;
  save?: (
    mono: Float32Array,
    channel: "left" | "right",
    filename: string,
  ) => Promise<string>;
  deleteArtifact?: (path: string) => Promise<void> | void;
  now?: () => number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<SyncResult>>();
const MAX_ENTRIES = 32;

function getDefaultDeps(): {
  decode: NonNullable<SyncDeps["decode"]>;
  save: NonNullable<SyncDeps["save"]>;
} {
  // Use require() for lazy loading — works identically on Hermes/native and in
  // Jest's CJS environment (dynamic import() is not transformed by babel-jest).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const m = require("./audio-renderer") as typeof import("./audio-renderer");
  return { decode: m.decodeSampleFile, save: m.saveStereoSampleWav };
}

interface FileLike {
  delete(): void;
}
interface FileCtor {
  new (uri: string): FileLike;
}
interface LegacyFileSystemModule {
  deleteAsync?: (uri: string, options?: { idempotent?: boolean }) => Promise<void>;
}
interface FileSystemModule extends LegacyFileSystemModule {
  File?: FileCtor;
}

export async function _defaultDeleteArtifactForTests(path: string): Promise<void> {
  return defaultDeleteArtifact(path);
}

async function defaultDeleteArtifact(path: string): Promise<void> {
  if (!path) return;
  if (Platform.OS === "web") {
    if (path.startsWith("blob:")) {
      try { URL.revokeObjectURL(path); } catch {}
    }
    return;
  }
  try {
    // Use require() for lazy loading — works identically on Hermes/native and in
    // Jest's CJS environment (dynamic import() is not transformed by babel-jest).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require("expo-file-system") as unknown as FileSystemModule;
    const fileUri = path.split("#")[0];
    if (m.File) {
      try {
        const f = new m.File(fileUri);
        f.delete();
        return;
      } catch {}
    }
    if (typeof m.deleteAsync === "function") {
      try { await m.deleteAsync(fileUri, { idempotent: true }); } catch {}
    }
  } catch {}
}

function bump(key: string, entry: CacheEntry) {
  cache.delete(key);
  cache.set(key, entry);
}

async function evictIfNeeded(deps: SyncDeps): Promise<void> {
  while (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    const e = cache.get(oldestKey);
    cache.delete(oldestKey);
    if (e?.artifactPath) {
      await (deps.deleteArtifact ?? defaultDeleteArtifact)(e.artifactPath);
    }
  }
}

export async function syncStereoArtifact(
  key: string,
  rawUri: string,
  channel: SampleChannel,
  deps: SyncDeps = {},
): Promise<SyncResult> {
  const prior = inflight.get(key);
  const run = (prior ? prior.catch(() => undefined) : Promise.resolve()).then(() =>
    syncStereoArtifactInner(key, rawUri, channel, deps),
  );
  inflight.set(key, run);
  try {
    return await run;
  } finally {
    if (inflight.get(key) === run) inflight.delete(key);
  }
}

async function syncStereoArtifactInner(
  key: string,
  rawUri: string,
  channel: SampleChannel,
  deps: SyncDeps,
): Promise<SyncResult> {
  const existing = cache.get(key);
  if (existing && existing.rawUri === rawUri && existing.channel === channel) {
    bump(key, existing);
    return { uri: existing.effectiveUri, changed: false };
  }

  if (existing?.artifactPath) {
    await (deps.deleteArtifact ?? defaultDeleteArtifact)(existing.artifactPath);
  }
  cache.delete(key);

  const now = deps.now ?? (() => Date.now());

  if (channel === "both") {
    const entry: CacheEntry = {
      rawUri,
      channel,
      artifactPath: null,
      effectiveUri: rawUri,
      createdAt: now(),
    };
    cache.set(key, entry);
    await evictIfNeeded(deps);
    return { uri: rawUri, changed: true };
  }

  let decode = deps.decode;
  let save = deps.save;
  if (!decode || !save) {
    const d = getDefaultDeps();
    decode = decode ?? d.decode;
    save = save ?? d.save;
  }

  const fragment = rawUri.includes("#") ? rawUri.slice(rawUri.indexOf("#")) : "";
  const uriNoFrag = rawUri.split("#")[0];
  try {
    const mono = await decode(uriNoFrag);
    if (!mono || mono.length === 0) {
      return { uri: rawUri, changed: true };
    }
    const safeKey = key.replace(/[^0-9a-zA-Z-]/g, "_");
    const ts = now();
    const filename = `note_stereo_${safeKey}_${channel}_${ts}.wav`;
    const stereoUri = await save(mono, channel, filename);
    const entry: CacheEntry = {
      rawUri,
      channel,
      artifactPath: stereoUri,
      effectiveUri: stereoUri + fragment,
      createdAt: ts,
    };
    cache.set(key, entry);
    await evictIfNeeded(deps);
    return { uri: entry.effectiveUri, changed: true };
  } catch {
    return { uri: rawUri, changed: true };
  }
}

export async function releaseStereoArtifact(
  key: string,
  deps: SyncDeps = {},
): Promise<void> {
  const e = cache.get(key);
  if (!e) return;
  cache.delete(key);
  if (e.artifactPath) {
    await (deps.deleteArtifact ?? defaultDeleteArtifact)(e.artifactPath);
  }
}

export async function releaseAll(deps: SyncDeps = {}): Promise<void> {
  const entries = Array.from(cache.values());
  cache.clear();
  for (const e of entries) {
    if (e.artifactPath) {
      await (deps.deleteArtifact ?? defaultDeleteArtifact)(e.artifactPath);
    }
  }
}

export function _getCacheSize(): number {
  return cache.size;
}

export function _getCacheEntry(key: string): CacheEntry | undefined {
  return cache.get(key);
}

export function _resetCacheForTests(): void {
  cache.clear();
  inflight.clear();
}

export function _getCacheKeysInOrder(): string[] {
  return Array.from(cache.keys());
}
