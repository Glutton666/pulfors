---
name: Audio watchdog activity signals
description: Preventing false audio recovery during normal layered metronome playback.
---

Every code path that successfully starts an audible click must refresh the audio watchdog timestamp. If a recovery is already in progress, that same signal should immediately mark recovery successful.

**Why:** The watchdog cannot infer audible output from engine state alone. Omitting layer or block callbacks causes healthy playback to look silent, leading to a false restart and distracting recovery UI.

**How to apply:** When adding a new metronome audio callback or output path, route successful Web Audio and native player starts through the shared activity marker. Keep automatic recovery notices nonblocking and reserve persistent actions for actual recovery failure.