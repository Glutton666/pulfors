---
name: Metronome boost path
description: Why boosted volume and XY tone shaping must use pre-rendered PCM rather than player volume.
---

Keep the realtime click path restricted to neutral tone at volume values up to unity. Any volume above unity or non-neutral XY tone position must use pre-rendered PCM with gain applied once, linked limiting, and runtime player volume fixed at unity.

**Why:** Native Expo player volume is capped at unity, while separate web and native gain/compressor paths produced inconsistent output. Applying shaping and boost in shared PCM rendering gives both platforms the same result and preserves a transparent 100% path.

**How to apply:** When changing playback routing, volume handling, sound-set caches, or runtime rerenders, fail closed if required rendering fails. Treat aborts from superseded renders as normal, not fatal.

Limiter transfer must remain continuous where peaks first cross the ceiling. Use immediate linked gain reduction with a short release; switching from whole-buffer bypass to a separate soft-knee curve at the ceiling causes a large audible jump.

Tone shaping may extend click PCM with an audible tail. Measure-render overflow allocation must include the longest PCM from every layer sound set, not only the main set, or late layer tails are truncated instead of wrapping.