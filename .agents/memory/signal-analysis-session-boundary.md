---
name: Signal analysis session boundary
description: The architectural boundary between live tuner detection and temporary multi-note timeline analysis.
---

The live microphone tuner and the held-duration analysis timeline are separate pipelines. Live tuning uses a single stable dominant spectral partial, while timeline capture may collect multiple spectral candidates, time buckets, and temporary replay audio.

**Why:** The user clarified that drum tuning should show the loudest actual partial rather than an inferred fundamental, without rapidly switching between drum overtones. Combining live tuning with the multi-note timeline would make normal tuning more expensive and risk its lifecycle.

**How to apply:** Keep the live single-frequency result separate from multi-note timeline analysis. Preserve spectral strength and temporal hysteresis instead of forcing a drum result to a fundamental or a harmonic nearest the target.

Analysis collects while the microphone button is held and finishes on release, not after a fixed ten seconds. Results belong below the live tuner, not in another screen or a generator-details section.

**Why:** The user explicitly replaced the separate ten-second workflow with hold-to-capture and requested removing the redundant details area.

**How to apply:** Preserve tap-to-toggle live detection. Reject late permission, recorder, and playback completions after release, close, or a newer session.

The user wants noise gating in both live detection and held-session analysis, not only the live tuner. The live display should favor a stable, strongest main note; analysis must still allow real simultaneous notes rather than collapsing to that one displayed note.

**Why:** The user requested a gate and a dominant-note live display, then repeated that noise must also be excluded from analysis.

**How to apply:** Keep noise rejection consistent across web/native analysis paths, preserve quiet timeline gaps and actual chords, and leave original replay audio intact. This is detection filtering, not a promise to remove all noise from the recorded waveform.

Drum lug measurement is a third, opt-in path. A locked reference constrains detected candidates, not just the displayed difference. Measure the ring after each hit, reject ambiguous hits, and do not reuse a lock across head/drum changes or fall back to the unrestricted live peak.

**Why:** Matching identical numbers is not meaningful when different lugs are being measured against different resonances. An apparently stable frequency can still be the wrong partial.

**How to apply:** Keep the result tied to a single strike and use contiguous microphone samples on both platforms; do not reconstruct strike timing by polling the live analyser. Report repeatability on real drums separately from synthetic signal tests.

The user chose the existing hold-to-analyze screen to pick a lug reference. Show actual Hz and count distinct successful strikes rather than borrowing the timeline’s note labels or averaging its buckets. Do not auto-select the strongest partial; a reference the user locks must enable post-strike comparison in the tuner without editing the general target.

**Why:** The user wanted to see which resonance was actually being compared without switching to a separate screen.

**How to apply:** Keep recording, playback, and the comparison microphone separate. Locking a reference must cancel pending replay too, so a delayed seek cannot restart audio into the live microphone.

A candidate observed once must still be selectable. Add the nearest note name beside the measured Hz, not instead of it. Drum resonance can outlast the pause between strikes, so silence-only strike detection is not sufficient.

**Why:** The user could only see one-hit candidates and the previous two-hit minimum prevented them from selecting any reference.

**How to apply:** Recommend repeated readings without enforcing them. Count distinct attacks over a ringing tail, and test with overlapping decays as well as silence-separated hits.

For drum lug measurement, analyze low resonances separately instead of just raising microphone sensitivity or treating all spectral peaks alike. Preserve both measured low and high partials, the locked comparison band, and the general tuner's preference for the strongest measured partial.

**Why:** The user reported misses even near 100 Hz. A strong overtone can hide a real low resonance, and relaxing the threshold without rejecting spectral sidelobes can turn sound below range into a false in-range candidate.

**How to apply:** Validate both weak and short low resonances beside louder overtones, and test below-range input with no real in-range resonance before relaxing bass thresholds.