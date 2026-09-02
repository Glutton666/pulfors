---
name: Mode settings profile transitions
description: Ordering rule for switching independently persisted settings profiles.
---

During a mode transition, do not rebuild the newly selected profile from React state rendered for the previous mode. Preserve the profile map on that transition render, apply the destination profile, then let the following render snapshot its values.

Bar mode is a special ownership boundary: its live BPM, meter, beat types, and subdivisions come from the bar document/config. An asynchronously loaded shared mode profile must not apply those fields to either the engine or rendered rhythm state while Bar mode is active.

When moving a mode-specific legacy settings key into the shared profile map, use the legacy object only to fill missing fields. Explicit values already stored in the shared profile always win, including nested mode-only options.

**Why:** React state still contains the outgoing mode's settings on the first render after the mode key changes. Writing those values under the new key silently destroys the destination profile. In Bar mode, a delayed profile load can also overwrite an already-restored bar BPM (for example 60 with stale 120), making playback sound exactly twice as fast while the UI still shows 60.

**How to apply:** Any independently persisted UI/audio profile switch must keep profile storage separate from transient rendered state and include an A→B→A regression test. Keep Bar rhythm fields out of generic profile hydration and persist Bar BPM through its own update path. For legacy migration, merge defaults → legacy → shared and persist the migrated shared profile once.