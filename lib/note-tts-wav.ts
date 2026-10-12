import { NOTE_TTS_MAX_DURATION } from "./note-tts";

/** Validate complete engine output, then emit the format both playback paths use. */
export function normalizeNoteTtsWav(input: Uint8Array): { bytes: Uint8Array; duration: number } {
  const invalid = () => { throw new Error("invalidAudio"); };
  if (input.byteLength < 44 || input.byteLength > 16 * 1024 * 1024) return invalid();
  const v = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const tag = (off: number) => String.fromCharCode(...input.subarray(off, off + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return invalid();
  const limit = v.getUint32(4, true) + 8;
  if (limit > input.byteLength || limit < 44) return invalid();
  let fmt = -1, data = -1, dataSize = 0;
  for (let off = 12; off + 8 <= limit;) {
    const size = v.getUint32(off + 4, true);
    if (off + 8 + size > limit) return invalid();
    if (tag(off) === "fmt ") {
      if (size < 16 || fmt !== -1) return invalid();
      fmt = off + 8;
    } else if (tag(off) === "data") {
      if (data !== -1) return invalid();
      data = off + 8; dataSize = size;
    }
    off += 8 + size + (size % 2);
  }
  if (fmt < 0 || data < 0 || dataSize === 0) return invalid();
  const format = v.getUint16(fmt, true), channels = v.getUint16(fmt + 2, true);
  const rate = v.getUint32(fmt + 4, true), bits = v.getUint16(fmt + 14, true);
  if (!(channels === 1 || channels === 2) || rate < 8000 || rate > 192000 ||
      !((format === 1 && [8, 16, 24, 32].includes(bits)) || (format === 3 && bits === 32))) return invalid();
  const frameBytes = channels * bits / 8;
  if (v.getUint16(fmt + 12, true) !== frameBytes || dataSize % frameBytes !== 0) return invalid();
  const frames = dataSize / frameBytes;
  if (frames / rate > NOTE_TTS_MAX_DURATION) throw new Error("tooLarge");
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const off = data + i * frameBytes + ch * bits / 8;
      let sample: number;
      if (format === 3) sample = v.getFloat32(off, true);
      else if (bits === 8) sample = (v.getUint8(off) - 128) / 128;
      else if (bits === 16) sample = v.getInt16(off, true) / 32768;
      else if (bits === 24) {
        const raw = v.getUint8(off) | v.getUint8(off + 1) << 8 | v.getInt8(off + 2) << 16;
        sample = raw / 8388608;
      } else sample = v.getInt32(off, true) / 2147483648;
      if (!Number.isFinite(sample)) return invalid();
      mono[i] += sample / channels;
    }
  }
  const outputRate = 44100;
  const length = Math.round(frames * outputRate / rate);
  if (!length) return invalid();
  const bytes = new Uint8Array(44 + length * 2);
  const out = new DataView(bytes.buffer);
  const writeTag = (off: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[off + i] = value.charCodeAt(i);
  };
  writeTag(0, "RIFF"); out.setUint32(4, bytes.length - 8, true); writeTag(8, "WAVE");
  writeTag(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true);
  out.setUint16(22, 1, true); out.setUint32(24, outputRate, true); out.setUint32(28, outputRate * 2, true);
  out.setUint16(32, 2, true); out.setUint16(34, 16, true); writeTag(36, "data");
  out.setUint32(40, length * 2, true);
  let audible = false;
  for (let i = 0; i < length; i++) {
    const position = i * rate / outputRate, index = Math.floor(position);
    const a = mono[Math.min(index, frames - 1)], b = mono[Math.min(index + 1, frames - 1)];
    const sample = Math.max(-1, Math.min(1, a + (b - a) * (position - index)));
    const quantized = Math.round(sample * (sample < 0 ? 32768 : 32767));
    audible ||= quantized !== 0;
    out.setInt16(44 + i * 2, quantized, true);
  }
  if (!audible) return invalid();
  return { bytes, duration: length / outputRate };
}
