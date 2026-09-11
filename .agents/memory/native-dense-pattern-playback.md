---
name: Native dense-pattern playback
description: Why ordinary native Beat playback prefers a rendered loop over pooled per-tick players.
---

Ordinary native Beat playback should attempt a deterministic rendered loop first and use pooled realtime playback only as a render-failure fallback.

**Why:** Native pooled players require asynchronous seek-before-play. With dense subdivisions, different role pools can complete out of order at a measure boundary, making the next accent sound like an extra normal tick and causing audible level and visual-order mismatches.

**How to apply:** Keep native startup and native mid-session rerenders rendered-first. Start the rendered player request and engine in the same synchronous turn, publish playing UI only after confirmation, and explicitly release pending boundary-handoff players when superseded or stopped.