---
name: Tempo trainer behavior
description: User-confirmed single-rule training and why Android training selects tempo-editable output.
---

The user wants one condition, not several simultaneous rules, under playback controls in both stopwatch and timer: MM:SS or N beats, +/- N BPM, and an optional accent on BPM increases.

**Why:** The user explicitly chose “조건 하나만 적용” after the time/beat interpretation was explained.

**How to apply:** Keep the trainer integrated with the existing timer/stopwatch rather than creating another feature window. Beat intervals are actual main beats, not measures or subdivisions.

Use the existing tempo-editable rendered output for Android Beat training, even if the experimental sparse scheduler is opted in.

**Why:** Sparse periods are immutable and the ordinary render-refresh path intentionally refuses to replace sparse output; changing only the JS engine would make visible BPM disagree with audible tempo.

**How to apply:** Select a compatible backend before training starts. Preserve normal sparse selection for unrelated playback; do not introduce fallback-on-failure or change the user's beat accents to implement a trainer cue.
