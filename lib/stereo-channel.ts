export type SampleChannel = "both" | "left" | "right";
export type MetroChannel = SampleChannel | "off";

export function isSampleChannel(v: unknown): v is SampleChannel {
  return v === "both" || v === "left" || v === "right";
}

export function normalizeSampleChannel(v: unknown): SampleChannel {
  return isSampleChannel(v) ? v : "both";
}

export function isMetroChannel(v: unknown): v is MetroChannel {
  return v === "both" || v === "left" || v === "right" || v === "off";
}

export function normalizeMetroChannel(v: unknown): MetroChannel {
  return isMetroChannel(v) ? v : "both";
}

function writeStr(v: DataView, off: number, s: string) {
  for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
}

export function encodeStereoWavBuffer(
  monoPcm: Float32Array,
  sampleRate: number,
  channel: "left" | "right",
): ArrayBuffer {
  const n = monoPcm.length;
  const numChannels = 2;
  const bytesPerSample = 2;
  const dataSize = n * numChannels * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  writeStr(v, 0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  writeStr(v, 8, "WAVE");
  writeStr(v, 12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, numChannels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  v.setUint16(32, numChannels * bytesPerSample, true);
  v.setUint16(34, 16, true);
  writeStr(v, 36, "data");
  v.setUint32(40, dataSize, true);
  const fillLeft = channel === "left";
  for (let i = 0; i < n; i++) {
    const s = monoPcm[i];
    const clamped = s < -1 ? -1 : s > 1 ? 1 : s;
    const int16 = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
    const off = 44 + i * 4;
    if (fillLeft) {
      v.setInt16(off, int16, true);
      v.setInt16(off + 2, 0, true);
    } else {
      v.setInt16(off, 0, true);
      v.setInt16(off + 2, int16, true);
    }
  }
  return buf;
}

export function parseStereoWavBuffer(
  buf: ArrayBuffer,
): { left: Float32Array; right: Float32Array; sampleRate: number; numChannels: number } {
  const v = new DataView(buf);
  if (v.byteLength < 44) throw new Error("WAV too small");
  const numChannels = v.getUint16(22, true);
  const sampleRate = v.getUint32(24, true);
  const bps = v.getUint16(34, true);
  if (bps !== 16) throw new Error("expected 16-bit");
  let off = 12;
  let dataOff = -1;
  let dataSz = 0;
  while (off < v.byteLength - 8) {
    const id =
      String.fromCharCode(v.getUint8(off)) +
      String.fromCharCode(v.getUint8(off + 1)) +
      String.fromCharCode(v.getUint8(off + 2)) +
      String.fromCharCode(v.getUint8(off + 3));
    const sz = v.getUint32(off + 4, true);
    if (id === "data") {
      dataOff = off + 8;
      dataSz = sz;
      break;
    }
    off += 8 + sz + (sz % 2);
  }
  if (dataOff < 0) throw new Error("no data chunk");
  const frameSize = numChannels * 2;
  const numFrames = Math.floor(dataSz / frameSize);
  const left = new Float32Array(numFrames);
  const right = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) {
    const base = dataOff + i * frameSize;
    left[i] = v.getInt16(base, true) / 32768;
    if (numChannels >= 2) right[i] = v.getInt16(base + 2, true) / 32768;
  }
  return { left, right, sampleRate, numChannels };
}

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let result = "";
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    result += B64_CHARS[a >> 2];
    result += B64_CHARS[((a & 0x03) << 4) | (b >> 4)];
    result += B64_CHARS[((b & 0x0f) << 2) | (c >> 6)];
    result += B64_CHARS[c & 0x3f];
  }
  if (i < bytes.length) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    result += B64_CHARS[a >> 2];
    result += B64_CHARS[((a & 0x03) << 4) | (b >> 4)];
    if (i + 1 < bytes.length) {
      result += B64_CHARS[(b & 0x0f) << 2];
      result += "=";
    } else {
      result += "==";
    }
  }
  return result;
}

export function encodeStereoWavBase64(
  monoPcm: Float32Array,
  sampleRate: number,
  channel: "left" | "right",
): string {
  return arrayBufferToBase64(encodeStereoWavBuffer(monoPcm, sampleRate, channel));
}
