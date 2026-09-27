# Android sparse playback prototype

This is an Android sparse-playback prototype. It is not registered for Android
autolinking or connected to app playback. Sparse clip preparation consumes
final rendered PCM, including custom click and note samples, when each audible
region fits in a WAV no larger than 1 MiB. It rejects longer continuous regions:
splitting them across separate SoundPool starts could introduce gaps or clicks.
Other limits are 256 clip segments, 16 MiB total prepared audio, and a one-hour
loop period. Limit failures do not fall back to continuous playback.

Native build/runtime validation and an atomic BPM/bar handoff between the
JavaScript engine and native audio remain unverified. Do not route app playback
through this prototype until those gaps are addressed and validated.