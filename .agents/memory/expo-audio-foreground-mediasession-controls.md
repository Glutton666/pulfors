---
name: Expo Audio foreground MediaSession controls
description: Why silent Expo Audio helpers must not own Android's MediaSession when the media card is unwanted.
---

Do not activate Expo Audio lock-screen controls on silent helpers. Keep Android background lifetime in a plain foreground service, independently of the audible and true-silence players.

**Why:** Activating lock-screen controls starts Expo Audio’s MediaSessionService and exposes a system media card for the silent player. Removing silence alone would risk background timing; separating service ownership removes the card without replacing the audio backend.

**How to apply:** Preserve ordinary notification actions and the mandatory general service notification, but do not recreate MediaSession ownership as a fallback. Native changes require rebuilding the APK and checking actual card absence together with locked-screen playback.