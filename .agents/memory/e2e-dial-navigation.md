---
name: Playwright e2e — mode dial navigation works
description: How e2e tests enter modes (score, menu) via the top-center mode dial, plus RNW Switch/onboarding selector gotchas
---

Playwright CAN drive the ModeSwitcherDial with plain clicks (no drags needed), contrary to the earlier "gesture flows resist e2e" assumption for this component.

**How to apply:**
- Recipe: click `mode-cycle-label` → fan opens at top-center anchor `(winW/2, 0)`, `centAng=90°`, `ANGLE_STEP=34°`, `ICON_R=104`, MODES=[beat,bar,note,stage,score,practice,menu] (reordered 2026-08; recompute offsets if changed again). Click at `(winW/2 + cos(90+off·34°)·104, sin·104)` to select (tap radius 52px), then click the overlay (e.g. `(winW/2, h·0.7)`) to confirm.
- From beat: bar = +1 → `(cx−58, 86)`; note = +2 → `(cx−96, 39)`; stage = +3; score = −3; practice = −2 → `(cx+96, 39)`; menu = −1 → `(cx+58, 86)`. From menu: beat = +1 → `(cx−58, 86)`.
- Onboarding skip: the 건너뛰기 control is a Pressable+Text with NO accessibilityRole — use `getByText(/건너뛰기|Skip/i)`, not `getByRole("button")`.
- RNW `Switch`: wrapper div has no `aria-checked`; read/assert via the inner `<input type=checkbox>`'s `checked` property.
- Playwright works locally: `npm i -D @playwright/test` + `npx playwright install chromium` (headless shell runs fine on this Replit). Many old e2e selectors (`menu-button`, `menu-overlay`, `score-list-back`, `score-editor-more-menu`-era flows) referenced UI that no longer exists — always probe live testids with a throwaway spec before trusting spec selectors.
- Score editor note-input taps only make sound after selecting a duration in the palette (`score-palette-dur-quarter`).
