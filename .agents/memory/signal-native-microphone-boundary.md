---
name: Native signal microphone boundary
description: Why the legacy recorder must stay excluded and web permission tests cannot prove installed-app capture works.
---

Do not re-enable the excluded legacy recorder merely to restore the signal generator microphone.

**Why:** Its native exclusion was deliberate protection against startup crashes, not an accidentally missing permission. The permission requester and the actual PCM capture backend are independent; a successful permission prompt does not prove the recorder exists in the installed binary.

**How to apply:** Keep native capture on a new-architecture-compatible backend with explicit startup-result checks and shared audio-session ownership. Check iOS session configuration in both the shared manager and the backend engine: the engine's own desired playback category can override record-enabled settings.

Web microphone regression tests and mocked native PCM tests do not establish that an installed Android/iOS binary records successfully.

**Why:** Web capture uses browser APIs, while installed apps need linked native recording code and device audio routing.

**How to apply:** Distinguish missing-backend errors from permission denial. Verify native linkage for both platforms, and explicitly disclose when device capture or a rebuilt installed app has not been verified.
