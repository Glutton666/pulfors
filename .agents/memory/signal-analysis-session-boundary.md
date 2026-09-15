---
name: Signal analysis session boundary
description: The architectural boundary between live tuner detection and temporary multi-note timeline analysis.
---

The live microphone tuner and the 10-second analysis timeline are separate pipelines. Live tuning should continue to use the single representative HPS peak, while timeline capture may collect multiple spectral candidates, time buckets, and temporary replay audio.

**Why:** Combining the two flows makes normal tuning more expensive and risks changing its established lifecycle, while timeline replay needs raw-session ownership and cleanup that live tuning does not.

**How to apply:** Add future timeline features through the analysis session model; do not replace or overload the live `fftPeakDetect` result contract.