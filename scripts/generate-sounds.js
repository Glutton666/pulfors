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

function normalize(samples) {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > max) max = abs;
  }
  if (max === 0) return samples;
  const scale = 1.0 / max;
  for (let i = 0; i < samples.length; i++) {
    samples[i] *= scale;
  }
  return samples;
}

function fadeOut(samples, fadeMs) {
  const fadeSamples = Math.floor(SAMPLE_RATE * fadeMs / 1000);
  const start = samples.length - fadeSamples;
  for (let i = start; i < samples.length; i++) {
    const ratio = (samples.length - i) / fadeSamples;
    samples[i] *= ratio;
  }
  return samples;
}

function generateClassicHigh() {
  const duration = 0.025;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 60);
    const f0 = 2500 + 800 * Math.exp(-t * 200);
    let s = 0;
    s += Math.sin(2 * Math.PI * f0 * t) * 1.0;
    s += Math.sin(2 * Math.PI * f0 * 2.0 * t) * 0.6;
    s += Math.sin(2 * Math.PI * f0 * 3.0 * t) * 0.3;
    s += Math.sin(2 * Math.PI * f0 * 0.5 * t) * 0.4;
    samples[i] = s * env;
  }
  return fadeOut(normalize(samples), 5);
}

function generateClassicLow() {
  const duration = 0.02;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 70);
    const f0 = 1800 + 500 * Math.exp(-t * 250);
    let s = 0;
    s += Math.sin(2 * Math.PI * f0 * t) * 1.0;
    s += Math.sin(2 * Math.PI * f0 * 2.0 * t) * 0.5;
    s += Math.sin(2 * Math.PI * f0 * 3.0 * t) * 0.2;
    s += Math.sin(2 * Math.PI * f0 * 0.5 * t) * 0.35;
    samples[i] = s * env;
  }
  return fadeOut(normalize(samples), 5);
}

function generateWoodblockHigh() {
  const duration = 0.035;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 50);
    const f1 = 900 + 200 * Math.exp(-t * 60);
    const f2 = 2300 + 300 * Math.exp(-t * 80);
    let s = 0;
    s += Math.sin(2 * Math.PI * f1 * t) * 1.0;
    s += Math.sin(2 * Math.PI * f2 * t) * 0.7;
    s += Math.sin(2 * Math.PI * f1 * 2.8 * t) * 0.4;
    samples[i] = s * env;
  }
  return fadeOut(normalize(samples), 5);
}

function generateWoodblockLow() {
  const duration = 0.04;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 45);
    const f1 = 600 + 150 * Math.exp(-t * 50);
    const f2 = 1500 + 200 * Math.exp(-t * 70);
    let s = 0;
    s += Math.sin(2 * Math.PI * f1 * t) * 1.0;
    s += Math.sin(2 * Math.PI * f2 * t) * 0.6;
    s += Math.sin(2 * Math.PI * f1 * 2.5 * t) * 0.3;
    samples[i] = s * env;
  }
  return fadeOut(normalize(samples), 5);
}

function generateDigitalHigh() {
  const duration = 0.015;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 80);
    const freq = 2600;
    let s = 0;
    s += Math.sin(2 * Math.PI * freq * t) * 1.0;
    s += Math.sin(2 * Math.PI * freq * 2.0 * t) * 0.5;
    s += Math.sin(2 * Math.PI * freq * 3.0 * t) * 0.25;
    s += Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.4;
    samples[i] = s * env;
  }
  return fadeOut(normalize(samples), 3);
}

function generateDigitalLow() {
  const duration = 0.012;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 90);
    const freq = 1900;
    let s = 0;
    s += Math.sin(2 * Math.PI * freq * t) * 1.0;
    s += Math.sin(2 * Math.PI * freq * 2.0 * t) * 0.45;
    s += Math.sin(2 * Math.PI * freq * 3.0 * t) * 0.2;
    s += Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.35;
    samples[i] = s * env;
  }
  return fadeOut(normalize(samples), 3);
}

function generateRimshotHigh() {
  const duration = 0.045;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 40);
    let s = 0;
    s += Math.sin(2 * Math.PI * 450 * t) * 0.8;
    s += Math.sin(2 * Math.PI * 900 * t) * 0.5;
    s += Math.sin(2 * Math.PI * 1350 * t) * 0.3;
    s += Math.sin(2 * Math.PI * 2000 * t) * 0.4;
    s += Math.sin(2 * Math.PI * 3200 * t) * 0.2;
    samples[i] = s * env;
  }
  return fadeOut(normalize(samples), 5);
}

function generateRimshotLow() {
  const duration = 0.04;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 45);
    let s = 0;
    s += Math.sin(2 * Math.PI * 350 * t) * 0.7;
    s += Math.sin(2 * Math.PI * 700 * t) * 0.4;
    s += Math.sin(2 * Math.PI * 1050 * t) * 0.2;
    s += Math.sin(2 * Math.PI * 1600 * t) * 0.35;
    s += Math.sin(2 * Math.PI * 2600 * t) * 0.15;
    samples[i] = s * env;
  }
  return fadeOut(normalize(samples), 5);
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
