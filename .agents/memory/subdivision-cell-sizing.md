---
name: Subdivision cell sizing
description: Keeping the primary metronome subdivision controls compact across display sizes and rotation.
---

Calculate subdivision-cell geometry from the current measured layout and live screen scale only. Cap the control and strong-marker glyph so a single subdivision does not expand disproportionately on a tablet, resized web preview, or rotation.

**Why:** Module-level device classification is captured at import time and can disagree with the current window dimensions. Combining it with a live scale allows a compact control to become unexpectedly large.

**How to apply:** New subdivision visuals should use the shared cell-layout calculation, preserve the minimum size needed for dense patterns, and avoid independently scaling the `S` marker beyond its compact-control cap.