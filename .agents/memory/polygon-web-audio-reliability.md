---
name: Polygon web audio reliability
description: Why Polygon web playback uses per-vertex realtime PCM instead of whole-measure future scheduling.
---

Polygon web playback should trigger each layer's resolved PCM at the vertex timer, with the standard web click as a fallback when PCM or the AudioContext is unavailable.

**Why:** Whole-measure AudioContext future scheduling produced a browser failure where Polygon animation continued but every Polygon sound was silent. Falling back only after detecting a scheduling error was insufficient because a scheduled source can exist without producing audible output.

**How to apply:** Preserve each layer's built-in or custom sound set, role, volume, offsets, mute slots, and N-events-per-measure timing. If direct PCM playback cannot start, use the proven standard web click path with the same role and gain. Do not mute the base click and depend solely on an unverified future-scheduling path.