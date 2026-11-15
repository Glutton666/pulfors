---
name: Tempo trainer behavior
description: User-confirmed single-rule training and why Android training selects tempo-editable output.
---

The user wants one shared condition under playback controls in both stopwatch and timer, with persistent settings: MM:SS or N measures, +/- N BPM, and an optional accent on BPM increases. Only the configuration should survive app restarts, not automatic playback.

**Why:** The user explicitly chose “조건 하나만 적용” and later pointed out that beat-count intervals and immediate time-triggered changes can land mid-measure. The newer measure-boundary requirement supersedes the original N-beats interpretation.

**How to apply:** Keep the trainer integrated with the existing timer/stopwatch rather than creating another feature window. Use complete measures for musical intervals; a time threshold waits for a measure boundary. Prepare the tempo change and a single replacement strong click on the output audio timeline, not as an extra sound after a display callback. Do not claim a device flam was heard without listening evidence.

Use the existing tempo-editable rendered output for Android Beat training, even if the experimental sparse scheduler is opted in.

**Why:** Sparse periods are immutable and the ordinary render-refresh path intentionally refuses to replace sparse output; changing only the JS engine would make visible BPM disagree with audible tempo.

**How to apply:** Select a compatible backend before training starts. Preserve normal sparse selection for unrelated playback; do not introduce fallback-on-failure or change the user's beat accents to implement a trainer cue.
