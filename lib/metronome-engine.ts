import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const SAMPLE_RATE = 44100;

function createClickBuffer(frequency: number, duration: number, volume: number): string {
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = SAMPLE_RATE * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const envelope = Math.exp(-t * 40) * volume;
    const sample = Math.sin(2 * Math.PI * frequency * t) * envelope;
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    view.setInt16(headerSize + i * 2, intSample, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export const highClickUri = `data:audio/wav;base64,${createClickBuffer(1200, 0.05, 0.9)}`;
export const lowClickUri = `data:audio/wav;base64,${createClickBuffer(800, 0.04, 0.7)}`;

type BeatCallback = (beat: number, isAccent: boolean) => void;

export class MetronomeEngine {
  private intervalId: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  private bpm = 120;
  private beatsPerMeasure = 4;
  private currentBeat = 0;
  private volume = 0.8;
  private onBeatCallbacks: BeatCallback[] = [];
  private playHighClick: (() => void) | null = null;
  private playLowClick: (() => void) | null = null;

  setAudioCallbacks(playHigh: () => void, playLow: () => void) {
    this.playHighClick = playHigh;
    this.playLowClick = playLow;
  }

  addOnBeat(callback: BeatCallback) {
    this.onBeatCallbacks.push(callback);
  }

  setOnBeat(callback: BeatCallback) {
    this.onBeatCallbacks = [callback];
  }

  clearOnBeat() {
    this.onBeatCallbacks = [];
  }

  setBpm(bpm: number) {
    this.bpm = Math.max(20, Math.min(300, bpm));
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  setBeatsPerMeasure(beats: number) {
    this.beatsPerMeasure = beats;
    this.currentBeat = 0;
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  getBpm() { return this.bpm; }
  getIsRunning() { return this.isRunning; }
  getVolume() { return this.volume; }

  private tick() {
    const isAccent = this.currentBeat === 0;

    if (this.volume > 0) {
      try {
        if (isAccent) {
          this.playHighClick?.();
        } else {
          this.playLowClick?.();
        }
      } catch (e) { /* silent */ }
    }

    if (Platform.OS !== "web") {
      try {
        Haptics.impactAsync(
          isAccent ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light
        );
      } catch (e) { /* silent */ }
    }

    for (const cb of this.onBeatCallbacks) {
      cb(this.currentBeat, isAccent);
    }
    this.currentBeat = (this.currentBeat + 1) % this.beatsPerMeasure;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.currentBeat = 0;
    const intervalMs = 60000 / this.bpm;
    this.tick();
    this.intervalId = setInterval(() => { this.tick(); }, intervalMs);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.currentBeat = 0;
  }

  cleanup() { this.stop(); }
}
