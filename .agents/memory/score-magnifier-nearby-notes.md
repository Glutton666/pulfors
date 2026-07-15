---
name: Score editor magnifier must render existing notes, not just the ghost
description: MagnifierView in components/ScoreCanvas.tsx only draws staff lines + ghost preview by default; existing placed notes/rests in the zoomed region are invisible unless explicitly added.
---

`MagnifierView` (the 3x zoom popup shown while placing/dragging a note in Score Mode) renders its own isolated SVG viewBox — it does not automatically include previously-placed notes/rests from the document, only the staff lines and the ghost/preview element.

**Why:** Users tracing/aligning a new note relative to nearby existing notes had no visual reference in the zoomed view, making precise placement hard (reported bug, July 2026).

**How to apply:** When adding any new visual reference to the magnifier, compute the extra elements in `touchToGhost` (where `positions` from `layoutMeasure` are already available for the hovered measure) and attach them to `GhostState` (e.g. `nearbyElements`), then render them in `MagnifierView` from that state — don't try to recompute layout inside `MagnifierView` itself.
