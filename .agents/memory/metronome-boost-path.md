---
name: Metronome tone shaping path
description: Why XY tone shaping must use shared rendered PCM rather than separate platform effects.
---

Keep the realtime click path restricted to neutral tone. Non-neutral XY tone shaping must use shared rendered PCM, with gain applied once and linked limiting.

**Why:** Separate web and native gain/compressor paths produced inconsistent output. Shared PCM processing gives both platforms the same shaped waveform.

**How to apply:** When changing playback routing, volume handling, sound-set caches, or runtime rerenders, fail closed if required rendering fails. Treat aborts from superseded renders as normal, not fatal. Keep the active rendered player's output gain synced immediately for volume changes.

Limiter transfer must remain continuous where peaks first cross the ceiling. Use immediate linked gain reduction with a short release; switching from whole-buffer bypass to a separate soft-knee curve at the ceiling causes a large audible jump.

Tone shaping may extend click PCM with an audible tail. Measure-render overflow allocation must include the longest PCM from every layer sound set, not only the main set, or late layer tails are truncated instead of wrapping.

The sound fader's axes are independent effect strengths, not shares of a normalized mix. Compose horizontal temporal shaping (attack/resonance) followed by vertical spectral shaping (high/low), with a single final linked limiter.

**Why:** The user expects both effects together on a diagonal. Sum-normalizing the axes attenuated one setting whenever the other increased. Single-axis voicings must remain unchanged; independence applies to parameters, not to every final acoustic metric.

**How to apply:** Keep each axis's own smooth dead zone, exact centre bypass, saved coordinates and one tail allocation. Verify cardinal PCM against the prior formula and diagonals using level-normalized onset, spectral and resonance-tail measures.

Sound-set selection and its preview may occur in the same event; start the preview after the selection commits, using the shared PCM snapshot and latest-request ownership.

**Why:** Cancelling preview work on an identity change can cancel the newly requested, correct preview when the same event also changes the selected sound.

**How to apply:** Cancel superseded/closed preview requests, but do not start a new selection preview until its identity commit. Physical phone touch and acoustic response still require device testing.