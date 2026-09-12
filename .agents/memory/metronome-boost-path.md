---
name: Metronome boost path
description: Why boosted volume and XY tone shaping must use pre-rendered PCM rather than player volume.
---

Keep the realtime click path restricted to neutral tone at volume values up to unity. Any volume above unity or non-neutral XY tone position must use pre-rendered PCM with gain applied once, linked limiting, and runtime player volume fixed at unity.

**Why:** Native Expo player volume is capped at unity, while separate web and native gain/compressor paths produced inconsistent output. Applying shaping and boost in shared PCM rendering gives both platforms the same result and preserves a transparent 100% path.

**How to apply:** When changing playback routing, volume handling, sound-set caches, or runtime rerenders, fail closed if required rendering fails. Treat aborts from superseded renders as normal, not fatal.