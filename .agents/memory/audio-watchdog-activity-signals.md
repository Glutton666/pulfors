---
name: Audio watchdog activity signals
description: Preventing false audio recovery during normal layered metronome playback.
---

Every per-tick code path that successfully starts an audible click must refresh the audio watchdog timestamp. If a recovery is already in progress, that same signal should immediately mark recovery successful. Pre-rendered loops are different: judge them from output-layer liveness (`AudioPlayer.playing` or a Web Audio source handle), never from engine scheduler ticks.

**Why:** The watchdog cannot infer audible output from engine state alone. Omitting layer or block callbacks causes healthy playback to look silent, leading to a false restart. Conversely, treating scheduler ticks as proof of pre-rendered output can hide a silent or failed player.

**How to apply:** Route successful per-tick Web Audio and native player starts through the shared activity marker. For pre-rendering, expose stopped/ended/context state on web and use the native player's playback state; keep recovery active when those outputs are not live.