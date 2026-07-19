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
  console.log(`Written: ${filePath} (${numSamples} samples, ${(numSamples / SAMPLE_RATE * 1000).toFixed(1)}ms)`);
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

function softAttack(samples, attackMs) {
  const attackSamples = Math.floor(SAMPLE_RATE * attackMs / 1000);
  for (let i = 0; i < Math.min(attackSamples, samples.length); i++) {
    const ratio = i / attackSamples;
    samples[i] *= ratio * ratio;
  }
  return samples;
}

// ─── Classic ────────────────────────────────────────────────────────────────

function generateClassicHigh() {
  const duration = 0.018;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 80);
    const f0 = 2500 + 800 * Math.exp(-t * 200);
    let s = 0;
    s += Math.sin(2 * Math.PI * f0 * t) * 1.0;
    s += Math.sin(2 * Math.PI * f0 * 2.0 * t) * 0.5;
    s += Math.sin(2 * Math.PI * f0 * 3.0 * t) * 0.2;
    s += Math.sin(2 * Math.PI * f0 * 0.5 * t) * 0.3;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.3), 4);
}

function generateClassicLow() {
  const duration = 0.015;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 90);
    const f0 = 1800 + 500 * Math.exp(-t * 250);
    let s = 0;
    s += Math.sin(2 * Math.PI * f0 * t) * 1.0;
    s += Math.sin(2 * Math.PI * f0 * 2.0 * t) * 0.4;
    s += Math.sin(2 * Math.PI * f0 * 3.0 * t) * 0.15;
    s += Math.sin(2 * Math.PI * f0 * 0.5 * t) * 0.25;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.3), 3);
}

function generateClassicStrong() {
  const duration = 0.025;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 60);
    const f0 = 3200 + 1200 * Math.exp(-t * 150);
    let s = 0;
    s += Math.sin(2 * Math.PI * f0 * t) * 1.0;
    s += Math.sin(2 * Math.PI * f0 * 2.0 * t) * 0.7;
    s += Math.sin(2 * Math.PI * f0 * 3.0 * t) * 0.4;
    s += Math.sin(2 * Math.PI * f0 * 0.5 * t) * 0.5;
    s += Math.sin(2 * Math.PI * f0 * 4.0 * t) * 0.2;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.2), 4);
}

// ─── Woodblock ───────────────────────────────────────────────────────────────

function generateWoodblockHigh() {
  const duration = 0.025;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 65);
    const f1 = 900 + 200 * Math.exp(-t * 60);
    const f2 = 2300 + 300 * Math.exp(-t * 80);
    let s = 0;
    s += Math.sin(2 * Math.PI * f1 * t) * 1.0;
    s += Math.sin(2 * Math.PI * f2 * t) * 0.6;
    s += Math.sin(2 * Math.PI * f1 * 2.8 * t) * 0.3;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.3), 4);
}

function generateWoodblockLow() {
  const duration = 0.028;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 60);
    const f1 = 600 + 150 * Math.exp(-t * 50);
    const f2 = 1500 + 200 * Math.exp(-t * 70);
    let s = 0;
    s += Math.sin(2 * Math.PI * f1 * t) * 1.0;
    s += Math.sin(2 * Math.PI * f2 * t) * 0.5;
    s += Math.sin(2 * Math.PI * f1 * 2.5 * t) * 0.25;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.3), 4);
}

function generateWoodblockStrong() {
  const duration = 0.032;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 50);
    const f1 = 1100 + 300 * Math.exp(-t * 50);
    const f2 = 2800 + 500 * Math.exp(-t * 70);
    let s = 0;
    s += Math.sin(2 * Math.PI * f1 * t) * 1.0;
    s += Math.sin(2 * Math.PI * f2 * t) * 0.75;
    s += Math.sin(2 * Math.PI * f1 * 2.8 * t) * 0.5;
    s += Math.sin(2 * Math.PI * f1 * 4.0 * t) * 0.2;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.2), 4);
}

// ─── Digital ─────────────────────────────────────────────────────────────────

function generateDigitalHigh() {
  const duration = 0.010;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 110);
    const freq = 2600;
    let s = 0;
    s += Math.sin(2 * Math.PI * freq * t) * 1.0;
    s += Math.sin(2 * Math.PI * freq * 2.0 * t) * 0.4;
    s += Math.sin(2 * Math.PI * freq * 3.0 * t) * 0.2;
    s += Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.3;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.2), 2);
}

