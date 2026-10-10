import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const sr = 44100;
const folder = "assets/sounds/count";
const legacy = JSON.parse(fs.readFileSync(`${folder}/durations.json`, "utf8"));
const report = {};
function encode(pcm) {
  const b = Buffer.alloc(44 + pcm.length * 2);
  b.write("RIFF"); b.writeUInt32LE(b.length - 8, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(pcm.length * 2, 40);
  pcm.forEach((v, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2));
  return b;
}
for (const [language, count] of [["ko", 10], ["en", 17]]) {
  for (const speaker of ["male", "female"]) {
    const sequenceSource = language === "ko"
      ? `attached_assets/generated_audio/count_sequence_ko_${speaker}.mp3`
      : null;
    let sequence;
    let segments;
    if (sequenceSource && fs.existsSync(sequenceSource)) {
      const analysis = spawnSync("ffmpeg", ["-hide_banner", "-i", sequenceSource,
        "-af", "silencedetect=n=-36dB:d=0.06", "-f", "null", "-"], { encoding: "utf8" });
      if (analysis.status !== 0) throw new Error(analysis.stderr);
      const raw = execFileSync("ffmpeg", ["-v", "error", "-i", sequenceSource,
        "-ac", "1", "-ar", String(sr), "-f", "f32le", "pipe:1"], { maxBuffer: 8 * 1024 * 1024 });
      sequence = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
      const silences = [...analysis.stderr.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)]
        .map(m => [Number(m[1]), Number(m[2])]);
      segments = [];
      let cursor = 0;
      for (const [start, end] of silences) {
        if (start - cursor > 0.08) segments.push([cursor, start]);
        cursor = end;
      }
      if (sequence.length / sr - cursor > 0.08) segments.push([cursor, sequence.length / sr]);
      if (segments.length !== count) {
        throw new Error(`${language}/${speaker}: ${segments.length} detected chunks, expected ${count}`);
      }
    }
    for (let n = 0; n < count; n++) {
      const source = language === "en" && speaker === "male" && n === 14
        ? "attached_assets/generated_audio/count_en_male_14_2.mp3"
        : `attached_assets/generated_audio/count_${language}_${speaker}_${n}.mp3`;
      const raw = execFileSync("ffmpeg", ["-v", "error", "-i", source,
        "-ac", "1", "-ar", String(sr), "-f", "f32le", "pipe:1"]);
      const individual = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
      const original = sequence
        ? sequence.slice(Math.max(0, Math.floor((segments[n][0] - 0.03) * sr)),
          Math.min(sequence.length, Math.ceil((segments[n][1] + 0.04) * sr)))
        : individual;
      // Modest offline WSOLA compression preserves pitch and every syllable.
      // It never changes playback rate, count event onset or metronome BPM.
      const compressed = execFileSync("ffmpeg", ["-v", "error", "-f", "f32le",
        "-ar", String(sr), "-ac", "1", "-i", "pipe:0", "-af", "atempo=1.15",
        "-f", "f32le", "pipe:1"], { input: Buffer.from(original.buffer, original.byteOffset, original.byteLength) });
      const pcm = new Float32Array(compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength));
      const hop = 128, rms = [];
      for (let i = 0; i < pcm.length; i += hop) {
        let e = 0;
        for (let j = i; j < Math.min(i + hop, pcm.length); j++) e += pcm[j] ** 2;
        rms.push(Math.sqrt(e / hop));
      }
      // Conservative low threshold + padding retain quiet consonants/endings.
      const threshold = Math.max(...rms) * 0.006;
      const first = rms.findIndex(v => v > threshold);
      const last = rms.findLastIndex(v => v > threshold);
      if (first < 0) throw new Error(`Silent count ${language}/${speaker}/${n}`);
      const start = Math.max(0, first * hop - Math.round(sr * 0.006));
      const end = Math.min(pcm.length, (last + 1) * hop + Math.round(sr * 0.02));
      const clipped = pcm.slice(start, end);
      let peak = 0;
      for (const v of clipped) peak = Math.max(peak, Math.abs(v));
      for (let i = 0; i < clipped.length; i++) {
        clipped[i] *= 0.8 / peak * Math.min(1, i / 32, (clipped.length - 1 - i) / 64);
      }
      fs.writeFileSync(`${folder}/${language}-${speaker}-${n}.wav`, encode(clipped));
      report[`${language}-${speaker}-${n}`] = {
        durationMs: Math.round(clipped.length / sr * 1000),
        previousDurationMs: legacy[`${language}-${n}`].durationMs,
        sourceDurationMs: Math.round(original.length / sr * 1000),
        removedLeadMs: Math.round(start / sr * 1000),
        source: sequence ? sequenceSource : source,
        pitchPreservingTempo: 1.15,
      };
    }
  }
}
fs.writeFileSync(`${folder}/catalog-durations.json`, JSON.stringify(report, null, 2) + "\n");
console.table(report);
