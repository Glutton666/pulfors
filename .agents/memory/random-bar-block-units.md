---
name: Random Bar block units
description: Product semantics for random Bar playback when loop blocks and end markers coexist.
---

Random Bar playback treats each top-level block and each ungrouped Bar as one independently selectable unit. Consecutive duplicate selections are allowed. A selected block must finish its internal order, nested structure, and repeats before the next selection.

**Why:** Generating or replaying random orders as individual Bar indexes can silently dissolve blocks. Filtering the block snapshot at an end marker can also make display, replay, and saved sessions disagree with actual playback.

**How to apply:** Keep an immutable full block snapshot with each random session. Limit eligible unit starts at the first end marker, but if an eligible block crosses that marker, preserve and execute the complete block.