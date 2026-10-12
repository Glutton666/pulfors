# Offline count audio

## Male/female catalog

Runtime uses `ko-male-*`, `ko-female-*`, `en-male-*`, `en-female-*`.
The legacy language-only files remain for before/after comparison, not playback.
Korean uses native-Seoul catalog speakers: original synthetic Yonsei young adult
steady midlow (`JnZlz7xPh51nt613nRAl`) and Yooni Natural & Clear
(`n2fbxG88jqAoaVPUy3IG`). English uses Eric Smooth & Trustworthy
(`cjVigY5qzO86Huf0OWal`) and Bella Professional Bright Warm
(`hpp4J3VqNfWAUOO0d1Us`). These are distinct catalog speakers, not pitch-shifted
copies or user voice clones.

`scripts/build-voice-count-catalog.mjs` builds the offline catalog. Korean
contextual counting provides concise pronunciation; silence-separated words
are extracted with padding and an exact-count check. English uses individual
words (male fourteen uses the shorter Flash model take). Other clips use
Eleven Multilingual v2 with synthesis speed 1.2. All catalog WAVs then receive
modest offline `atempo=1.15` pitch-preserving time compression, conservative
silence trim, normalization and edge fades. This is not pitch-changing
resampling and does not change BPM, omit numbers, cut syllable endings or
adjust count onset times.

`catalog-durations.json` records source, previous/new duration, processing
and leading silence removed for every number and speaker. Settings uses this
metadata for the selected voice's overlap warning. Naturalness and the
perceived Korean 넷/오 distinction still require human listening; measurements
and automated PCM tests alone cannot establish pronunciation quality.

Voice-only removes primary and additional click layers but retains independent
recorded samples. Count Off restores clicks regardless of the remembered
output option. Speaker/output are immutable per-start audio snapshot values;
decoding identities include the speaker. Android sparse output mixes speech
and clicks into one descriptor per slot so mixed counts do not double the
native event limit.

These are independently generated generic catalog voices, not a cloned user
voice or extracted Tempo audio. No speech generation service is called by the app.

- Korean identifiers 0–9: 공, 일, 둘, 삼, 넷, 오, 육, 칠, 팔, 구.
- English identifiers 0–9: zero, one, two, three, four, five, six, seven, eight, nine.
  Both languages read the ones digit: English 10→zero, 11→one, …16→six.
  The former English 10–16 assets are retained for compatibility, but no longer
  used by the count scheduler or its duration warning.
- `scripts/build-metronome-audio.mjs` builds the legacy clips and Tempo clicks;
  `durations.json` records their lengths for before/after comparisons.
- `scripts/build-count-listening-report.mjs` creates a self-contained HTML
  listening comparison and a number-by-number duration table under the
  git/deployment-ignored `generated-artifacts/voice-count-comparison/` folder.
- Runtime does not cut syllables or omit scheduled numbers to fit short slots.
  Current catalog clips are 206–511 ms long. At 240 BPM with nine subdivisions a
  slot is only 27.8 ms: spoken counts overlap, and clear intelligibility cannot
  be guaranteed. The settings screen explains this limitation.
- Role emphasis is independent of number identity. Count clips are mixed into
  the existing primary-slot PCM render, channel routing and linked limiter;
  rhythm layers and additional click links never create extra voice events.

The adjacent Tempo-style clicks are original mathematical synthesis based on
reference pitch/attack/decay observations. The reference recording is not an
app audio asset.
