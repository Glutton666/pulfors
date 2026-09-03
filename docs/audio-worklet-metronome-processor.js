/*
 * Deliberately unbundled AudioWorklet prototype.
 *
 * It is a design/benchmark fixture, not part of the app bundle. Keep this
 * file free of imports: AudioWorklet.addModule() loads it as a standalone
 * same-origin module.
 */
class PulforsMetronomeProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Map();
    this.events = [];
    this.voices = [];
    this.masterGain = 1;
    this.stopped = false;
    this.port.onmessage = (message) => this.handleMessage(message.data);
  }

  handleMessage(message) {
    if (!message || typeof message.type !== "string") return;
    if (message.type === "init") {
      this.stopped = false;
      this.masterGain = clampGain(message.masterGain);
      return;
    }
    if (message.type === "sample" && message.id && message.pcm instanceof Float32Array) {
      this.samples.set(String(message.id), {
        pcm: message.pcm,
        channels: message.channels === "stereo" ? "stereo" : "mono",
      });
      return;
    }
    if (message.type === "schedule" && message.sampleId) {
      this.events.push({
        frame: Math.max(currentFrame, Math.floor(message.frame)),
        sampleId: String(message.sampleId),
        gain: clampGain(message.gain),
        channel: message.channel === "left" || message.channel === "right"
          ? message.channel
          : "both",
        role: message.role === "strong" || message.role === "accent" ? message.role : "normal",
        subdivision: Number.isInteger(message.subdivision) ? message.subdivision : 0,
      });
      this.events.sort((a, b) => a.frame - b.frame);
      return;
    }
    if (message.type === "set-volume") {
      this.masterGain = clampGain(message.value);
      return;
    }
    if (message.type === "clear") {
      this.events.length = 0;
      this.voices.length = 0;
      return;
    }
    if (message.type === "stop") {
      this.stopped = true;
      this.events.length = 0;
      this.voices.length = 0;
      return;
    }
    if (message.type === "dispose") {
      this.stopped = true;
      this.events.length = 0;
      this.voices.length = 0;
      this.samples.clear();
      this.port.close();
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1] || left;
    left.fill(0);
    if (right !== left) right.fill(0);

    if (!this.stopped) {
      while (this.events.length > 0 && this.events[0].frame < currentFrame + left.length) {
        const event = this.events.shift();
        const sample = this.samples.get(event.sampleId);
        if (!sample) continue;
        this.voices.push({ ...event, pcm: sample.pcm, offset: 0 });
      }

      for (let i = 0; i < left.length; i++) {
        const frame = currentFrame + i;
        for (let v = this.voices.length - 1; v >= 0; v--) {
          const voice = this.voices[v];
          if (frame < voice.frame) continue;
          const sampleIndex = frame - voice.frame + voice.offset;
          if (sampleIndex >= voice.pcm.length) {
            this.voices.splice(v, 1);
            continue;
          }
          const value = voice.pcm[sampleIndex] * voice.gain * this.masterGain;
          if (voice.channel !== "right") left[i] += value;
          if (voice.channel !== "left" && right !== left) right[i] += value;
        }
      }
    }
    return !this.stopped;
  }
}

function clampGain(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 1;
}

registerProcessor("pulfors-metronome-prototype", PulforsMetronomeProcessor);