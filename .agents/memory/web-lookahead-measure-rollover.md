---
name: Web look-ahead measure rollover
description: Distinguishes normal measure advancement from destructive cancellation of reserved Web Audio sources.
---

On a normal measure rollover, clear the old measure's scheduled-tick identities but do not invoke the callback that stops reserved AudioContext sources. Reserve destructive queue clearing for stop, configuration rebuild, scheduler replacement, and output-mode changes.

**Why:** The JS engine can cross the measure boundary while the final source is only just starting on the AudioContext clock, particularly with audio offset correction. Cancelling the whole queue at rollover makes the last beat consistently silent even though scheduling traces show it was reserved correctly.

**How to apply:** Any lifecycle operation that merely advances continuous playback should preserve in-flight audio-clock sources. Operations that invalidate the timeline or explicitly stop playback should cancel them.