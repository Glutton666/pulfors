import { isProfileBackupKey, SCORE_KEY_PREFIX } from "./shared";
import { validateScoreDocument } from "../score-io";
import { isNotebook } from "../staff-notebook";
import { validateRhythmDocument } from "../rhythm-lab/engine";

const plainTextKeys = new Set([
  "metronome_theme_color", "metronome_custom_hex", "metronome_theme_mode",
  "metronome_language", "metronome_landscape_image", "metronome_onboarding_done",
  "metronome_onboarding_lang_done", "metronome_lab_unlocked",
  "metronome_voice_assistant_v1", "rhythm_lab_entry_mode_v1",
  "metronome_signal_sensitivity_v1",
]);

/** Reject corrupt structures before restoring files or publishing a new profile. */
export function validateProfileBackupData(data: Record<string, string | null>): void {
  let count = 0;
  const inspect = (value: unknown, depth = 0): void => {
    if (++count > 500000 || depth > 40) throw new Error("Backup content is too complex");
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("Unsafe backup property");
        if ((key === "uri" || /(?:Uri|Photo)$/.test(key)) && typeof child === "string" && child
          && !/^(file:|data:|blob:|asset:)/.test(child)) throw new Error("Unsafe media URI");
        inspect(child, depth + 1);
      }
    }
  };
  for (const [key, raw] of Object.entries(data)) {
    if (raw === null || !isProfileBackupKey(key)) continue;
    if (key === "metronome_landscape_image" && raw && !/^(file:|data:|blob:|asset:)/.test(raw)) throw new Error("Unsafe image URI");
    if (plainTextKeys.has(key) || key.startsWith("hint_shown_v1_")) continue;
    const value = JSON.parse(raw);
    inspect(value);
    if (key === "metronome_settings") {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid settings");
      if (value.bpm !== undefined && (!Number.isFinite(value.bpm) || value.bpm < 20 || value.bpm > 300)) throw new Error("Invalid BPM");
      if (value.beatsPerMeasure !== undefined && (!Number.isInteger(value.beatsPerMeasure) || value.beatsPerMeasure < 1 || value.beatsPerMeasure > 256)) throw new Error("Invalid meter");
      if (value.username !== undefined && typeof value.username !== "string") throw new Error("Invalid nickname");
      for (const field of ["beatTypes", "subdivisionPattern"]) {
        if (value[field] !== undefined && (!Array.isArray(value[field]) || value[field].length > 256
          || value[field].some((beat: unknown) => !["strong", "accent", "normal", "mute"].includes(beat as string)))) throw new Error("Invalid beat pattern");
      }
      if (value.modeSettings !== undefined && (!value.modeSettings || typeof value.modeSettings !== "object" || Array.isArray(value.modeSettings)
        || Object.values(value.modeSettings).some(mode => !mode || typeof mode !== "object" || Array.isArray(mode)))) throw new Error("Invalid mode settings");
    }
    if (key.startsWith(SCORE_KEY_PREFIX) && key !== "metronome_scores_v1") {
      const error = validateScoreDocument(value);
      if (error) throw new Error(error);
      if (`${SCORE_KEY_PREFIX}${value.id}` !== key) throw new Error("Score ID does not match its key");
    }
    if (key === "lab_staff_notebooks_v1" && (!Array.isArray(value) || !value.every(isNotebook))) throw new Error("Invalid staff notebook");
    if (key === "rhythm_lab_documents_v1") {
      if (!Array.isArray(value)) throw new Error("Invalid rhythm documents");
      value.forEach(validateRhythmDocument);
    }
    if (key === "rhythm_lab_recovery_v1") {
      if (value?.version !== 1 || !Array.isArray(value.documents)) throw new Error("Invalid rhythm recovery");
      value.documents.forEach(validateRhythmDocument);
    }
    if (["practice_book", "metronome_activity_log", "metronome_goals", "metronome_practice_rooms", "metronome_scores_v1"].includes(key) && !Array.isArray(value)) {
      throw new Error(`Invalid list: ${key}`);
    }
    if (key === "practice_book" && value.some((entry: Record<string, unknown> | null) =>
      !entry || typeof entry.id !== "string" || !Number.isFinite(entry.bpm) || (entry.bpm as number) <= 0)) throw new Error("Invalid practice entry");
    if (key === "metronome_practice_rooms" || key === "metronome_settings" && value.profileRooms !== undefined) {
      const rooms = key === "metronome_practice_rooms" ? value : value.profileRooms;
      if (!Array.isArray(rooms) || rooms.some(room => !room || typeof room.id !== "string" || typeof room.name !== "string"
        || !Number.isFinite(room.latitude) || Math.abs(room.latitude) > 90 || !Number.isFinite(room.longitude) || Math.abs(room.longitude) > 180)) throw new Error("Invalid practice rooms");
    }
  }
  if (data.metronome_scores_v1) {
    const ids = JSON.parse(data.metronome_scores_v1) as unknown[];
    if (ids.some(id => typeof id !== "string" || !Object.hasOwn(data, `${SCORE_KEY_PREFIX}${id}`) || data[`${SCORE_KEY_PREFIX}${id}`] === null)) throw new Error("Missing score document");
  }
}
