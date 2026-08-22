---
name: Circular dial snap seams
description: How to avoid full-spin animations when a circular dial snaps across its wrap boundary.
---

Circular dial state can stay in a canonical range, but its animated position must snap to the equivalent integer nearest to the current visual value. For example, a wrapped position near the final slot that logically snaps to index zero should animate toward the next full-cycle zero, not backward across the whole dial.

**Why:** Canonicalizing the spring target creates a conspicuous full-dial spin at the wrap seam even though the logical adjacent selection is correct.

**How to apply:** Whenever a circular gesture has separate logical selection and animated position, choose the spring target by adding or subtracting whole cycle lengths until it is nearest to the current animated/wrapped value. Add tests for both directions across the seam.

For an even number of slots, an exactly half-cycle target is distance-tied. Break that tie with the same signed circular offset used to draw the icon: the item displayed on the left must rotate left, and the item displayed on the right must rotate right.

**Why:** A fixed "always forward" half-cycle rule can visibly move opposite the button the user pressed.

**How to apply:** Keep hit-test, render, and spring-target offset math aligned; cover the half-cycle and fractional wrap boundary in unit tests.