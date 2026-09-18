---
name: Audio output ownership scope
description: Defines which playback modes share the central output owner and how to treat score playback during audits.
---

Metronome Beat, Bar, Note, and Polygon output must use the single owner created by the audio pipeline. Do not add optional or fallback owners, direct web click output, or hook-owned PCM caches.

Score playback remains a separate mode-owned scheduler and synthesis/session architecture. Treat it as a distinct migration target, not as a fallback path inside the metronome pipeline.

**Why:** Conflating the two architectures makes final integration audits demand a risky score rewrite while reviewing metronome ownership, even though score playback has its own stop and cancellation boundaries.

**How to apply:** Changes to metronome or Polygon playback must preserve the shared owner. Changes that move score output under the same owner should be scoped and verified as an explicit score-session migration.