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
  const duration = 0.035;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 110);
    const f0 = 2200 + 600 * Math.exp(-t * 200);
    let s = 0;
    s += Math.sin(2 * Math.PI * f0 * t) * 1.0;
    s += Math.sin(2 * Math.PI * f0 * 2.0 * t) * 0.4;
    s += Math.sin(2 * Math.PI * f0 * 3.0 * t) * 0.15;
    samples[i] = s * env;
  }
  return normalize(samples, 0.99);
}

function generateClassicLow() {
  const duration = 0.03;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 130);
    const f0 = 1500 + 400 * Math.exp(-t * 250);
    let s = 0;
    s += Math.sin(2 * Math.PI * f0 * t) * 1.0;
    s += Math.sin(2 * Math.PI * f0 * 2.0 * t) * 0.35;
    s += Math.sin(2 * Math.PI * f0 * 3.0 * t) * 0.1;
    samples[i] = s * env;
  }
  return normalize(samples, 0.99);
}

function generateWoodblockHigh() {
  const duration = 0.055;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 70);
    const f1 = 800 + 150 * Math.exp(-t * 40);
    const f2 = 2100 + 300 * Math.exp(-t * 60);
    let s = 0;
    s += Math.sin(2 * Math.PI * f1 * t) * 1.0;
    s += Math.sin(2 * Math.PI * f2 * t) * 0.55;
    s += Math.sin(2 * Math.PI * f1 * 2.8 * t) * Math.exp(-t * 100) * 0.2;
    samples[i] = s * env;
  }
  return normalize(samples, 0.99);
}

function generateWoodblockLow() {
  const duration = 0.06;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 60);
    const f1 = 550 + 100 * Math.exp(-t * 35);
    const f2 = 1400 + 200 * Math.exp(-t * 50);
    let s = 0;
    s += Math.sin(2 * Math.PI * f1 * t) * 1.0;
    s += Math.sin(2 * Math.PI * f2 * t) * 0.45;
    s += Math.sin(2 * Math.PI * f1 * 2.5 * t) * Math.exp(-t * 80) * 0.15;
    samples[i] = s * env;
  }
  return normalize(samples, 0.99);
}

function generateDigitalHigh() {
  const duration = 0.02;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 180);
    const freq = 2400;
    const sine1 = Math.sin(2 * Math.PI * freq * t);
    const sine2 = Math.sin(2 * Math.PI * freq * 2 * t);
    const sine3 = Math.sin(2 * Math.PI * freq * 0.5 * t);
    let s = sine1 * 1.0 + sine2 * 0.3 + sine3 * 0.2;
    samples[i] = s * env;
  }
  return normalize(samples, 0.99);
}

function generateDigitalLow() {
  const duration = 0.018;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 200);
    const freq = 1700;
    const sine1 = Math.sin(2 * Math.PI * freq * t);
    const sine2 = Math.sin(2 * Math.PI * freq * 2 * t);
    const sine3 = Math.sin(2 * Math.PI * freq * 0.5 * t);
    let s = sine1 * 1.0 + sine2 * 0.25 + sine3 * 0.15;
    samples[i] = s * env;
  }
  return normalize(samples, 0.99);
}

function generateRimshotHigh() {
  const duration = 0.07;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const bodyEnv = Math.exp(-t * 50);
    const body = Math.sin(2 * Math.PI * 400 * t) * 0.6
               + Math.sin(2 * Math.PI * 800 * t) * 0.25
               + Math.sin(2 * Math.PI * 1200 * t) * 0.1;

    const ringEnv = Math.exp(-t * 90);
    const ring = Math.sin(2 * Math.PI * 1800 * t) * 0.35
               + Math.sin(2 * Math.PI * 3000 * t) * 0.12;

    samples[i] = (body * bodyEnv + ring * ringEnv);
  }
  return normalize(samples, 0.99);
}

function generateRimshotLow() {
  const duration = 0.06;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const bodyEnv = Math.exp(-t * 60);
    const body = Math.sin(2 * Math.PI * 300 * t) * 0.5
               + Math.sin(2 * Math.PI * 600 * t) * 0.2
               + Math.sin(2 * Math.PI * 900 * t) * 0.08;

    const ringEnv = Math.exp(-t * 110);
    const ring = Math.sin(2 * Math.PI * 1400 * t) * 0.3
               + Math.sin(2 * Math.PI * 2400 * t) * 0.1;

    samples[i] = (body * bodyEnv + ring * ringEnv);
  }
  return normalize(samples, 0.99);
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

console.log("\nAll sound files generated!");
