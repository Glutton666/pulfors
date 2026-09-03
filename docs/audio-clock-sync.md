# Audio clock synchronization

AudioWorklet 전환 검토 결과와 재검토 조건은
[`audio-worklet-evaluation.md`](./audio-worklet-evaluation.md)에 기록한다.
현재 결정은 프리렌더 + 160 ms look-ahead 유지다.

Web pre-rendered playback uses `AudioContext.currentTime` as its master clock. JavaScript
`performance.now()` remains the fallback clock for per-tick playback and engine scheduling;
the two epochs are never compared directly. `AudioClockAdapter` records an offset mapping
when an output starts and reports elapsed drift from that mapping.

## Diagnostic limits

- Sampling is enabled only in development builds.
- Samples are taken by the playback watchdog, at roughly three-second intervals.
- UI correction threshold: 40 ms, checked no more than once per second.
- Haptic events more than 80 ms late should be skipped rather than emitted in a burst.
- Summaries report current drift, drift per minute, maximum absolute drift, and maximum
  sample-to-sample jitter. They contain no sample names, file URIs, or user data.

## Web buffer handoff

Rendered loop replacements are started at the current source's next audio-buffer boundary.
The old source is stopped at that exact same `AudioContext` time. Both commands are submitted
before the boundary, so a delayed JavaScript callback after scheduling cannot create a gap
or overlap. Gain changes are applied directly to the active gain node and do not render PCM.

## Platform limits

Native `expo-audio` does not expose a scheduling clock precise enough for the same handoff.
Native output therefore keeps the monotonic engine timeline and immediate player-volume
updates. A native gapless engine is intentionally deferred until device measurements justify
the additional native implementation.