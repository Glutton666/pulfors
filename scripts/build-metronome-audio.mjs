import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

// Original synthesis only: reference recording is never copied into app assets.
const sr = 44100;
function wav(pcm) {
  const out = Buffer.alloc(44 + pcm.length * 2);
  out.write("RIFF"); out.writeUInt32LE(out.length - 8, 4); out.write("WAVEfmt ", 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sr, 24); out.writeUInt32LE(sr * 2, 28);
  out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write("data", 36); out.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i++) out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), 44 + i * 2);
  return out;
}
fs.mkdirSync("assets/sounds/count", { recursive: true });
for (const [role, frequency, decay, level] of [
  ["strong", 2360, 0.008, 0.23], ["high", 2140, 0.009, 0.20], ["low", 1400, 0.014, 0.17],
]) {
  const pcm = Float32Array.from({ length: Math.round(sr * 0.11) }, (_, i) => {
    const t = i / sr;
    const onset = 1 - Math.exp(-t / 0.00055);
    const body = Math.sin(2 * Math.PI * frequency * t)
      + 0.07 * Math.sin(2 * Math.PI * frequency * 3 * t) * Math.exp(-t / 0.003);
    return level * onset * Math.exp(-t / decay) * Math.tanh(body * 1.35);
  });
  fs.writeFileSync(`assets/sounds/tempo-${role}.wav`, wav(pcm));
}
const report = {};
for (const [lang, count] of [["ko", 10], ["en", 17]]) {
  for (let n = 0; n < count; n++) {
    const source = `attached_assets/generated_audio/count_${lang}_${n}.mp3`;
    if (!fs.existsSync(source)) throw new Error(`Missing generated speech: ${source}`);
    const raw = execFileSync("ffmpeg", ["-v", "error", "-i", source, "-ac", "1", "-ar", String(sr), "-f", "f32le", "pipe:1"]);
    const pcm = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    const hop = 128;
    const rms = [];
    for (let i = 0; i < pcm.length; i += hop) {
      let e = 0; for (let j = i; j < Math.min(i + hop, pcm.length); j++) e += pcm[j] ** 2;
      rms.push(Math.sqrt(e / hop));
    }
    const threshold = Math.max(...rms) * 0.012;
    let first = rms.findIndex(e => e > threshold);
    let last = rms.findLastIndex(e => e > threshold);
    if (first < 0 || last < first) throw new Error(`Silent generated count: ${lang}/${n}`);
    const start = Math.max(0, first * hop - 64);
    const end = Math.min(pcm.length, (last + 1) * hop + Math.round(sr * 0.012));
    const clipped = pcm.slice(start, end);
    const peak = Math.max(...clipped.map(Math.abs));
    for (let i = 0; i < clipped.length; i++) {
      const edge = Math.min(1, i / 32, (clipped.length - 1 - i) / 64);
      clipped[i] = clipped[i] / peak * 0.8 * edge;
    }
    fs.writeFileSync(path.join("assets/sounds/count", `${lang}-${n}.wav`), wav(clipped));
    report[`${lang}-${n}`] = { durationMs: Math.round(clipped.length / sr * 1000), removedLeadMs: Math.round(start / sr * 1000) };
  }
}
fs.writeFileSync("assets/sounds/count/durations.json", JSON.stringify(report, null, 2) + "\n");
console.log(report);
