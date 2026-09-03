---
name: Pre-render audio epoch
description: Preventing stale async audio renders and replaced sample decodes from becoming active.
---

All producers of pre-rendered audio for one playback screen must share a single monotonically increasing epoch. Settings changes, sample replacement, stop, and teardown invalidate that epoch synchronously; async producers verify it before installing players or pending actions.

**Why:** Separate per-hook guards allow a slow initial render to overwrite a newer scheduled render. A beat-position-only PCM cache can also accept a late decode from a sample URI that has already been replaced.

**How to apply:** When adding a pre-render path, participate in the screen-owned epoch rather than creating a local guard. Cache decoded samples only when both their position key and source URI still match the current sample map.

For Web Audio replacement, keep the old source alive while the latest generation renders. Schedule old/new sources at one audio-clock boundary only when their rendered durations are phase-compatible; duration-changing edits must switch on the new engine boundary. If the latest render fails, release old pre-render ownership and restore real-time output instead of leaving stale audio active.

**Why:** Reusing an old buffer boundary after a BPM or meter change offsets the new engine timeline, while preserving an old loop after replacement failure can permanently suppress the updated real-time schedule.

**How to apply:** Treat replacement as a transaction: preserve old output during work, validate generation and duration on success, and explicitly fall back on current-generation failure.