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

// Deterministic noise keeps generated impact sounds reproducible without
// making the source WAVs sound like static. Each instrument uses a different
// seed so its attack has a distinct texture.
function pseudoNoise(index, seed) {
  const value = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
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

// ─── Cowbell ───────────────────────────────────────────────────────────────────
// 금속 카우벨: 비조화적인 두 공명 + 짧은 금속성 어택.
// 역할마다 공명 중심을 바꾸되 모두 같은 악기의 울림을 유지한다.

function generateCowbell({ duration, modeA, modeB, modeC, noiseLevel, decay }) {
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const strike = pseudoNoise(i, modeA) * noiseLevel * Math.exp(-t * 700);
    const body = Math.sin(2 * Math.PI * modeA * t) * Math.exp(-t * decay);
    const bell = Math.sin(2 * Math.PI * modeB * t + 0.3) * 0.72 * Math.exp(-t * (decay * 0.72));
    const edge = Math.sin(2 * Math.PI * modeC * t + 1.1) * 0.26 * Math.exp(-t * 240);
    samples[i] = strike + body + bell + edge;
  }
  return fadeOut(normalize(samples), 5);
}

function generateCowbellHigh() {
  return generateCowbell({ duration: 0.045, modeA: 720, modeB: 1080, modeC: 2450, noiseLevel: 0.6, decay: 58 });
}

function generateCowbellLow() {
  return generateCowbell({ duration: 0.045, modeA: 520, modeB: 790, modeC: 2100, noiseLevel: 0.55, decay: 52 });
}

function generateCowbellStrong() {
  return generateCowbell({ duration: 0.045, modeA: 840, modeB: 1260, modeC: 2850, noiseLevel: 0.75, decay: 48 });
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
// 쿠바 클라베 스틱: 나무 막대가 부딪히는 순간의 건조한 광대역 어택과
// 2~4 kHz의 짧은 목질 공명. 긴 사인파 울림이 남지 않도록 짧게 자른다.

function generateClave({ duration, modeA, modeB, noiseLevel, decay }) {
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const click = pseudoNoise(i, modeA) * noiseLevel * Math.exp(-t * 520);
    const wood = Math.sin(2 * Math.PI * modeA * t) * Math.exp(-t * decay);
    const overtone = Math.sin(2 * Math.PI * modeB * t + 0.4) * 0.48 * Math.exp(-t * (decay * 1.2));
    samples[i] = click + wood + overtone;
  }
  return fadeOut(normalize(samples), 2.5);
}

function generateClaveHigh() {
  return generateClave({ duration: 0.020, modeA: 2850, modeB: 4700, noiseLevel: 0.62, decay: 190 });
}

function generateClaveLow() {
  return generateClave({ duration: 0.020, modeA: 2250, modeB: 3700, noiseLevel: 0.52, decay: 175 });
}

function generateClaveStrong() {
  return generateClave({ duration: 0.020, modeA: 3200, modeB: 5200, noiseLevel: 0.78, decay: 165 });
}

// ─── Cajon ────────────────────────────────────────────────────────────────────
// 카혼 손가락 탭/슬랩: 저역 나무 상자 공명 + 표면 마찰음.
// low는 중앙의 둥근 바디, high는 가장자리 탭, strong은 짧은 슬랩을 강조한다.

function generateCajon({ duration, body, bodyDecay, slap, slapDecay, noiseLevel, seed }) {
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const bodyEnv = Math.exp(-t * bodyDecay);
    const slapEnv = Math.exp(-t * slapDecay);
    const impact = pseudoNoise(i, seed) * noiseLevel * Math.exp(-t * 270);
    let s = impact;
    s += Math.sin(2 * Math.PI * body * t) * bodyEnv;
    s += Math.sin(2 * Math.PI * body * 1.82 * t + 0.2) * bodyEnv * 0.42;
    s += Math.sin(2 * Math.PI * body * 2.65 * t + 0.8) * bodyEnv * 0.18;
    s += Math.sin(2 * Math.PI * slap * t) * slapEnv * 0.38;
    s += Math.sin(2 * Math.PI * slap * 1.55 * t + 0.4) * slapEnv * 0.16;
    samples[i] = s;
  }
  return fadeOut(normalize(samples), 6);
}

function generateCajonHigh() {
  return generateCajon({ duration: 0.050, body: 360, bodyDecay: 76, slap: 1750, slapDecay: 235, noiseLevel: 0.28, seed: 360 });
}

function generateCajonLow() {
  return generateCajon({ duration: 0.050, body: 230, bodyDecay: 62, slap: 1200, slapDecay: 200, noiseLevel: 0.22, seed: 230 });
}

function generateCajonStrong() {
  return generateCajon({ duration: 0.050, body: 285, bodyDecay: 55, slap: 2050, slapDecay: 275, noiseLevel: 0.48, seed: 285 });
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
// 드럼스틱 림 클릭: 나무 막대끼리 부딪히는 날카로운 노이즈 어택 +
// 1~3 kHz의 짧은 건조한 공명. 카우벨/클라베보다 짧고 덜 울린다.

function generateStick({ duration, modeA, modeB, noiseLevel, decay, seed }) {
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const click = pseudoNoise(i, seed) * noiseLevel * Math.exp(-t * 760);
    const wood = Math.sin(2 * Math.PI * modeA * t) * Math.exp(-t * decay);
    const overtone = Math.sin(2 * Math.PI * modeB * t + 0.7) * 0.36 * Math.exp(-t * (decay * 1.35));
    samples[i] = click + wood + overtone;
  }
  return fadeOut(normalize(samples), 2);
}

function generateStickHigh() {
  return generateStick({ duration: 0.017, modeA: 1750, modeB: 3100, noiseLevel: 0.55, decay: 250, seed: 1750 });
}

function generateStickLow() {
  return generateStick({ duration: 0.017, modeA: 1250, modeB: 2250, noiseLevel: 0.45, decay: 230, seed: 1250 });
}

function generateStickStrong() {
  return generateStick({ duration: 0.017, modeA: 2150, modeB: 3650, noiseLevel: 0.72, decay: 220, seed: 2150 });
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
writeWav(path.join(outDir, "cowbell-high.wav"), generateCowbellHigh());
writeWav(path.join(outDir, "cowbell-low.wav"), generateCowbellLow());
writeWav(path.join(outDir, "cowbell-strong.wav"), generateCowbellStrong());
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
