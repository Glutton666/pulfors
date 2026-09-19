---
name: Expo Audio foreground MediaSession controls
description: Non-obvious Android behavior when expo-audio is used to hold a mediaPlayback foreground service.
---

Calling `AudioPlayer.setActiveForLockScreen(true, ...)` is what activates expo-audio’s Android `MediaSessionService`, but it also exposes system play/pause controls for that exact player. If the active player is only a silent keepalive, those controls must be forwarded to the real audible transport.

**Why:** Without the bridge, system Pause stops only the silent helper while metronome or score audio continues. The app then loses the continuous foreground hold and presents misleading transport state.

**How to apply:** Any silent foreground keepalive must subscribe to its playback-status events, route remote pause/play to the owning transport, suppress callbacks during intentional disposal, and preserve enough paused-session state for remote Play to resume the real transport.