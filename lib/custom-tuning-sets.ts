import AsyncStorage from "@/lib/profile-storage";

export const CUSTOM_TUNING_SETS_KEY = "metronome_custom_tuning_sets_v1";
export interface CustomTuningTarget { id: string; name: string; frequency: number | null }
export interface CustomTuningGroup { id: string; name: string; targets: CustomTuningTarget[] }
export interface CustomTuningSet { id: string; name: string; groups: CustomTuningGroup[] }

let idCounter = 0;
export function makeTuningId(): string {
  return `tuning-${Date.now().toString(36)}-${(++idCounter).toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function validateTuningFrequency(input: string): number | null {
  if (!/^\d+(?:\.\d+)?$/.test(input.trim())) return null;
  const frequency = Number(input);
  return Number.isFinite(frequency) && frequency >= 20 && frequency <= 20000 ? frequency : null;
}

export function parseTuningNote(input: string): number | null {
  const match = /^([A-Ga-g])([#♯b♭]?)(-?\d{1,2})$/.exec(input.trim());
  if (!match) return null;
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const natural = names.indexOf(match[1].toUpperCase());
  const accidental = ["#", "♯"].includes(match[2]) ? 1 : ["b", "♭"].includes(match[2]) ? -1 : 0;
  const midi = (Number(match[3]) + 1) * 12 + natural + accidental;
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  return frequency >= 20 && frequency <= 20000 ? Math.round(frequency * 100) / 100 : null;
}

/** Strict validation also protects imported backups and avoids partial data loss. */
export function validateCustomTuningSets(value: unknown): CustomTuningSet[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Invalid tuning sets");
  const ids = new Set<string>();
  const identity = (entry: unknown): { id: string; name: string } => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Invalid tuning item");
    const { id, name } = entry as Record<string, unknown>;
    if (typeof id !== "string" || !id.trim() || id.length > 150 || ids.has(id) ||
        typeof name !== "string" || !name.trim() || name.length > 100) throw new Error("Invalid tuning name or ID");
    ids.add(id);
    return { id, name: name.trim() };
  };
  return value.map((set) => {
    const base = identity(set);
    if (!Array.isArray(set.groups) || set.groups.length > 50) throw new Error("Invalid tuning groups");
    return { ...base, groups: set.groups.map((group: CustomTuningGroup) => {
      const groupBase = identity(group);
      if (!Array.isArray(group.targets) || group.targets.length > 64) throw new Error("Invalid tuning targets");
      return { ...groupBase, targets: group.targets.map((target: CustomTuningTarget) => {
        const targetBase = identity(target);
        if (target.frequency !== null && (typeof target.frequency !== "number" ||
            !Number.isFinite(target.frequency) || target.frequency < 20 || target.frequency > 20000)) {
          throw new Error("Invalid target frequency");
        }
        return { ...targetBase, frequency: target.frequency };
      }) };
    }) };
  });
}

// Serialize full-list writes and capture updates. A capture only patches an
// existing target, never resurrecting a deleted group or a stale document.
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const pending = writeQueue.then(operation, operation);
  writeQueue = pending.catch(() => {});
  return pending;
}

async function readStored(): Promise<CustomTuningSet[]> {
  const raw = await AsyncStorage.getItem(CUSTOM_TUNING_SETS_KEY);
  return raw === null ? [] : validateCustomTuningSets(JSON.parse(raw));
}
export async function loadCustomTuningSets(): Promise<CustomTuningSet[]> {
  await writeQueue;
  return readStored();
}
export function saveCustomTuningSets(sets: CustomTuningSet[]): Promise<void> {
  const safe = validateCustomTuningSets(sets);
  return enqueue(() => AsyncStorage.setItem(CUSTOM_TUNING_SETS_KEY, JSON.stringify(safe)));
}
export function updateCustomTuningTarget(setId: string, groupId: string, targetId: string, frequency: number): Promise<void> {
  if (validateTuningFrequency(String(frequency)) === null) return Promise.reject(new Error("Invalid target frequency"));
  return enqueue(async () => {
    const sets = await readStored();
    const target = sets.find((set) => set.id === setId)?.groups
      .find((group) => group.id === groupId)?.targets.find((item) => item.id === targetId);
    if (!target) throw new Error("Tuning target no longer exists");
    target.frequency = frequency;
    await AsyncStorage.setItem(CUSTOM_TUNING_SETS_KEY, JSON.stringify(sets));
  });
}
