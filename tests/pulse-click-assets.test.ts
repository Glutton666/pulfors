import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { translations } from "@/lib/i18n.data";

const sampleRate = 44100;
const roles = [
  ["strong", 2360, 0.008, 0.23],
  ["high", 2140, 0.009, 0.20],
  ["low", 1400, 0.014, 0.17],
] as const;

function rms(samples: number[]) {
  return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
}

test("Pulse Click keeps its legacy sound ID and both display names agree", () => {
  expect(translations.soundSets.tempo).toEqual({ ko: "펄스 클릭", en: "Pulse Click" });
  expect(translations.barModeView.ssTempo).toEqual(translations.soundSets.tempo);
});

test("bundled clicks have a stronger initial strike, no clipping, and reproducible assets", () => {
  const output = mkdtempSync(join(tmpdir(), "pulse-click-"));
  try {
    execFileSync(process.execPath, [
      join(process.cwd(), "scripts/build-metronome-audio.mjs"), "--clicks-only",
    ], { cwd: output });
    const peaks: number[] = [];
    for (const [role, frequency, decay, level] of roles) {
      const relative = `assets/sounds/tempo-${role}.wav`;
      const wav = readFileSync(join(process.cwd(), relative));
      expect(readFileSync(join(output, relative))).toEqual(wav);
      expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
      expect(wav.readUInt32LE(24)).toBe(sampleRate);
      expect((wav.length - 44) / 2).toBe(Math.round(sampleRate * 0.11));
      const samples = Array.from({ length: (wav.length - 44) / 2 },
        (_, i) => wav.readInt16LE(44 + i * 2) / 32767);
      const firstStrike = samples.slice(0, Math.round(sampleRate * 0.003));
      const previousStrike = firstStrike.map((_, i) => {
        const t = i / sampleRate;
        const body = Math.sin(2 * Math.PI * frequency * t)
          + 0.07 * Math.sin(2 * Math.PI * frequency * 3 * t) * Math.exp(-t / 0.003);
        return level * (1 - Math.exp(-t / 0.00055)) * Math.exp(-t / decay) * Math.tanh(body * 1.35);
      });
      expect(rms(firstStrike)).toBeGreaterThan(rms(previousStrike) * 1.4);
      const peak = Math.max(...samples.map(Math.abs));
      expect(peak).toBeLessThan(0.95);
      expect(samples[0]).toBe(0);
      expect(Math.abs(samples[samples.length - 1])).toBeLessThan(0.0001);
      peaks.push(peak);
    }
    expect(peaks[0]).toBeGreaterThan(peaks[1]);
    expect(peaks[1]).toBeGreaterThan(peaks[2]);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
