---
name: Audio warm-up isolation
description: Why delayed playback-based audio warm-up must not touch live metronome resources.
---

Do not implement audio warm-up by muting and playing the shared round-robin click pool after the UI becomes interactive. Prefer lazy pool creation without playback; if decoding warm-up is ever required, it must complete before playback can start or use fully isolated resources.

**Why:** A delayed silent warm-up can overlap a user pressing Play. Shared player volume restoration makes Beat mode start quietly, while simultaneous silent native tracks can also affect rendered Bar playback at the same timing.

**How to apply:** Playback startup must own all active audio resources. No background timer should play, pause, seek, or change the volume of resources that the engine may use.