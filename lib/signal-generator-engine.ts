import { Platform } from "react-native";
import { logger } from "./logger";

export type WaveType = "sine" | "square" | "triangle" | "sawtooth";

const SAMPLE_RATE = 44100;
const BUFFER_DURATION = 1;

function generateWaveSamples(
  freq: number,
  waveType: WaveType,
  sampleRate: number,
  numSamples: number,
  volume: number
): Float32Array {
  const samples = new Float32Array(numSamples);
  const period = sampleRate / freq;

  for (let i = 0; i < numSamples; i++) {
    const t = (i % period) / period;
    let val = 0;
    switch (waveType) {
      case "sine":
        val = Math.sin(2 * Math.PI * freq * i / sampleRate);
        break;
      case "square":
        val = t < 0.5 ? 1 : -1;
        break;
      case "triangle":
        val = t < 0.5 ? 4 * t - 1 : 3 - 4 * t;
        break;
      case "sawtooth":
        val = 2 * t - 1;
        break;
    }
    samples[i] = val * volume;
  }

  const fadeLen = Math.min(256, numSamples / 2);
  for (let i = 0; i < fadeLen; i++) {
    const fade = i / fadeLen;
    samples[i] *= fade;
    samples[numSamples - 1 - i] *= fade;
  }

  return samples;
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numSamples = samples.length;
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa !== "undefined") {
    return btoa(binary);
  }
  return binary;
}

export function generateToneBase64(
  freq: number,
  waveType: WaveType,
  volumeLinear: number
): string {
  const numSamples = SAMPLE_RATE * BUFFER_DURATION;
  const samples = generateWaveSamples(freq, waveType, SAMPLE_RATE, numSamples, volumeLinear);
  const wav = encodeWav(samples, SAMPLE_RATE);
  return arrayBufferToBase64(wav);
}

export function generateToneDataUri(
  freq: number,
  waveType: WaveType,
  volumeLinear: number
): string {
  return `data:audio/wav;base64,${generateToneBase64(freq, waveType, volumeLinear)}`;
}

export class SignalGeneratorEngine {
  private audioContext: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private isRunning = false;

  get running() {
    return this.isRunning;
  }

  async startWeb(freq: number, waveType: WaveType, volumeLinear: number) {
    if (Platform.OS !== "web") return;
    this.stopWeb();
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.audioContext = ctx;
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch (resumeErr) {
          logger.warn("[SignalGen] AudioContext resume failed:", resumeErr);
        }
      }
      const gain = ctx.createGain();
      gain.gain.value = volumeLinear;
      gain.connect(ctx.destination);
      this.gainNode = gain;
      const osc = ctx.createOscillator();
      osc.type = waveType;
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start();
      this.oscillator = osc;
      this.isRunning = true;
    } catch (e) {
      logger.warn("[SignalGen] startWeb error:", e);
      this.isRunning = false;
    }
  }

  updateFrequency(freq: number) {
    if (this.oscillator) {
      this.oscillator.frequency.value = freq;
    }
  }

  updateWaveType(waveType: WaveType) {
    if (this.oscillator) {
      this.oscillator.type = waveType;
    }
  }

  updateVolume(vol: number) {
    if (this.gainNode) {
      this.gainNode.gain.value = vol;
    }
  }

  stopWeb() {
    if (this.oscillator) {
      try { this.oscillator.stop(); } catch {}
      this.oscillator = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.isRunning = false;
  }
}
