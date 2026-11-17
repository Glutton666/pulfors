import RawStorage from "@react-native-async-storage/async-storage";

/**
 * One JS runtime owns one profile for its entire lifetime. Switching reloads
 * the runtime rather than rebinding this adapter under suspended callbacks.
 */
export const PROFILE_PREFIX = "local_profile:";
export const PROFILE_REGISTRY_KEY = "local_profiles_v1";
let owner: string | null = null;
let legacy = false;
let sealed = false;
let pending = new Set<Promise<unknown>>();
let writeFailure: unknown = null;

export function isLegacyDataKey(key: string): boolean {
  return !key.startsWith(PROFILE_PREFIX) && !key.startsWith("local_profiles_");
}
export function bindProfileStorage(id: string, useLegacy = false): void {
  if (owner && (owner !== id || legacy !== useLegacy)) throw new Error("Profile changes require a fresh runtime");
  owner = id;
  legacy = useLegacy;
  sealed = false;
}
export function activeStorageProfile(): string {
  if (!owner) throw new Error("Profile storage is not ready");
  return owner;
}
export function profileKey(id: string, key: string): string {
  return `${PROFILE_PREFIX}${id}:${key}`;
}
function keyFor(key: string): string {
  if (legacy) {
    if (!isLegacyDataKey(key)) throw new Error("Reserved device metadata");
    return key;
  }
  return profileKey(activeStorageProfile(), key);
}
function track<T>(operation: () => Promise<T>): Promise<T> {
  if (sealed) return Promise.reject(new Error("Profile session is closed"));
  const write = async () => {
    // Another tab can delete this profile. It must never be recreated by a late save.
    const raw = await RawStorage.getItem(PROFILE_REGISTRY_KEY);
    const reg = raw ? JSON.parse(raw) : null;
    if (!reg || !Array.isArray(reg.profiles) || !reg.profiles.some((p: { id: string; storage?: string }) =>
      p.id === owner && (p.storage === "legacy") === legacy)) throw new Error("Profile was removed or needs recovery");
    return operation();
  };
  const result: Promise<T> = (async () => {
    if (typeof navigator !== "undefined" && navigator.locks) {
      return await navigator.locks.request("metronome-local-profiles", write);
    }
    return write();
  })();
  pending.add(result);
  result.then(() => pending.delete(result), (error) => {
    pending.delete(result);
    writeFailure = error;
  });
  return result;
}
export async function drainProfileWrites(): Promise<void> {
  while (pending.size) await Promise.all([...pending]);
  if (writeFailure) {
    const error = writeFailure;
    writeFailure = null;
    throw error;
  }
}
export function sealProfileStorage(): void { sealed = true; }
export function reopenProfileStorage(): void { sealed = false; }

const storage = {
  getItem: (key: string) => RawStorage.getItem(keyFor(key)),
  setItem: (key: string, value: string) => track(() => RawStorage.setItem(keyFor(key), value)),
  removeItem: (key: string) => track(() => RawStorage.removeItem(keyFor(key))),
  multiGet: async (keys: readonly string[]): Promise<[string, string | null][]> => {
    const pairs = await RawStorage.multiGet(keys.map(keyFor));
    return pairs.map(([, value], index) => [keys[index], value]);
  },
  multiSet: (pairs: readonly (readonly [string, string])[]) =>
    track(() => RawStorage.multiSet(pairs.map(([key, value]) => [keyFor(key), value]))),
  multiRemove: (keys: readonly string[]) => track(() => RawStorage.multiRemove(keys.map(keyFor))),
  getAllKeys: async (): Promise<string[]> => {
    const prefix = profileKey(activeStorageProfile(), "");
    const keys = await RawStorage.getAllKeys();
    return legacy ? keys.filter(isLegacyDataKey) : keys.filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length));
  },
  clear: async () => {
    const keys = await storage.getAllKeys();
    await storage.multiRemove(keys);
  },
};
export default storage;
