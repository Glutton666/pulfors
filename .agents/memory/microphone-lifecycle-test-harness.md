---
name: Microphone lifecycle test harness
description: Non-obvious constraints for testing SignalGeneratorModal microphone lifecycles in this repository.
---

Web Audio lifecycle tests must compare context, stream, track, and source counts with a baseline captured after app startup. The app may create an unrelated AudioContext before the microphone is opened, so absolute counts are unstable.

**Why:** The preview app initializes another audio path during startup; absolute constructor-count assertions falsely reported a microphone regression.

**How to apply:** In browser tests, assert deltas after each mic start/stop/restart. In Jest component tests, the repository's React Native stub needs local `FlatList` and `KeyboardAvoidingView` shims when rendering `SignalGeneratorModal`.

Microphone result assertions must target the detected input, not arbitrary frequency/note text elsewhere in the generator.

**Why:** The generator already displays 440 Hz / A4 without any microphone input. Broad text matches can falsely pass a broken detection test or falsely fail a stale-callback test.

**How to apply:** Scope frequency and note checks to the microphone result, and verify that no result appears before PCM arrives.

Cent-difference assertions should use the detected frequency rather than the nominal frequency of a synthetic test tone.

**Why:** FFT estimation and Hz rounding can shift the reading slightly, enough to change rounded cents by one without any target-state bug.

**How to apply:** Derive expected cents from the displayed detected Hz and selected target. Check the detector's absolute accuracy separately with an appropriate tolerance.

Native recorder test doubles must own subscriptions per recorder instance.

**Why:** An old lifetime can finish cleanup after a new lifetime starts. A mock that clears every recorder's listeners invents a cross-instance cleanup failure that the real subscription API does not have.

**How to apply:** Keep callback ownership local to each mocked recorder, while checking aggregate starts/stops separately.