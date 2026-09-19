---
name: Supplemental interruption ownership
description: Ownership rules when OS audio interruptions affect Score playback independently of the main metronome.
---

Track main-metronome and supplemental-playback interruption ownership separately. Resume only the transport that was actually running and paused when the interruption began.

**Why:** The global metronome bridge remains registered while other screens play Score audio. A shared interruption flag can start an idle metronome during Score recovery. Deferred resume intent can also resurrect Score after an explicit stop.

**How to apply:** Gate each transport’s recovery on its own ownership flag, clear supplemental resume intent on explicit stop/document replacement/unmount, and use synchronous refs for preparation guards so fast begin/end events do not depend on React rerenders.