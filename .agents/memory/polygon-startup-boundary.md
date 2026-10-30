---
name: Polygon startup boundary
description: Polygon owns its audio producer and must not inherit ordinary rendered playback or an underlying Bar transport.
---

Polygon starts from its own producer's audio activity, not an ordinary Beat/Bar rendered player. Its engine schedule is only a beat clock and must remain independent of the underlying Bar contents and play-once policy.

**Why:** Native metronome startup always selected a rendered loop, so cancelling or superseding an unrelated Beat render could abort Polygon startup even though web realtime startup passed. Inheriting an empty Bar or its stop-after-measure policy can also prevent or prematurely end the polygon clock.

**How to apply:** Keep Polygon out of ordinary rendered and Android sparse starts, preserve shared audio ownership, and verify startup from both Beat and empty/play-once Bar states. Mocked native startup regressions and browser playback do not replace verification in an installed native build.
