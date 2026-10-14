---
name: Bar TTS file ownership
description: Safe reclamation of generated Bar TTS files across persistence, generation, playback, and export.
---

Treat file cleanup as an ownership check, not just a storage-map diff. A file remains live while any saved entry references it, a save is pending, native generation has not been claimed, or playback/export holds a lease. Only sweep after a successful durable reference write or after a live-use lease ends.

**Why:** A failed or delayed save must not turn a still-needed original into an orphan, and waiting on a debounced save while holding the storage lock can prevent that save from ever settling.

**How to apply:** When adding another persistence or audio-use path for generated TTS, include its references in the liveness model and serialize actual storage commits with sweeps without blocking debounced callers.
