class PulforsSchedulingProbe extends AudioWorkletProcessor {
  constructor() {
    super();
    this.startedAt = -1;
    this.endFrame = 0;
    this.nextPulse = 0;
    this.renderedPulses = 0;
    this.reports = 0;
    this.port.onmessage = (event) => {
      if (event.data?.type === "start") {
        this.startedAt = currentFrame;
        this.endFrame = currentFrame + event.data.durationFrames;
        this.nextPulse = currentFrame;
        this.renderedPulses = 0;
        this.reports = 0;
      }
      if (event.data?.type === "stop") {
        this.port.postMessage({ renderedPulses: this.renderedPulses, workletReports: this.reports });
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    for (const channel of output) channel.fill(0);
    if (this.startedAt < 0 || currentFrame >= this.endFrame) return true;

    // Match the HTML fixture: 300 BPM with four subdivisions (50 ms/event).
    const framesPerPulse = sampleRate * 0.05;
    while (this.nextPulse < currentFrame + 128 && this.nextPulse < this.endFrame) {
      this.renderedPulses++;
      this.nextPulse += framesPerPulse;
    }
    if ((currentFrame - this.startedAt) % sampleRate < 128) {
      this.reports++;
      this.port.postMessage({ renderedPulses: this.renderedPulses, workletReports: this.reports });
    }
    return true;
  }
}

registerProcessor("pulfors-scheduling-probe", PulforsSchedulingProbe);