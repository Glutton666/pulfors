---
name: Signal analysis session boundary
description: The architectural boundary between live tuner detection and temporary multi-note timeline analysis.
---

The live microphone tuner and the held-duration analysis timeline are separate pipelines. Live tuning should continue to use the single representative HPS peak, while timeline capture may collect multiple spectral candidates, time buckets, and temporary replay audio.

**Why:** Combining the two flows makes normal tuning more expensive and risks changing its established lifecycle, while timeline replay needs raw-session ownership and cleanup that live tuning does not.

**How to apply:** Add future timeline features through the analysis session model; do not replace or overload the live `fftPeakDetect` result contract.

Analysis collects while the microphone button is held and finishes on release, not after a fixed ten seconds. Results belong below the live tuner, not in another screen or a generator-details section.

**Why:** The user explicitly replaced the separate ten-second workflow with hold-to-capture and requested removing the redundant details area.

**How to apply:** Preserve tap-to-toggle live detection. Reject late permission, recorder, and playback completions after release, close, or a newer session.