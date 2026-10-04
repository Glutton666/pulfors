---
name: Metronome tone shaping path
description: Why XY tone shaping must use shared rendered PCM rather than separate platform effects.
---

Keep the realtime click path restricted to neutral tone. Non-neutral XY tone shaping must use shared rendered PCM, with gain applied once and linked limiting.

**Why:** Separate web and native gain/compressor paths produced inconsistent output. Shared PCM processing gives both platforms the same shaped waveform.

**How to apply:** When changing playback routing, volume handling, sound-set caches, or runtime rerenders, fail closed if required rendering fails. Treat aborts from superseded renders as normal, not fatal. Keep the active rendered player's output gain synced immediately for volume changes.

Limiter transfer must remain continuous where peaks first cross the ceiling. Use immediate linked gain reduction with a short release; switching from whole-buffer bypass to a separate soft-knee curve at the ceiling causes a large audible jump.

Tone shaping may extend click PCM with an audible tail. Measure-render overflow allocation must include the longest PCM from every layer sound set, not only the main set, or late layer tails are truncated instead of wrapping.