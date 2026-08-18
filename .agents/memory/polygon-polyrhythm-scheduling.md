---
name: Polygon mode polyrhythm semantics
description: Product semantics decided for the polygon metronome — polyrhythm, mute, and mid-measure change behavior.
---

The polygon metronome is a **polyrhythm** feature: an N-sided layer must sound N evenly-spaced pulses per measure (N-tuplets at the set BPM), never once per engine beat.

**Why:** The user explicitly rejected per-engine-beat firing — "just overlapping same-interval metronomes." 3-sided + 4-sided must sound as 3:4.

**Decided semantics:**
- Mute vertex = silent AND visually off at its slot time, but the slot keeps its time — the period never shrinks.
- BPM / time-signature changes take effect immediately: the remaining slots of the in-flight measure are rescheduled against the new timing (already-fired slots must not re-fire).
- A time-signature change resets the engine's beat counter to 0, so the polygon's measure phase must be re-anchored too, or measure starts drift apart.
- Layer edits during playback silence the rest of the current measure and apply from the next measure (prevents stale-closure fires on deleted vertices).
