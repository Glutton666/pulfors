---
name: Android sparse-output boundary
description: Requirement boundary when replacing continuous Android metronome playback with click-only output.
---

Do not replace the continuous Android output with per-click JS playback by simply removing the silent keepalive or looping measure player. A click-only implementation needs a native timing owner and a foreground service independent of the audio player's MediaSession, with an explicit handoff for changing schedules and interruption/stop handling.

**Why:** The current continuous player helps keep playback alive during screen lock and app switching; JS scheduling and short-lived player starts have not been proven to preserve timing and lifecycle there. Removing the player also removes the existing foreground-service mechanism. The desired absence of a media card must not be purchased by silently losing background playback.

**How to apply:** For Android audio changes involving silence between clicks, implement and validate a native service/clock/output path with a visible required notification, then compare real-device wired output, BPM jitter, screen-lock survival, pause/resume, and interruption recovery before switching the default. Keep the existing path until the replacement is verified.