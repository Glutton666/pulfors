---
name: Mode settings profile transitions
description: Ordering rule for switching independently persisted settings profiles.
---

During a mode transition, do not rebuild the newly selected profile from React state rendered for the previous mode. Preserve the profile map on that transition render, apply the destination profile, then let the following render snapshot its values.

Bar mode is a special ownership boundary: its live BPM, meter, beat types, and subdivisions come from the bar document/config. An asynchronously loaded shared mode profile must not apply those fields to either the engine or rendered rhythm state while Bar mode is active.

Playback and secondary surfaces such as Stage mode must read one canonical active-mode snapshot, not shared React rhythm state. Every editor path—including keyboard shortcuts, Back/Escape exits, manual entry selection, and seamless entry advance—must synchronously update or transition that snapshot before changing the active mode or starting playback.

When moving a mode-specific legacy settings key into the shared profile map, use the legacy object only to fill missing fields. Explicit values already stored in the shared profile always win, including nested mode-only options.

**Why:** React state still contains the outgoing mode's settings on the first render after the mode key changes. Writing those values under the new key silently destroys the destination profile. In Bar mode, a delayed profile load can also overwrite an already-restored bar BPM (for example 60 with stale 120), making playback sound exactly twice as fast while the UI still shows 60. Direct mode setters and editors that update only React state recreate the same race during Back/Escape, setlist advance, or an immediate play action.

**How to apply:** Any independently persisted UI/audio profile switch must keep profile storage separate from transient rendered state and include an A→B→A regression test. Route all exits through the profile-aware transition API. Update the active profile ref before scheduling React state, and configure playback from that ref. Keep Bar rhythm fields out of generic profile hydration and persist Bar BPM through its own update path. For legacy migration, merge defaults → legacy → shared and persist the migrated shared profile once.