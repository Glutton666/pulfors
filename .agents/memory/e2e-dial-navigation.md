---
name: Playwright e2e — mode dial navigation works
description: How e2e tests enter modes (score, menu) via the top-center mode dial, plus RNW Switch/onboarding selector gotchas
---

Playwright CAN drive the ModeSwitcherDial with plain clicks (no drags needed), contrary to the earlier "gesture flows resist e2e" assumption for this component.

**How to apply:**
- Recipe: click `mode-cycle-label` → fan opens at top-center anchor `(winW/2, 0)`, `centAng=90°`, `ANGLE_STEP=34°`, `ICON_R=104`, MODES=[beat,bar,note,stage,score,practice,menu]. Since 2026-08 the fan lays out in READING order: `deg = 90 − off·34°` (next mode to the RIGHT on top wall). Click at `(winW/2 + cos(deg)·104, sin(deg)·104)` to select (tap radius 52px), then click the overlay (e.g. `(winW/2, h·0.75)`) to confirm.
- From beat: bar = +1 → `(cx+58, 86)`; note = +2 → `(cx+96, 39)`; practice = −2 → `(cx−96, 39)`; menu = −1 → `(cx−58, 86)`. For coordinate-based navigation to farther modes, step through a nearer mode first: ±3 can put the calculated click above the viewport at the top wall.
- **Why:** A direct Bar→Practice offset −3 selected nothing in a real browser, while Bar→Beat→Practice worked. A timeout looking for library content was a navigation failure, not an audio failure. **How to apply:** keep each calculated top-wall click within offsets −2…+2 and await the destination screen.
- The dial D-tab handle may persist on any wall (`metronome_dial_wall_v2`); the top-center `mode-cycle-label` route is the reliable one for e2e.
- Onboarding skip: the 건너뛰기 control is a Pressable+Text with NO accessibilityRole — use `getByText(/건너뛰기|Skip/i)`, not `getByRole("button")`.
- RNW `Switch`: wrapper div has no `aria-checked`; read/assert via the inner `<input type=checkbox>`'s `checked` property.
- Score editor note-input taps only make sound after selecting a duration in the palette (`score-palette-dur-quarter`).

## Modal keyboard ownership

React Native Web's Modal dismisses on Escape **keyup**, while the app's global shortcuts and dial process **keydown**. Dismissing a nested control on keydown alone can also dismiss its host on the following keyup.

**Why:** A browser regression check caught the practice book disappearing after Escape even though touch navigation already passed.

**How to apply:** Nested navigation must own handled keys before global shortcuts and consume the matching Escape release even after its keydown closes the nested control. Native Modals have a separate presentation layer; render navigation within that layer rather than closing its host just to reveal an app-level overlay. Verify touch and Escape separately.
