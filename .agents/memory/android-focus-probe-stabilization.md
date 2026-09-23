---
name: Android focus probe stabilization
description: Why the fallback Android playback-status probe must debounce focus loss and recovery.
---

The fallback Android audio-focus probe must require multiple consecutive playback-status samples before declaring focus loss or gain. Alternating `playing=false/true` samples are transport instability, not evidence of repeated OS interruptions.

**Why:** A real Android device produced dozens of pause/recovery transitions in rapid succession and then terminated. The fallback probe was treating every single 50 ms status edge as authoritative, so unstable player status could synchronously drive the interruption auto-resume path over and over.

**How to apply:** Keep the high-frequency polling needed for interruption detection, but stabilize state transitions across consecutive samples. Preserve immediate handling for a future native interruption-listener API because those events are authoritative. Test both sustained loss/gain and rapid alternating status signals.