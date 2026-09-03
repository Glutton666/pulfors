---
name: Web realtime first-click lead
description: Why realtime Web Audio playback must not schedule its first click at AudioContext.currentTime.
---

Start realtime Web Audio metronome playback with a small future lead rather than placing the first click exactly at `AudioContext.currentTime`.

**Why:** Browser instrumentation showed the correct high/low buffer order, but the first accent was scheduled at effectively zero lead while later clicks were safely in the future. Browsers can clip or drop that first source during context resume/startup, making the remaining normal clicks sound like the whole pattern.

**How to apply:** Preserve a short start lead for web realtime Beat playback. Verify regressions by tracing scheduled buffer URLs and deadlines, not only engine tick types.