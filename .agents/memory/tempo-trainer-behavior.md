---
name: Tempo trainer behavior
description: Persistent single-rule training, measure boundaries, and the scoped native audio-clock decision.
---

The user wants one shared condition under playback controls in both stopwatch and timer, with persistent settings: MM:SS or N measures, +/- N BPM, and an optional accent on BPM increases. Only the configuration should survive app restarts, not automatic playback.

The BPM change amount must also accept zero, preserving the current tempo while still playing the enabled interval accent.

**Why:** The user explicitly requested zero and clarified “강조음은 나는데 템포는 유지되는거지”.

**How to apply:** Treat zero as a valid saved rule, not a missing value to replace with a positive default. On each due interval replace the boundary click with the accent if enabled; do not add an extra click or accent every intervening measure.

**Why:** The user explicitly chose “조건 하나만 적용” and later pointed out that beat-count intervals and immediate time-triggered changes can land mid-measure. The newer measure-boundary requirement supersedes the original N-beats interpretation.

**How to apply:** Keep the trainer integrated with the existing timer/stopwatch rather than creating another feature window. Use complete measures for musical intervals; a time threshold waits for a measure boundary. Prepare the tempo change and a single replacement strong click on the output audio timeline, not as an extra sound after a display callback. Do not claim a device flam was heard without listening evidence.

Use the dedicated audio-clocked output for enabled Beat training; preserve the ordinary output choices for other modes.

**Why:** Ordinary rendered-player swaps and immutable sparse periods cannot make an engine-only BPM update change the audible tempo at a precise boundary. The user approved native timing support even when it requires rebuilding the installed app, without replacing the global playback backend.

**How to apply:** Keep native training on the audio runtime, not JS/display timers; web may reserve short blocks on the existing audio clock. Require a compatible native build and fail explicitly rather than falling back to timer-driven swaps. Preserve ownership/cancellation and the user's saved beat accents. Actual locked-screen device listening remains a separate check.
