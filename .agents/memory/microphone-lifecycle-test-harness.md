---
name: Microphone lifecycle test harness
description: Non-obvious constraints for testing SignalGeneratorModal microphone lifecycles in this repository.
---

Web Audio lifecycle tests must compare context, stream, track, and source counts with a baseline captured after app startup. The app may create an unrelated AudioContext before the microphone is opened, so absolute counts are unstable.

**Why:** The preview app initializes another audio path during startup; absolute constructor-count assertions falsely reported a microphone regression.

**How to apply:** In browser tests, assert deltas after each mic start/stop/restart. In Jest component tests, the repository's React Native stub needs local `FlatList` and `KeyboardAvoidingView` shims when rendering `SignalGeneratorModal`.