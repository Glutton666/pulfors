---
name: Native random-pass handoff
description: Why random Bar visuals and independently scheduled Android audio must share a preselected next pass.
---

For random Bar playback on an independent native clock, select the next pass only once and prepare its native events before the current period ends. Treat a missed native replacement deadline as a playback failure rather than continuing with new visuals over repeated old audio.

**Why:** JS measure-completion callbacks are not guaranteed to run before the Android clock crosses a period boundary. Preparing only after the callback can make the UI advance to a new random order while native output repeats the previous order.

**How to apply:** Any future random-order, setlist, or muted-phase transition on the sparse Android backend needs a preselected next schedule plus an acknowledged native boundary. Preserve long sample tails across the handoff, and fail closed if preparation misses the matching boundary.