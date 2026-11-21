// Collect contiguous microphone samples independently of the UI frame rate.
// This processor never writes to its output, which stays silent.
class DrumLugPcm extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = new Float32Array(1024);
    this.used = 0;
  }

  process(inputs) {
    const samples = inputs[0]?.[0];
    if (!samples) return true;
    for (let i = 0; i < samples.length; i++) {
      this.chunk[this.used++] = samples[i];
      if (this.used === this.chunk.length) {
        this.port.postMessage(this.chunk, [this.chunk.buffer]);
        this.chunk = new Float32Array(1024);
        this.used = 0;
      }
    }
    return true;
  }
}

registerProcessor("drum-lug-pcm", DrumLugPcm);
