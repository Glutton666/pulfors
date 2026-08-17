---
name: e2e settings seeding limits
description: Which metronome settings can/can't be seeded via localStorage metronome_settings in e2e tests
---

Seeding `metronome_settings` in localStorage works for `bpm`, `beatsPerMeasure`, `subdivisionPattern`, `beatSubdivisions`, volume — the settings loader restores those.

**But `beatTypes` is NOT restored from `metronome_settings`** — beat types come from dial/bar config persistence and otherwise default (beat 0 = accent-style default). Seeding `beatTypes` there is silently ignored.

**How to apply:** to e2e-test beat-type-dependent behavior (mute beat, strong promotion), either seed the dial/bar config storage key or change beat types through the UI; don't trust `beatTypes` in a `metronome_settings` seed.

**Theme seeding:** seeding only the theme-color keys is not enough — the onboarding-complete handler and the settings loader both re-apply theme afterward and clobber the seed. To e2e-test a custom theme, seed the onboarding-done flag AND include the theme in the main settings blob so the loader re-applies the same value (grep useMetronomeScreen for the current key names).

Related: during playback the SubdivisionBar shows the live per-beat pattern via `pureGetSubPattern` (same transform as audio: mute beat → all-mute rings, strong/accent promote first cell); the staged global pattern is a clipboard only and is never played.
