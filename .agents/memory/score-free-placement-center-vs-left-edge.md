---
name: Score free-placement X must be treated as note center, not left edge
description: layoutMeasure's placedX free-placement branch previously interpreted placedX as a note's left edge, causing every user-placed note to render ~half a notehead-width to the right of where it was tapped.
---

In free-placement mode (`layoutMeasure` in `lib/score-layout.ts`), `element.placedX` is captured
in `ScoreCanvas.tsx`'s `touchToGhost` as `lx - contentX` — the same coordinate used for the ghost
note's `x`, which `GhostNote`/`NoteElement` render as the note head's **center** (`cx={x}` on the
SVG `Ellipse`). The fallback sequential-layout positions (`seqLeftX`), by contrast, are genuinely
**left-edge** coordinates that later get `+ width/2` added to become a center.

The 50%-overlap-clamp loop used a single `getX()` helper for both cases and treated the result as a
left edge for both, so real `placedX` values got an extra `+ width/2` shift applied on top of an
already-center coordinate — every tapped/dragged note rendered offset to the right by half a
notehead width (~12px at default note width).

**Why:** two different position semantics (center vs. left-edge) were merged into one code path
without normalizing units first — an easy trap whenever a layout algorithm mixes "anchor points"
that come from different producers.

**How to apply:** when `el.placedX != null`, convert it to a left edge (`placedX - width/2`) before
running the shared overlap-clamp math; only the true left-edge fallback values should be used as-is.
Verify with a direct `layoutMeasure()` unit call (not just e2e) — feed a single placed element and
assert the returned `x` equals the input `placedX` exactly.

## Follow-up: the overlap-clamp itself was pitch-agnostic

A second, related bug: the 50%-overlap horizontal clamp compared X positions only, ignoring Y
(pitch). Two notes placed at (nearly) the same X but on different staff lines/spaces — i.e. a
chord-like vertical stack, which is normal notation — got shoved apart horizontally as if they were
sequential notes on the same beat-line. There is no chord data model here (`ScoreNote` has a single
`pitch`), so "stacking" is purely visual: two separate elements placed at the same X with different Y.

**Why:** the clamp loop tracked a single running `lastEnd` in X only; it never checked whether the
previous note was vertically far enough away to visually avoid collision.

**How to apply:** only apply the X overlap clamp between two elements when their Y distance is less
than `NOTE_HEAD_RY * 2` (notehead diameter, ~8px at default `LINE_SPACING=10`). Compare each new
element against all previously-placed ones (small n per measure, so O(n²) pairwise is fine), not just
the immediately-preceding one in X-sorted order. Verify with a direct `layoutMeasure()` call: two
notes with very different pitch and the same `placedX` should return equal `x`; two notes with the
same/near pitch and the same `placedX` should still get clamped apart.
