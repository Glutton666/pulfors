---
name: Mode settings profile transitions
description: Ordering rule for switching independently persisted settings profiles.
---

During a mode transition, do not rebuild the newly selected profile from React state rendered for the previous mode. Preserve the profile map on that transition render, apply the destination profile, then let the following render snapshot its values.

**Why:** React state still contains the outgoing mode's settings on the first render after the mode key changes. Writing those values under the new key silently destroys the destination profile.

**How to apply:** Any independently persisted UI/audio profile switch must keep profile storage separate from transient rendered state and include an A→B→A regression test.