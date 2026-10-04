---
name: Dense subdivision visuals
description: Why latest-only local display updates and slot-sized pulses are needed for dense playback.
---

Keep per-slot playback updates local to active display components, rather than re-rendering the screen and its modals for every subdivision. Use a latest-only snapshot, and sample independently clocked output at the frame that applies it.

**Why:** With nine subdivisions, whole-screen commits consumed enough frame time to leave the display behind an unchanged audio timeline. Frame batching alone did not remove the expensive commit.

**How to apply:** Preserve synchronous audio callbacks and native/callback-driven timing. Maintain main-beat side effects separately. Display subscribers must unsubscribe when inactive and clear on stop; no queue of obsolete visual slots should build up.

Pulse at the subdivision cadence with immediate onset and a decay shorter than the current slot. A unique playback/pass/slot identity must distinguish repeated single-beat loops; an expired pulse must not restart after a delayed frame.

**Why:** Main-beat-only pulses and fixed attacks/tails can look slow even with accurate position callbacks; a 50–60ms attack already exceeds a fast nine-way slot.

**How to apply:** Keep accents and mute roles sourced from the existing audio schedule. Do not claim every slot is individually visible below the device's frame interval, or treat headless timestamps as physical speaker/Bluetooth measurements.