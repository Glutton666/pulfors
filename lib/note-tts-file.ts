import { File } from "expo-file-system";
import type { NoteTtsResult } from "./note-tts";
import { normalizeNoteTtsWav } from "./note-tts-wav";

/** Overwrite only this request's durable file, never a renderer cache file. */
export async function prepareNoteTtsFile(result: NoteTtsResult, isCurrent: () => boolean): Promise<NoteTtsResult> {
  const file = new File(result.uri);
  if (!file.exists || file.size > 16 * 1024 * 1024) throw new Error("invalidAudio");
  const input = await file.bytes();
  if (!isCurrent()) return result;
  const normalized = normalizeNoteTtsWav(input);
  if (!isCurrent()) return result;
  file.write(normalized.bytes);
  return { uri: result.uri, duration: normalized.duration };
}
