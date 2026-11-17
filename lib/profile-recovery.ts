import Raw from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import {
  registry, writeRegistry, withProfileLock, recoveryProfiles, inspectProfile,
  type LocalProfile,
} from "./profile-registry";
import { isLegacyDataKey, profileKey, PROFILE_REGISTRY_KEY } from "./profile-storage";

export const getProfileRecoveryCandidates = recoveryProfiles;

/** User explicitly chooses an existing namespace, never a fresh empty profile. */
export async function recoverProfileRegistry(activeId: string): Promise<void> {
  await withProfileLock(async () => {
    const profiles = await recoveryProfiles();
    const selected = profiles.find(p => p.id === activeId);
    if (!selected) throw new Error("No saved profile was found for this choice");
    if (selected.issue) throw new Error("Repair this profile before opening it");
    await writeRegistry({
      version: 1, activeId,
      profiles: profiles.map(({ id, name, storage }) => ({ id, name, ...(storage ? { storage } : {}) })),
    });
  });
}

/**
 * Quota escape hatch: after confirmation keep the root data as the first
 * profile's immutable backing. No data copy, no silent defaults, no source removal.
 */
export async function openLegacyDataInPlace(): Promise<void> {
  await withProfileLock(async () => {
    const existing = await Raw.getItem(PROFILE_REGISTRY_KEY);
    if (existing) {
      try {
        await registry();
        throw new Error("Profiles already exist. Choose an existing profile instead.");
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Profiles already")) throw error;
      }
    }
    if (await Raw.getItem("metronome_restore_snapshot_v1")) throw new Error("Finish pending backup recovery first");
    const keys = (await Raw.getAllKeys()).filter(isLegacyDataKey);
    if (!keys.length) throw new Error("No original data was found");
    const profile: LocalProfile = { id: "legacy", name: "", storage: "legacy" };
    const checked = await inspectProfile(profile);
    if (checked.issue) throw new Error("Original settings are damaged. Repair them before opening.");
    // Free only exact, unpublished migration duplicates. Never alter originals.
    for (const [key, value] of await Raw.multiGet(keys)) {
      const duplicate = profileKey("legacy", key);
      if (value !== null && await Raw.getItem(duplicate) === value) await Raw.removeItem(duplicate);
    }
    // Preserve other recovered namespaces as well as the chosen original data.
    const candidates = await recoveryProfiles();
    await writeRegistry({
      version: 1, activeId: "legacy",
      profiles: [ { id: "legacy", name: checked.name, storage: "legacy" },
        ...candidates.filter(p => p.id !== "legacy").map(({ id, name, storage }) =>
          ({ id, name, ...(storage ? { storage } : {}) })) ],
    });
  });
}

/** Raw recovery file, deliberately distinct from a normal portable media backup. */
export async function exportProfileRecoveryData(): Promise<boolean> {
  const data = Object.fromEntries(await Raw.multiGet(await Raw.getAllKeys()));
  const json = JSON.stringify({
    format: "pulfors-device-recovery", version: 1, createdAt: new Date().toISOString(), data,
  });
  const filename = `pulfors-device-recovery-${Date.now()}.json`;
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  const fs = await import("expo-file-system/legacy");
  const sharing = await import("expo-sharing");
  if (!fs.cacheDirectory || !(await sharing.isAvailableAsync())) return false;
  const uri = fs.cacheDirectory + filename;
  await fs.writeAsStringAsync(uri, json);
  await sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Profile recovery", UTI: "public.json" });
  return true;
}
