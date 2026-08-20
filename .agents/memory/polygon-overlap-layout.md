---
name: Polygon overlap layout
description: Visual rule for same-sided polygon layers that overlap on the central hub.
---

Layers with the same normalized side count (for example, two 4-sided diamonds) must step outward in insertion order so each outline remains visible. Layers with different side counts keep the shared base radius and every layer remains centered on the hub.

**Why:** Identical overlapping layers previously rendered at exactly the same size, hiding the later-added layer completely.

**How to apply:** Calculate the offset independently for each side-count group, preserve original order within that group, and compress the increment when needed so its outermost layer remains inside the canvas margin.