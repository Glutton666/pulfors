# Offline count audio

These are independently generated generic catalog voices, not a cloned user
voice or extracted Tempo audio. No speech generation service is called by the app.

- Korean identifiers 0–9: 공, 일, 둘, 삼, 넷, 오, 육, 칠, 팔, 구.
- English identifiers 0–16: full English number words.
- `scripts/build-metronome-audio.mjs` converts the generated source clips to
  bundled mono 44.1 kHz PCM WAVs, removes quiet lead/trailing space, normalizes
  levels and adds short edge fades. `durations.json` records measured lengths.
- Runtime does not cut syllables or omit scheduled numbers to fit short slots.
  Clips are approximately 221–569 ms long. At 240 BPM with nine subdivisions a
  slot is only 27.8 ms: spoken counts overlap, and clear intelligibility cannot
  be guaranteed. The settings screen explains this limitation.
- Role emphasis is independent of number identity. Count clips are mixed into
  the existing primary-slot PCM render, channel routing and linked limiter;
  rhythm layers and additional click links never create extra voice events.

The adjacent Tempo-style clicks are original mathematical synthesis based on
reference pitch/attack/decay observations. The reference recording is not an
app audio asset.
