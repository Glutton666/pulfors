---
name: Audio output ownership scope
description: Defines which playback modes share the central output owner and how to treat score playback during audits.
---

Metronome Beat, Bar, Note, and Polygon output must use the single owner created by the audio pipeline. Do not add optional or fallback owners, direct web click output, or hook-owned PCM caches.

Score playback remains a separate mode-owned scheduler and synthesis/session architecture. Treat it as a distinct migration target, not as a fallback path inside the metronome pipeline.

**Why:** Conflating the two architectures makes final integration audits demand a risky score rewrite while reviewing metronome ownership, even though score playback has its own stop and cancellation boundaries.

**How to apply:** Changes to metronome or Polygon playback must preserve the shared owner. Changes that move score output under the same owner should be scoped and verified as an explicit score-session migration.

Removing the legacy media card during Android sparse Beat/Bar entry must clear ownerless remote-paused controls and cancel pending paused-notification holds, not globally stop shared background leases with active owners.

**Why:** A MediaSession retained for remote resume can outlive its metronome lease token. Global cleanup would hide the card at the cost of stopping independent Score playback.

**How to apply:** Select the no-MediaSession notification policy before asynchronous preparation, preserve active independent owners, and test cancellation while a legacy hold is still being acquired.