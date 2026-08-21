---
name: Polygon mode polyrhythm semantics
description: Product semantics decided for the polygon metronome — polyrhythm, mute, and mid-measure change behavior.
---

The polygon metronome is a **polyrhythm** feature: an N-sided layer must sound N evenly-spaced pulses per measure (N-tuplets at the set BPM), never once per engine beat.

**Why:** The user explicitly rejected per-engine-beat firing — "just overlapping same-interval metronomes." 3-sided + 4-sided must sound as 3:4.

**Scheduling rule (settled after an overlap bug):** keep the engine beat callback as the logical measure/phase authority and read its mutable inputs via refs, never React state. On Web Audio, schedule a measure's sources against a persistent `AudioContext` anchor (not `Date.now()` or per-slot JS timers); advance later measures from that anchor and only re-anchor after a clearly late callback. Native players lack future-start scheduling, so preserve their engine-beat-driven pooled playback path.

**Why:** Browser main-thread timing can jitter while AudioContext preserves scheduled source timing. A fresh `currentTime` anchor each measure reintroduces audible drift; clearing all sources at a nominal boundary can also cut a valid late-offset source.

**How to apply:** Explicit BPM, meter, stop, disable, and edited/deleted-layer changes cancel obsolete future sources and rebuild at the next safe engine beat. Normal measure transitions do not cancel prior sources; remove their handles when playback ends.

**Decided semantics:**
- Mute vertex = silent AND visually off at its slot time, but the slot keeps its time — the period never shrinks.
- BPM / time-signature changes clear already-scheduled slots; the next engine beat schedules using the latest timing. Do not expect remaining slots in the current beat window to be rescheduled.
- A time-signature change resets the engine's beat counter to 0, so the polygon's measure phase must be re-anchored too, or measure starts drift apart.
- Layer edits during playback silence the rest of the current measure and apply from the next measure (prevents stale-closure fires on deleted vertices).
