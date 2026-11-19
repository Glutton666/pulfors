---
name: Mode dial top-center anchoring
description: Why the mode switcher fan must bypass anchorPos/safeT when anchored to the top-center text label
---

The ModeSwitcherDial's `anchorPos` applies `safeT`, a camera-safe zone that shoves top-wall `t` values in (0.28, 0.72) out to 0.25/0.75. So requesting `{wall:"top", t:0.5}` silently renders at 75% width.

**Why:** safeT exists so the draggable D-tab avoids the notch/Dynamic Island; a text-label-anchored fan (hideHandle mode) must ignore it.

**How to apply:** In hideHandle mode, bypass the draggable tab's safeT calculation and pin ALL geometry (`wall`, `effectiveArcParams`, `fanBgLayout`, etc.) to the top-center WallPos. Native fans must clear the real camera cutout; web body padding must not be interpreted as a hardware inset. Overriding only the anchor while geometry still reads stored wallPos misplaces the fan.

Keep the entire rotating menu and its touch bounds below the cutout, not only the fan center. Use actual safe-area information, including side cutouts after rotation.

**Why:** The user explicitly chose to avoid Dynamic Island overlap rather than rely on partly covered controls. Native hit testing can reject visible children outside a zero-size parent, so visual placement alone is insufficient.

**How to apply:** Maintain a bounded, nonzero touch container around the fixed fan and keep its animation origin and gesture coordinates aligned. Do not claim a browser geometry check establishes physical iPhone touch behavior.

Keep the dial's touch bounds independent of its opening scale. Animate only its visuals.

**Why:** Scaling the responder along with the fan lets a quick initial drag hit the confirmation backdrop instead, so the dial either stays on the same mode or closes.

**How to apply:** Test hit ownership as the fan mounts, not only after waiting for it to settle. Keep the stationary bounds aligned with the final radial slots and retain the same backdrop-confirmation behavior.

## Closed header placement

Keep the mode trigger in the upper-center safe header band. Beat settings belong at upper-right in portrait and upper-left only in landscape, with space from the screen edges. Bar settings remain in the original lower editor toolbar.

**Why:** The user corrected the earlier upper-left request: settings should be at the right corner except in landscape, and neither the dial nor settings should be obscured or pushed against the edges. They separately requested Bar's old position because blanket repositioning obscured UI. Web body padding is not a physical browser safe-area inset.

**How to apply:** Respect real native safe areas and reserve the header's occupied height so the body cannot sit behind it. Do not extend Beat's settings position to every mode. Keep Note's mode-switch trigger available and its settings action distinct from document actions without covering the practice area.
