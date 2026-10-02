---
name: Native player status instability
description: Historical device failure showing why transient helper-player status is not an authoritative transport command.
---

Do not interpret a silent helper player's status changes as commands to pause or resume real audible playback. Native status can flip transiently during creation and teardown.

**Why:** On a real Android device, bridging a new keepalive's transient status to real transport caused repeated stop/start cycles and Java heap exhaustion within seconds. Each restart created another helper that could produce the same transient signal.

**How to apply:** The no-MediaSession background hold deliberately has no helper-status transport bridge. If a future feature restores remote transport handling, use actual command events where possible; otherwise distinguish lifecycle transients from deliberate commands and test rapid creation/teardown. Do not reintroduce the old bridge merely to preserve a system media card.
