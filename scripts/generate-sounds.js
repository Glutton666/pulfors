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

function envelope(t, attack, decay, sustain, release, duration) {
  if (t < attack) return t / attack;
  if (t < attack + decay) return 1 - (1 - sustain) * ((t - attack) / decay);
  if (t < duration - release) return sustain;
  return sustain * (1 - (t - (duration - release)) / release);
}

function generateClassicHigh() {
  const duration = 0.025;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 200) * 0.95;
    const freq = 1800 + 800 * Math.exp(-t * 300);
    const s = Math.sin(2 * Math.PI * freq * t) * 0.7
            + Math.sin(2 * Math.PI * freq * 2.3 * t) * 0.15
            + Math.sin(2 * Math.PI * freq * 3.7 * t) * 0.08;
    const noise = (Math.random() * 2 - 1) * Math.exp(-t * 500) * 0.15;
    samples[i] = (s + noise) * env;
  }
  return samples;
}

function generateClassicLow() {
  const duration = 0.02;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 250) * 0.75;
    const freq = 1200 + 400 * Math.exp(-t * 350);
    const s = Math.sin(2 * Math.PI * freq * t) * 0.7
            + Math.sin(2 * Math.PI * freq * 2.1 * t) * 0.12;
    const noise = (Math.random() * 2 - 1) * Math.exp(-t * 600) * 0.1;
    samples[i] = (s + noise) * env;
  }
  return samples;
}

function generateWoodblockHigh() {
  const duration = 0.045;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 120) * 0.85;
    const f1 = 900 * Math.exp(-t * 30);
    const f2 = 2200 * Math.exp(-t * 50);
    const s = Math.sin(2 * Math.PI * f1 * t) * 0.5
            + Math.sin(2 * Math.PI * f2 * t) * 0.3
            + Math.sin(2 * Math.PI * 3400 * t) * Math.exp(-t * 200) * 0.15;
    const noise = (Math.random() * 2 - 1) * Math.exp(-t * 300) * 0.12;
    samples[i] = (s + noise) * env;
  }
  return samples;
}

function generateWoodblockLow() {
  const duration = 0.055;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 90) * 0.75;
    const f1 = 600 * Math.exp(-t * 25);
    const f2 = 1500 * Math.exp(-t * 40);
    const s = Math.sin(2 * Math.PI * f1 * t) * 0.5
            + Math.sin(2 * Math.PI * f2 * t) * 0.25
            + Math.sin(2 * Math.PI * 2500 * t) * Math.exp(-t * 180) * 0.1;
    const noise = (Math.random() * 2 - 1) * Math.exp(-t * 250) * 0.1;
    samples[i] = (s + noise) * env;
  }
  return samples;
}

function generateDigitalHigh() {
  const duration = 0.015;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 350) * 0.9;
    const freq = 2400;
    const sq = Math.sign(Math.sin(2 * Math.PI * freq * t)) * 0.4;
    const tri = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * freq * 1.5 * t)) * 0.3;
    const sine = Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.2;
    samples[i] = (sq + tri + sine) * env;
  }
  return samples;
}

function generateDigitalLow() {
  const duration = 0.012;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 400) * 0.7;
    const freq = 1600;
    const sq = Math.sign(Math.sin(2 * Math.PI * freq * t)) * 0.35;
    const tri = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * freq * 1.5 * t)) * 0.25;
    const sine = Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.15;
    samples[i] = (sq + tri + sine) * env;
  }
  return samples;
}

function generateRimshotHigh() {
  const duration = 0.06;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env1 = Math.exp(-t * 80);
    const env2 = Math.exp(-t * 200);
    const body = Math.sin(2 * Math.PI * 400 * t) * 0.3 * env1
               + Math.sin(2 * Math.PI * 800 * t) * 0.15 * env1;
    const crack = (Math.random() * 2 - 1) * 0.5 * env2;
    const ring = Math.sin(2 * Math.PI * 1800 * t) * 0.2 * Math.exp(-t * 150)
               + Math.sin(2 * Math.PI * 3200 * t) * 0.1 * Math.exp(-t * 250);
    samples[i] = (body + crack + ring) * 0.85;
  }
  return samples;
}

function generateRimshotLow() {
  const duration = 0.05;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env1 = Math.exp(-t * 100);
    const env2 = Math.exp(-t * 250);
    const body = Math.sin(2 * Math.PI * 300 * t) * 0.25 * env1
               + Math.sin(2 * Math.PI * 600 * t) * 0.1 * env1;
    const crack = (Math.random() * 2 - 1) * 0.35 * env2;
    const ring = Math.sin(2 * Math.PI * 1400 * t) * 0.15 * Math.exp(-t * 180);
    samples[i] = (body + crack + ring) * 0.7;
  }
  return samples;
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