function generateDigitalLow() {
  const duration = 0.008;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 120);
    const freq = 1900;
    let s = 0;
    s += Math.sin(2 * Math.PI * freq * t) * 1.0;
    s += Math.sin(2 * Math.PI * freq * 2.0 * t) * 0.35;
    s += Math.sin(2 * Math.PI * freq * 3.0 * t) * 0.15;
    s += Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.25;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.2), 2);
}

function generateDigitalStrong() {
  const duration = 0.014;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 80);
    const freq = 3200;
    let s = 0;
    s += Math.sin(2 * Math.PI * freq * t) * 1.0;
    s += Math.sin(2 * Math.PI * freq * 2.0 * t) * 0.6;
    s += Math.sin(2 * Math.PI * freq * 3.0 * t) * 0.3;
    s += Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.5;
    s += Math.sin(2 * Math.PI * freq * 4.0 * t) * 0.2;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.15), 3);
}

// ─── Jamblock (재구성) ────────────────────────────────────────────────────────
// 합성 플라스틱 블록: 날카로운 공격음 + 짧은 플라스틱 공명 (600~900 Hz 중심)
// 세 파일 모두 동일 길이: 22ms

function generateJamblockHigh() {
  const duration = 0.022;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 130);
    const f0 = 860 + 400 * Math.exp(-t * 300);
    let s = 0;
    s += Math.sin(2 * Math.PI * f0 * t) * 1.0;
    s += Math.sin(2 * Math.PI * f0 * 2.3 * t) * 0.5;
    s += Math.sin(2 * Math.PI * f0 * 3.7 * t) * 0.25;
    s += Math.sin(2 * Math.PI * f0 * 5.1 * t) * 0.12;
    s += Math.sin(2 * Math.PI * 4200 * t) * 0.08 * Math.exp(-t * 400);
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.15), 3);
}

function generateJamblockLow() {
  const duration = 0.022;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 120);
    const f0 = 650 + 280 * Math.exp(-t * 280);
    let s = 0;
    s += Math.sin(2 * Math.PI * f0 * t) * 1.0;
    s += Math.sin(2 * Math.PI * f0 * 2.3 * t) * 0.45;
    s += Math.sin(2 * Math.PI * f0 * 3.7 * t) * 0.2;
    s += Math.sin(2 * Math.PI * f0 * 5.1 * t) * 0.1;
    s += Math.sin(2 * Math.PI * 3200 * t) * 0.07 * Math.exp(-t * 380);
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.15), 3);
}

function generateJamblockStrong() {
  const duration = 0.022;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 100);
    const f0 = 960 + 600 * Math.exp(-t * 320);
    let s = 0;
    s += Math.sin(2 * Math.PI * f0 * t) * 1.0;
    s += Math.sin(2 * Math.PI * f0 * 2.3 * t) * 0.6;
    s += Math.sin(2 * Math.PI * f0 * 3.7 * t) * 0.35;
    s += Math.sin(2 * Math.PI * f0 * 5.1 * t) * 0.18;
    s += Math.sin(2 * Math.PI * 5200 * t) * 0.1 * Math.exp(-t * 450);
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.1), 3);
}

// ─── Sine ────────────────────────────────────────────────────────────────────
// 순정 사인파 기반 전자 메트로놈: 따뜻하고 피로감 없는 음색
// high: A4=440Hz / low: D4=294Hz / strong: E5=659Hz
// 세 파일 모두 동일 길이: 40ms

function generateSineHigh() {
  const duration = 0.040;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  const freq = 440;
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 35);
    samples[i] = Math.sin(2 * Math.PI * freq * t) * env;
  }
  return fadeOut(softAttack(normalize(samples), 1.0), 6);
}

function generateSineLow() {
  const duration = 0.040;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  const freq = 294;
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 32);
    samples[i] = Math.sin(2 * Math.PI * freq * t) * env;
  }
  return fadeOut(softAttack(normalize(samples), 1.0), 6);
}

function generateSineStrong() {
  const duration = 0.040;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  const freq = 659;
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 40);
    samples[i] = Math.sin(2 * Math.PI * freq * t) * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.8), 6);
}

