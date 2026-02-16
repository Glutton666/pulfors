const fs = require("fs");
const path = require("path");

const SAMPLE_RATE = 44100;
const CHANNELS = 1;
const BITS = 16;

function writeWav(filePath, samples) {
  const numSamples = samples.length;
  const byteRate = SAMPLE_RATE * CHANNELS * (BITS / 8);
  const blockAlign = CHANNELS * (BITS / 8);
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(BITS, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const val = Math.max(-1, Math.min(1, samples[i]));
    const intVal = val < 0 ? val * 0x8000 : val * 0x7FFF;
    buffer.writeInt16LE(Math.round(intVal), 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
  console.log(`Written: ${filePath} (${numSamples} samples, ${(numSamples / SAMPLE_RATE * 1000).toFixed(0)}ms)`);
}

function normalize(samples, peak) {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > max) max = abs;
  }
  if (max === 0) return samples;
  const scale = peak / max;
  for (let i = 0; i < samples.length; i++) {
    samples[i] *= scale;
  }
  return samples;
}

function generateClassicHigh() {
  const duration = 0.03;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 150);
    const freq = 1800 + 800 * Math.exp(-t * 300);
    const s = Math.sin(2 * Math.PI * freq * t) * 0.8
            + Math.sin(2 * Math.PI * freq * 2.3 * t) * 0.25
            + Math.sin(2 * Math.PI * freq * 3.7 * t) * 0.15;
    const noise = (Math.random() * 2 - 1) * Math.exp(-t * 400) * 0.2;
    samples[i] = (s + noise) * env;
  }
  return normalize(samples, 0.98);
}

function generateClassicLow() {
  const duration = 0.025;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 180);
    const freq = 1200 + 400 * Math.exp(-t * 350);
    const s = Math.sin(2 * Math.PI * freq * t) * 0.8
            + Math.sin(2 * Math.PI * freq * 2.1 * t) * 0.2;
    const noise = (Math.random() * 2 - 1) * Math.exp(-t * 500) * 0.15;
    samples[i] = (s + noise) * env;
  }
  return normalize(samples, 0.95);
}

function generateWoodblockHigh() {
  const duration = 0.05;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 90);
    const f1 = 900 * Math.exp(-t * 30);
    const f2 = 2200 * Math.exp(-t * 50);
    const s = Math.sin(2 * Math.PI * f1 * t) * 0.6
            + Math.sin(2 * Math.PI * f2 * t) * 0.4
            + Math.sin(2 * Math.PI * 3400 * t) * Math.exp(-t * 150) * 0.2;
    const noise = (Math.random() * 2 - 1) * Math.exp(-t * 250) * 0.15;
    samples[i] = (s + noise) * env;
  }
  return normalize(samples, 0.98);
}

function generateWoodblockLow() {
  const duration = 0.06;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 70);
    const f1 = 600 * Math.exp(-t * 25);
    const f2 = 1500 * Math.exp(-t * 40);
    const s = Math.sin(2 * Math.PI * f1 * t) * 0.6
            + Math.sin(2 * Math.PI * f2 * t) * 0.35
            + Math.sin(2 * Math.PI * 2500 * t) * Math.exp(-t * 130) * 0.15;
    const noise = (Math.random() * 2 - 1) * Math.exp(-t * 200) * 0.12;
    samples[i] = (s + noise) * env;
  }
  return normalize(samples, 0.95);
}

function generateDigitalHigh() {
  const duration = 0.02;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 250);
    const freq = 2400;
    const sq = Math.sign(Math.sin(2 * Math.PI * freq * t)) * 0.5;
    const tri = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * freq * 1.5 * t)) * 0.35;
    const sine = Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.25;
    samples[i] = (sq + tri + sine) * env;
  }
  return normalize(samples, 0.98);
}

function generateDigitalLow() {
  const duration = 0.018;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 300);
    const freq = 1600;
    const sq = Math.sign(Math.sin(2 * Math.PI * freq * t)) * 0.45;
    const tri = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * freq * 1.5 * t)) * 0.3;
    const sine = Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.2;
    samples[i] = (sq + tri + sine) * env;
  }
  return normalize(samples, 0.95);
}

function generateRimshotHigh() {
  const duration = 0.065;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env1 = Math.exp(-t * 60);
    const env2 = Math.exp(-t * 150);
    const body = Math.sin(2 * Math.PI * 400 * t) * 0.4 * env1
               + Math.sin(2 * Math.PI * 800 * t) * 0.2 * env1;
    const crack = (Math.random() * 2 - 1) * 0.6 * env2;
    const ring = Math.sin(2 * Math.PI * 1800 * t) * 0.25 * Math.exp(-t * 120)
               + Math.sin(2 * Math.PI * 3200 * t) * 0.15 * Math.exp(-t * 200);
    samples[i] = body + crack + ring;
  }
  return normalize(samples, 0.98);
}

function generateRimshotLow() {
  const duration = 0.055;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env1 = Math.exp(-t * 80);
    const env2 = Math.exp(-t * 200);
    const body = Math.sin(2 * Math.PI * 300 * t) * 0.35 * env1
               + Math.sin(2 * Math.PI * 600 * t) * 0.15 * env1;
    const crack = (Math.random() * 2 - 1) * 0.45 * env2;
    const ring = Math.sin(2 * Math.PI * 1400 * t) * 0.2 * Math.exp(-t * 140);
    samples[i] = body + crack + ring;
  }
  return normalize(samples, 0.95);
}

const outDir = path.join(__dirname, "..", "assets", "sounds");
fs.mkdirSync(outDir, { recursive: true });

writeWav(path.join(outDir, "click-high.wav"), generateClassicHigh());
writeWav(path.join(outDir, "click-low.wav"), generateClassicLow());
writeWav(path.join(outDir, "woodblock-high.wav"), generateWoodblockHigh());
writeWav(path.join(outDir, "woodblock-low.wav"), generateWoodblockLow());
writeWav(path.join(outDir, "digital-high.wav"), generateDigitalHigh());
writeWav(path.join(outDir, "digital-low.wav"), generateDigitalLow());
writeWav(path.join(outDir, "rimshot-high.wav"), generateRimshotHigh());
writeWav(path.join(outDir, "rimshot-low.wav"), generateRimshotLow());

console.log("\nAll sound files generated successfully!");
