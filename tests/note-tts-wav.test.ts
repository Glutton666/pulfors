import { normalizeNoteTtsWav } from "../lib/note-tts-wav";
import { speechWav } from "./helpers/note-tts-wav-fixture";
import { parseWav } from "../lib/audio-renderer";

test.each([[1, 8], [1, 16], [1, 24], [1, 32], [3, 32]])("normalizes format %s / %s bits to audible PCM16 mono at 44100 Hz", (format, bits) => {
  const { bytes, duration } = normalizeNoteTtsWav(speechWav({ format, bits }));
  const v = new DataView(bytes.buffer);
  expect(v.getUint16(20, true)).toBe(1);
  expect(v.getUint16(22, true)).toBe(1);
  expect(v.getUint16(34, true)).toBe(16);
  expect(v.getUint32(24, true)).toBe(44100);
  expect(v.getInt16(44, true) / 32768).toBeCloseTo(0.5, 4);
  expect(duration).toBeCloseTo(0.02, 5);
  expect(bytes.length).toBe(44 + Math.round(duration * 44100) * 2);
  const decoded = parseWav(bytes.buffer as ArrayBuffer);
  expect(decoded.sampleRate).toBe(44100);
  expect(decoded.pcm.length / decoded.sampleRate).toBe(duration);
  expect(decoded.pcm[0]).toBeCloseTo(0.5, 4);
});
test("stereo speech with silent left channel remains audible after mono conversion", () => {
  const { bytes } = normalizeNoteTtsWav(speechWav({ channels: 2 }));
  expect(new DataView(bytes.buffer).getInt16(44, true) / 32768).toBeCloseTo(0.25, 4);
});
test.each(["truncated", "silent", "codec", "channels", "rate", "alignment", "nan", "magic"])("rejects %s output before playback", kind => {
  let bytes = speechWav({ silent: kind === "silent", format: kind === "nan" ? 3 : 1, bits: kind === "nan" ? 32 : 16 });
  const v = new DataView(bytes.buffer);
  if (kind === "truncated") bytes = bytes.slice(0, -1);
  if (kind === "codec") v.setUint16(20, 6, true);
  if (kind === "channels") v.setUint16(22, 0, true);
  if (kind === "rate") v.setUint32(24, 0, true);
  if (kind === "alignment") v.setUint16(32, 7, true);
  if (kind === "nan") v.setFloat32(44, Number.NaN, true);
  if (kind === "magic") bytes[0] = 0;
  expect(() => normalizeNoteTtsWav(bytes)).toThrow("invalidAudio");
});
test("rejects a valid but overlong waveform and does not trust declared file size", () => {
  expect(() => normalizeNoteTtsWav(speechWav({ seconds: 30.01 }))).toThrow("tooLarge");
  const bytes = speechWav(); new DataView(bytes.buffer).setUint32(40, 0xffffffff, true);
  expect(() => normalizeNoteTtsWav(bytes)).toThrow("invalidAudio");
});
