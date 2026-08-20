---
name: Polygon mode polyrhythm semantics
description: Product semantics decided for the polygon metronome — polyrhythm, mute, and mid-measure change behavior.
---

The polygon metronome is a **polyrhythm** feature: an N-sided layer must sound N evenly-spaced pulses per measure (N-tuplets at the set BPM), never once per engine beat.

**Why:** The user explicitly rejected per-engine-beat firing — "just overlapping same-interval metronomes." 3-sided + 4-sided must sound as 3:4.

**Scheduling rule (settled after an overlap bug):** anchor every slot to the engine beat that owns it — each engine beat schedules only slots in its half-open window `[beatStart, beatEnd)`. Never anchor a whole measure to `Date.now()`: the wall clock drifts from the audio clock, and any React dependency-chain re-registration mid-measure kills pending timers and resets phase. The beat handler must read everything via refs so no prop/function identity change re-registers it.

**Decided semantics:**
- Mute vertex = silent AND visually off at its slot time, but the slot keeps its time — the period never shrinks.
- BPM / time-signature changes clear already-scheduled slots; the next engine beat schedules using the latest timing. Do not expect remaining slots in the current beat window to be rescheduled.
- A time-signature change resets the engine's beat counter to 0, so the polygon's measure phase must be re-anchored too, or measure starts drift apart.
- Layer edits during playback silence the rest of the current measure and apply from the next measure (prevents stale-closure fires on deleted vertices).
