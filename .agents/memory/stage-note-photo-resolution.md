---
name: Stage note photo resolution
description: Rules for choosing the image shown for saved note queues in Stage mode.
---

Stage mode should prefer a note parent’s own photo for backwards compatibility; only when it has no usable local photo should it show the currently selected queue child’s photo. Invalid or remote URIs should resolve to no image rather than being rendered.

**Why:** Older saved note entries may store one photo on the parent, while newer queue entries store photos independently. Treating both shapes consistently prevents existing stage setups from changing unexpectedly and avoids unsafe persisted URLs.

**How to apply:** Keep parent-first resolution and local-scheme validation in a small pure helper so queue-index transitions and malformed-data behavior remain straightforward to test.