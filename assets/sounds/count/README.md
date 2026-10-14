# Offline count audio

## Count voices

Korean counts use the phone's installed **offline** Android or iOS Korean
speech engine. The app converts the exact syllables 공·일·둘·삼·넷·오·육·칠·팔·구
to PCM before starting playback, then the regular metronome renderer schedules
those samples together with clicks. It does not call `speak()` on a beat, which
would let speech-engine startup latency move the count. The first start can
take longer while the required words are synthesized; subsequent starts reuse
generated PCM while it remains in the selected voice ID's number cache.

iOS reads actual system gender metadata. Android does not expose a standardized
voice-gender field, so it accepts only offline Korean voice IDs with explicit
male/female markers. If the device does not have the requested role, playback
fails clearly rather than using another role, a network voice, or English.
Neither role is produced by pitch-shifting the other. Korean phone voices vary
by installed engine; naturalness still needs confirmation by listening on
each real device. Web disables this option because browser speech is not an
offline guarantee. Expo Go also disables it when the app's native TTS module
is absent; use a native app build to access that local module.

English retains its existing bundled male/female word recordings and cache.
Bar-entry text-to-speech remains a separate feature and is not changed.
`scripts/build-voice-count-catalog.mjs` rebuilds English only; it rejects
Korean asset generation so rejected WAV candidates cannot silently return to
the app. Existing Korean WAVs and their duration records are historical
comparison material and are not played by the app.

`catalog-durations.json` describes the historical bundled clips; those
durations do not describe a phone's synthesized Korean voice. Automated
duration or PCM-format checks cannot establish natural Korean pronunciation.
The earlier bundled Korean candidates were rejected after listening reports
that 넷 could sound like “네스,” 오 like “어,” and both could be drawn out.
The Supertonic 2 M1/F1 candidate received the same rejection.

Voice-only removes primary and additional click layers but retains independent
recorded samples. Count Off restores clicks regardless of the remembered
output option. Speaker/output are immutable per-start audio snapshot values;
decoding identities include the speaker. Android sparse output mixes speech
and clicks into one descriptor per slot so mixed counts do not double the
native event limit.

English recordings are independently generated generic catalog voices, not
cloned user voices or extracted Tempo audio. Korean speech generation happens
on-device and uses no external speech service or account.

- Korean identifiers 0–9: 공, 일, 둘, 삼, 넷, 오, 육, 칠, 팔, 구.
- English identifiers 0–9: zero, one, two, three, four, five, six, seven, eight, nine.
  Both languages read the ones digit: English 10→zero, 11→one, …16→six.
  The former English 10–16 assets are retained for compatibility, but no longer
  used by the count scheduler or its duration warning.
- `scripts/build-metronome-audio.mjs` builds the legacy clips and Tempo clicks;
  `durations.json` records their lengths for before/after comparisons.
- The archived listening reports compare old candidate WAV files only. They
  are not a verification of the current on-device voices.
- Runtime does not cut syllables or omit scheduled numbers to fit short slots.
  Phone TTS durations vary by voice. At 240 BPM with nine subdivisions a
  slot is only 27.8 ms: spoken counts overlap, and clear intelligibility cannot
  be guaranteed. The settings screen explains this limitation.
- Role emphasis is independent of number identity. Count clips are mixed into
  the existing primary-slot PCM render, channel routing and linked limiter;
  rhythm layers and additional click links never create extra voice events.

The adjacent Tempo-style clicks are original mathematical synthesis based on
reference pitch/attack/decay observations. The reference recording is not an
app audio asset.
