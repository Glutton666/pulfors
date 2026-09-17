---
name: Bar subdivision drag verification
description: How to verify subdivision-pattern drops when the Bar list begins empty.
---

The Bar editor has two overlapping upward gestures: dragging a subdivision pattern toward the list and swiping the editor panel to add a bar. The subdivision child must own its drag, while the list's full measured bounds—not only existing rows—must accept the drop. A first-time Bar session intentionally contains zero rows, and the unused area below existing rows is also a legitimate destination. Preserve the pattern captured at drag start when creating the row.

**Why:** Row-only hit testing made every first-Bar drop resolve to no target. The ghost visibly reached the empty list, but completion was rejected before the add action. Earlier responder and virtualization explanations did not account for this deterministic empty-session behavior.

**How to apply:** Test empty-list and below-last-row drops, outside-list rejection, pointer cancellation, mouse and touch pointer delivery, and multi-note pattern preservation. Keep real-device verification separate from browser pointer tests.