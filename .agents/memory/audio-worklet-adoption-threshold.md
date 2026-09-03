---
name: AudioWorklet adoption threshold
description: Decision criteria for revisiting an AudioWorklet backend on web.
---

Keep the existing pre-rendered loop plus 160 ms Web Audio look-ahead path. Do not
add an AudioWorklet production backend without measured failures in the current
path.

**Why:** The complex Bar/custom path already runs as an AudioBufferSource loop on
the audio render thread, representative pre-render work is far below its real-time
budget, and an AudioWorklet would duplicate sample, channel, lifecycle, recovery,
and Safari fallback behavior. Its confirmed unique benefit is continuing an
internally-owned clock through main-thread stalls longer than the look-ahead.

**How to apply:** Reconsider only after supported browsers show repeatable missed
Beat-mode clicks from stalls over 160 ms, mobile render-memory/graph churn causes
user-visible failures, or a device benchmark shows lower underruns without CPU or
battery regression. Start behind a built-in Beat-mode feature flag and retain the
current path as immediate fallback.