// ─── Blip ─────────────────────────────────────────────────────────────────────
// FM 합성 짧은 전자 비프: 드럼머신 스타일, 빠른 BPM에서도 겹치지 않게 매우 짧음
// 세 파일 모두 동일 길이: 15ms

function generateBlipHigh() {
  const duration = 0.015;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  const carrier = 1200;
  const modFreq = 1200;
  const modDepth = 400;
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 200);
    const mod = modDepth * Math.sin(2 * Math.PI * modFreq * t) * Math.exp(-t * 300);
    samples[i] = Math.sin(2 * Math.PI * (carrier + mod) * t) * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.3), 2);
}

function generateBlipLow() {
  const duration = 0.015;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  const carrier = 800;
  const modFreq = 800;
  const modDepth = 260;
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 190);
    const mod = modDepth * Math.sin(2 * Math.PI * modFreq * t) * Math.exp(-t * 280);
    samples[i] = Math.sin(2 * Math.PI * (carrier + mod) * t) * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.3), 2);
}

function generateBlipStrong() {
  const duration = 0.015;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  const carrier = 1600;
  const modFreq = 1600;
  const modDepth = 600;
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 210);
    const mod = modDepth * Math.sin(2 * Math.PI * modFreq * t) * Math.exp(-t * 320);
    samples[i] = Math.sin(2 * Math.PI * (carrier + mod) * t) * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.2), 2);
}

// ─── Clave ────────────────────────────────────────────────────────────────────
// 쿠바 클라베 스틱: 2~3 kHz 중심의 날카로운 클릭 + 짧은 나무 공명
// 세 파일 모두 동일 길이: 25ms

function generateClaveHigh() {
  const duration = 0.025;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 120);
    let s = 0;
    s += Math.sin(2 * Math.PI * 2500 * t) * 1.0;
    s += Math.sin(2 * Math.PI * 3800 * t) * 0.55;
    s += Math.sin(2 * Math.PI * 5200 * t) * 0.25;
    s += Math.sin(2 * Math.PI * 1300 * t) * 0.3;
    s += Math.sin(2 * Math.PI * 7100 * t) * 0.1;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.15), 3);
}

function generateClaveLow() {
  const duration = 0.025;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 110);
    let s = 0;
    s += Math.sin(2 * Math.PI * 2000 * t) * 1.0;
    s += Math.sin(2 * Math.PI * 3100 * t) * 0.5;
    s += Math.sin(2 * Math.PI * 4400 * t) * 0.22;
    s += Math.sin(2 * Math.PI * 1000 * t) * 0.28;
    s += Math.sin(2 * Math.PI * 5900 * t) * 0.08;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.15), 3);
}

function generateClaveStrong() {
  const duration = 0.025;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 100);
    let s = 0;
    s += Math.sin(2 * Math.PI * 2900 * t) * 1.0;
    s += Math.sin(2 * Math.PI * 4500 * t) * 0.6;
    s += Math.sin(2 * Math.PI * 6200 * t) * 0.3;
    s += Math.sin(2 * Math.PI * 1600 * t) * 0.35;
    s += Math.sin(2 * Math.PI * 8000 * t) * 0.12;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.1), 3);
}

// ─── Cajon ────────────────────────────────────────────────────────────────────
// 카혼 손가락 탭: 200~400 Hz 나무 상자 공명 + 표면 마찰음
// high: 타격 위치 높음(가장자리) / low: 중앙 탭 / strong: 강한 슬랩
// 세 파일 모두 동일 길이: 35ms

function generateCajonHigh() {
  const duration = 0.035;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const bodyEnv = Math.exp(-t * 70);
    const surfaceEnv = Math.exp(-t * 250);
    let s = 0;
    s += Math.sin(2 * Math.PI * 380 * t) * bodyEnv * 1.0;
    s += Math.sin(2 * Math.PI * 760 * t) * bodyEnv * 0.4;
    s += Math.sin(2 * Math.PI * 1140 * t) * bodyEnv * 0.15;
    s += Math.sin(2 * Math.PI * 1800 * t) * surfaceEnv * 0.35;
    s += Math.sin(2 * Math.PI * 3200 * t) * surfaceEnv * 0.15;
    samples[i] = s;
  }
  return fadeOut(softAttack(normalize(samples), 0.2), 5);
}

