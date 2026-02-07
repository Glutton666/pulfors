import { Audio } from "expo-av";
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

const highClickBase64 = createClickBuffer(1200, 0.05, 0.9);
const lowClickBase64 = createClickBuffer(800, 0.04, 0.7);

export class MetronomeEngine {
  private intervalId: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  private bpm = 120;
  private beatsPerMeasure = 4;
  private currentBeat = 0;
  private highSound: Audio.Sound | null = null;
  private lowSound: Audio.Sound | null = null;
  private onBeat: ((beat: number, isAccent: boolean) => void) | null = null;
  private lastTickTime = 0;

  async init() {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const { sound: high } = await Audio.Sound.createAsync(
        { uri: `data:audio/wav;base64,${highClickBase64}` },
        { shouldPlay: false }
      );
      this.highSound = high;

      const { sound: low } = await Audio.Sound.createAsync(
        { uri: `data:audio/wav;base64,${lowClickBase64}` },
        { shouldPlay: false }
      );
      this.lowSound = low;
    } catch (e) {
      console.warn("Audio init failed:", e);
    }
  }

  setOnBeat(callback: (beat: number, isAccent: boolean) => void) {
    this.onBeat = callback;
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

  getBpm() {
    return this.bpm;
  }

  getIsRunning() {
    return this.isRunning;
  }

  private async tick() {
    const isAccent = this.currentBeat === 0;

    try {
      const sound = isAccent ? this.highSound : this.lowSound;
      if (sound) {
        await sound.setPositionAsync(0);
        await sound.playAsync();
      }
    } catch (e) {
      // silent fail
    }

    if (Platform.OS !== "web") {
      try {
        Haptics.impactAsync(
          isAccent
            ? Haptics.ImpactFeedbackStyle.Heavy
            : Haptics.ImpactFeedbackStyle.Light
        );
      } catch (e) {
        // silent fail
      }
    }

    this.onBeat?.(this.currentBeat, isAccent);
    this.currentBeat = (this.currentBeat + 1) % this.beatsPerMeasure;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.currentBeat = 0;

    const intervalMs = 60000 / this.bpm;

    this.tick();
    this.lastTickTime = Date.now();

    this.intervalId = setInterval(() => {
      const now = Date.now();
      const elapsed = now - this.lastTickTime;
      if (elapsed >= intervalMs * 0.9) {
        this.lastTickTime = now;
        this.tick();
      }
    }, intervalMs);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.currentBeat = 0;
  }

  async cleanup() {
    this.stop();
    try {
      await this.highSound?.unloadAsync();
      await this.lowSound?.unloadAsync();
    } catch (e) {
      // silent
    }
  }
}
