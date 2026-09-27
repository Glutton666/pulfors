---
name: Android sparse-output boundary
description: Requirement boundary when replacing continuous Android metronome playback with click-only output.
---

Do not replace the continuous Android output with per-click JS playback by simply removing the silent keepalive or looping measure player. A click-only implementation needs a native timing owner and a foreground service independent of the audio player's MediaSession, with an explicit handoff for changing schedules and interruption/stop handling.

**Why:** The current continuous player helps keep playback alive during screen lock and app switching; JS scheduling and short-lived player starts have not been proven to preserve timing and lifecycle there. Removing the player also removes the existing foreground-service mechanism. The desired absence of a media card must not be purchased by silently losing background playback.

**How to apply:** For Android audio changes involving silence between clicks, implement and validate a native service/clock/output path with a visible required notification, then compare real-device wired output, BPM jitter, screen-lock survival, pause/resume, and interruption recovery before switching the default. Keep the existing path until the replacement is verified.

Schedule replacement must be atomic across the engine and native output, including BPM/Bar edits and random passes; keeping old native sound while the engine has already applied new timing makes the visual and audible beats disagree. Support existing custom click/sample patterns rather than silently falling back to a continuous player or preventing playback.

**Why:** A sparse-output prototype passed TypeScript and unit checks but review found that the engine rebuilt immediately while native audio replaced only at a later two-measure boundary, and custom sample configurations could not start. Those are functional regressions even if the foreground service itself is sound.

**How to apply:** Stage both clocks for one acknowledged boundary (or explicitly pause and restart together), then test rapid edits, custom audio, and cancellation before enabling the sparse route in the app. Treat native build plus locked-screen/wired-device tests as required evidence, not a web preview.