function generateCajonLow() {
  const duration = 0.035;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const bodyEnv = Math.exp(-t * 60);
    const surfaceEnv = Math.exp(-t * 200);
    let s = 0;
    s += Math.sin(2 * Math.PI * 260 * t) * bodyEnv * 1.0;
    s += Math.sin(2 * Math.PI * 520 * t) * bodyEnv * 0.35;
    s += Math.sin(2 * Math.PI * 780 * t) * bodyEnv * 0.12;
    s += Math.sin(2 * Math.PI * 1400 * t) * surfaceEnv * 0.28;
    s += Math.sin(2 * Math.PI * 2500 * t) * surfaceEnv * 0.1;
    samples[i] = s;
  }
  return fadeOut(softAttack(normalize(samples), 0.2), 5);
}

function generateCajonStrong() {
  const duration = 0.035;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const bodyEnv = Math.exp(-t * 55);
    const surfaceEnv = Math.exp(-t * 280);
    let s = 0;
    s += Math.sin(2 * Math.PI * 300 * t) * bodyEnv * 1.0;
    s += Math.sin(2 * Math.PI * 600 * t) * bodyEnv * 0.5;
    s += Math.sin(2 * Math.PI * 900 * t) * bodyEnv * 0.2;
    s += Math.sin(2 * Math.PI * 2200 * t) * surfaceEnv * 0.45;
    s += Math.sin(2 * Math.PI * 4000 * t) * surfaceEnv * 0.2;
    samples[i] = s;
  }
  return fadeOut(softAttack(normalize(samples), 0.15), 5);
}

// ─── Marimba ─────────────────────────────────────────────────────────────────
// 마림바 말렛 타격: 순수한 배음 구조(기본음 + 4배음 강조), 부드러운 어택
// high: C5=523Hz / low: G4=392Hz / strong: G5=784Hz
// 세 파일 모두 동일 길이: 60ms

function generateMarimbaHigh() {
  const duration = 0.060;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  const f0 = 523;
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 28);
    let s = 0;
    s += Math.sin(2 * Math.PI * f0 * t) * 1.0;
    s += Math.sin(2 * Math.PI * f0 * 4.0 * t) * 0.55;
    s += Math.sin(2 * Math.PI * f0 * 2.0 * t) * 0.18;
    s += Math.sin(2 * Math.PI * f0 * 3.0 * t) * 0.08;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 1.2), 8);
}

function generateMarimbaLow() {
  const duration = 0.060;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  const f0 = 392;
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 24);
    let s = 0;
    s += Math.sin(2 * Math.PI * f0 * t) * 1.0;
    s += Math.sin(2 * Math.PI * f0 * 4.0 * t) * 0.5;
    s += Math.sin(2 * Math.PI * f0 * 2.0 * t) * 0.15;
    s += Math.sin(2 * Math.PI * f0 * 3.0 * t) * 0.07;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 1.2), 8);
}

function generateMarimbaStrong() {
  const duration = 0.060;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  const f0 = 784;
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 32);
    let s = 0;
    s += Math.sin(2 * Math.PI * f0 * t) * 1.0;
    s += Math.sin(2 * Math.PI * f0 * 4.0 * t) * 0.6;
    s += Math.sin(2 * Math.PI * f0 * 2.0 * t) * 0.2;
    s += Math.sin(2 * Math.PI * f0 * 3.0 * t) * 0.1;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 1.0), 8);
}

// ─── Stick ───────────────────────────────────────────────────────────────────
// 드럼스틱 림 클릭: 스틱 측면끼리 부딪히는 소리, 1~2 kHz 중심, 건조하고 정확
// 세 파일 모두 동일 길이: 20ms

function generateStickHigh() {
  const duration = 0.020;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 150);
    let s = 0;
    s += Math.sin(2 * Math.PI * 1600 * t) * 1.0;
    s += Math.sin(2 * Math.PI * 2700 * t) * 0.55;
    s += Math.sin(2 * Math.PI * 4100 * t) * 0.28;
    s += Math.sin(2 * Math.PI * 900 * t) * 0.2;
    s += Math.sin(2 * Math.PI * 5800 * t) * 0.12;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.15), 3);
}

