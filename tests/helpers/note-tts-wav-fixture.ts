export function speechWav({
  rate = 24000, channels = 1, bits = 16, format = 1, seconds = 0.02, silent = false,
}: { rate?: number; channels?: number; bits?: number; format?: number; seconds?: number; silent?: boolean } = {}): Uint8Array {
  const frames = Math.round(rate * seconds), frameBytes = channels * bits / 8;
  const bytes = new Uint8Array(44 + frames * frameBytes);
  const v = new DataView(bytes.buffer);
  for (const [off, text] of [[0, "RIFF"], [8, "WAVE"], [12, "fmt "], [36, "data"]] as const) {
    for (let i = 0; i < text.length; i++) bytes[off + i] = text.charCodeAt(i);
  }
  v.setUint32(4, bytes.length - 8, true); v.setUint32(16, 16, true);
  v.setUint16(20, format, true); v.setUint16(22, channels, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * frameBytes, true);
  v.setUint16(32, frameBytes, true); v.setUint16(34, bits, true); v.setUint32(40, frames * frameBytes, true);
  for (let i = 0; i < frames; i++) for (let ch = 0; ch < channels; ch++) {
    const sample = silent || (channels === 2 && ch === 0) ? 0 : [0.5, -0.5, 0.25, -0.25][i % 4];
    const off = 44 + i * frameBytes + ch * bits / 8;
    if (format === 3) v.setFloat32(off, sample, true);
    else if (bits === 8) v.setUint8(off, Math.round(sample * 128 + 128));
    else if (bits === 16) v.setInt16(off, sample * 32768, true);
    else if (bits === 24) {
      const value = sample * 8388608;
      bytes[off] = value & 255; bytes[off + 1] = value >> 8 & 255; bytes[off + 2] = value >> 16 & 255;
    } else v.setInt32(off, sample * 2147483648, true);
  }
  return bytes;
}
