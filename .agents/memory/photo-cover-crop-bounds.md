---
name: Photo cover crop bounds
description: How to keep user-positioned cover images from exposing blank edges across portrait and landscape frames.
---

Normalized image pan offsets must be clamped again for every rendered frame using the source image aspect ratio, target frame dimensions, cover scale, and user zoom.

**Why:** A crop that is valid in a portrait editor can expose blank edges in a landscape playback frame. Fixed offset limits also allow invalid compositions at low zoom and make vertical dragging inconsistent when width is used to normalize both axes.

**How to apply:** Compute the base `cover` dimensions first, derive remaining overflow independently for X and Y, clamp stored offsets to that overflow after zoom or orientation changes, and normalize vertical drag by frame height.