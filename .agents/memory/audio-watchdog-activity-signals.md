---
name: Audio watchdog activity signals
description: Preventing false audio recovery during normal layered metronome playback.
---

Every per-tick code path that successfully starts an audible click must refresh the shared audio activity timestamp. This includes modes such as Pulse Polygon that mute the base metronome and produce their own output. The signal satisfies both the startup handshake and the watchdog; if recovery is already in progress, it should immediately mark recovery successful. Pre-rendered loops are different: judge them from output-layer liveness (`AudioPlayer.playing` or a Web Audio source handle), never from engine scheduler ticks.

**Why:** Startup and watchdog checks cannot infer audible output from engine state alone. Omitting a mode-owned output callback makes playback look silent and can stop it after the startup timeout or trigger a false recovery. Conversely, treating scheduler ticks as proof of pre-rendered output can hide a silent or failed player.

**How to apply:** Route successful per-tick Web Audio and native player starts through the shared activity marker. For pre-rendering, expose stopped/ended/context state on web and use the native player's playback state; keep recovery active when those outputs are not live.