function generateStickLow() {
  const duration = 0.020;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 140);
    let s = 0;
    s += Math.sin(2 * Math.PI * 1100 * t) * 1.0;
    s += Math.sin(2 * Math.PI * 1900 * t) * 0.5;
    s += Math.sin(2 * Math.PI * 2900 * t) * 0.25;
    s += Math.sin(2 * Math.PI * 650 * t) * 0.18;
    s += Math.sin(2 * Math.PI * 4200 * t) * 0.1;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.15), 3);
}

function generateStickStrong() {
  const duration = 0.020;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 130);
    let s = 0;
    s += Math.sin(2 * Math.PI * 2000 * t) * 1.0;
    s += Math.sin(2 * Math.PI * 3400 * t) * 0.6;
    s += Math.sin(2 * Math.PI * 5100 * t) * 0.32;
    s += Math.sin(2 * Math.PI * 1200 * t) * 0.22;
    s += Math.sin(2 * Math.PI * 7000 * t) * 0.14;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.1), 3);
}

// ─── Rimshot / Triangle / Hihat ──────────────────────────────────────────────
// Drum-pad-only sounds — not shown in the metronome picker.
// Preserved here so the default drum kit mapping has valid WAV assets.

function generateRimshotHigh() {
  const duration = 0.032;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 55);
    let s = 0;
    s += Math.sin(2 * Math.PI * 450 * t) * 0.7;
    s += Math.sin(2 * Math.PI * 900 * t) * 0.4;
    s += Math.sin(2 * Math.PI * 1350 * t) * 0.25;
    s += Math.sin(2 * Math.PI * 2000 * t) * 0.35;
    s += Math.sin(2 * Math.PI * 3200 * t) * 0.15;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.3), 4);
}

function generateRimshotLow() {
  const duration = 0.028;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 60);
    let s = 0;
    s += Math.sin(2 * Math.PI * 350 * t) * 0.6;
    s += Math.sin(2 * Math.PI * 700 * t) * 0.35;
    s += Math.sin(2 * Math.PI * 1050 * t) * 0.15;
    s += Math.sin(2 * Math.PI * 1600 * t) * 0.3;
    s += Math.sin(2 * Math.PI * 2600 * t) * 0.1;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.3), 4);
}

function generateRimshotStrong() {
  const duration = 0.038;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 45);
    let s = 0;
    s += Math.sin(2 * Math.PI * 550 * t) * 1.0;
    s += Math.sin(2 * Math.PI * 1100 * t) * 0.6;
    s += Math.sin(2 * Math.PI * 1650 * t) * 0.35;
    s += Math.sin(2 * Math.PI * 2400 * t) * 0.45;
    s += Math.sin(2 * Math.PI * 3800 * t) * 0.2;
    s += Math.sin(2 * Math.PI * 4500 * t) * 0.1;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.2), 4);
}

function generateTriangleHigh() {
  const duration = 0.060;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 22);
    let s = 0;
    s += Math.sin(2 * Math.PI * 4186 * t) * 1.0;
    s += Math.sin(2 * Math.PI * 4186 * 3 * t) * 0.11;
    s += Math.sin(2 * Math.PI * 4186 * 5 * t) * 0.04;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.3), 8);
}

function generateTriangleLow() {
  const duration = 0.060;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 20);
    let s = 0;
    s += Math.sin(2 * Math.PI * 3136 * t) * 1.0;
    s += Math.sin(2 * Math.PI * 3136 * 3 * t) * 0.11;
    s += Math.sin(2 * Math.PI * 3136 * 5 * t) * 0.04;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.3), 8);
}

function generateTriangleStrong() {
  const duration = 0.060;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 18);
    let s = 0;
    s += Math.sin(2 * Math.PI * 5274 * t) * 1.0;
    s += Math.sin(2 * Math.PI * 5274 * 3 * t) * 0.11;
    s += Math.sin(2 * Math.PI * 5274 * 5 * t) * 0.04;
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.2), 8);
}

function generateHihatHigh() {
  const duration = 0.040;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  const freqs = [6000, 8000, 10200, 12800, 15400];
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 80);
    let s = 0;
    for (const f of freqs) s += Math.sin(2 * Math.PI * f * t) * (1 / freqs.length);
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.2), 5);
}

