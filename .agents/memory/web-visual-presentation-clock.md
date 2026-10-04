---
name: Web visual presentation clock
description: Why audible presentation time must remain separate from rendering and audio reservation time.
---

Align web beat visuals with the browser's audible presentation clock, without moving audio reservations or periodically resetting the playback epoch. Keep audio graph position and audible presentation position distinct.

**Why:** The audio graph renders ahead of device output. Comparing a JavaScript timer directly with the graph clock can leave the display ahead of what the user hears, even when the audio scheduling itself is stable. Periodic phase re-anchoring can also skip the current displayed beat after a stall. Delaying a callback-driven producer together with its visuals does not close the sound/display gap.

**How to apply:** Apply presentation correction only to independently clocked web output. Native and callback-driven Polygon producers retain their existing timing. Audio replacement boundaries still use the graph clock, not the delayed presentation clock. Headless clock tests establish scheduling behavior, not physically measured speaker or Bluetooth latency.