function generateHihatLow() {
  const duration = 0.032;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  const freqs = [5000, 7000, 9200, 11800, 14200];
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 90);
    let s = 0;
    for (const f of freqs) s += Math.sin(2 * Math.PI * f * t) * (1 / freqs.length);
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.2), 4);
}

function generateHihatStrong() {
  const duration = 0.050;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  const freqs = [7000, 9000, 11200, 13800, 16200];
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 65);
    let s = 0;
    for (const f of freqs) s += Math.sin(2 * Math.PI * f * t) * (1 / freqs.length);
    samples[i] = s * env;
  }
  return fadeOut(softAttack(normalize(samples), 0.15), 6);
}

// ─── Write all files ──────────────────────────────────────────────────────────

const outDir = path.join(__dirname, "..", "assets", "sounds");
fs.mkdirSync(outDir, { recursive: true });

writeWav(path.join(outDir, "click-high.wav"), generateClassicHigh());
writeWav(path.join(outDir, "click-low.wav"), generateClassicLow());
writeWav(path.join(outDir, "click-strong.wav"), generateClassicStrong());
writeWav(path.join(outDir, "woodblock-high.wav"), generateWoodblockHigh());
writeWav(path.join(outDir, "woodblock-low.wav"), generateWoodblockLow());
writeWav(path.join(outDir, "woodblock-strong.wav"), generateWoodblockStrong());
writeWav(path.join(outDir, "digital-high.wav"), generateDigitalHigh());
writeWav(path.join(outDir, "digital-low.wav"), generateDigitalLow());
writeWav(path.join(outDir, "digital-strong.wav"), generateDigitalStrong());
writeWav(path.join(outDir, "jamblock-high.wav"), generateJamblockHigh());
writeWav(path.join(outDir, "jamblock-low.wav"), generateJamblockLow());
writeWav(path.join(outDir, "jamblock-strong.wav"), generateJamblockStrong());
writeWav(path.join(outDir, "sine-high.wav"), generateSineHigh());
writeWav(path.join(outDir, "sine-low.wav"), generateSineLow());
writeWav(path.join(outDir, "sine-strong.wav"), generateSineStrong());
writeWav(path.join(outDir, "blip-high.wav"), generateBlipHigh());
writeWav(path.join(outDir, "blip-low.wav"), generateBlipLow());
writeWav(path.join(outDir, "blip-strong.wav"), generateBlipStrong());
writeWav(path.join(outDir, "clave-high.wav"), generateClaveHigh());
writeWav(path.join(outDir, "clave-low.wav"), generateClaveLow());
writeWav(path.join(outDir, "clave-strong.wav"), generateClaveStrong());
writeWav(path.join(outDir, "cajon-high.wav"), generateCajonHigh());
writeWav(path.join(outDir, "cajon-low.wav"), generateCajonLow());
writeWav(path.join(outDir, "cajon-strong.wav"), generateCajonStrong());
writeWav(path.join(outDir, "marimba-high.wav"), generateMarimbaHigh());
writeWav(path.join(outDir, "marimba-low.wav"), generateMarimbaLow());
writeWav(path.join(outDir, "marimba-strong.wav"), generateMarimbaStrong());
writeWav(path.join(outDir, "stick-high.wav"), generateStickHigh());
writeWav(path.join(outDir, "stick-low.wav"), generateStickLow());
writeWav(path.join(outDir, "stick-strong.wav"), generateStickStrong());

writeWav(path.join(outDir, "rimshot-high.wav"), generateRimshotHigh());
writeWav(path.join(outDir, "rimshot-low.wav"), generateRimshotLow());
writeWav(path.join(outDir, "rimshot-strong.wav"), generateRimshotStrong());
writeWav(path.join(outDir, "triangle-high.wav"), generateTriangleHigh());
writeWav(path.join(outDir, "triangle-low.wav"), generateTriangleLow());
writeWav(path.join(outDir, "triangle-strong.wav"), generateTriangleStrong());
writeWav(path.join(outDir, "hihat-high.wav"), generateHihatHigh());
writeWav(path.join(outDir, "hihat-low.wav"), generateHihatLow());
writeWav(path.join(outDir, "hihat-strong.wav"), generateHihatStrong());

console.log("\nAll sound files generated!");
