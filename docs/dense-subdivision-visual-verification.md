# Dense subdivision visual timing verification

## Scope and confirmed causes

This change addresses playback presentation, not circular pattern entry or audio
backend replacement. Audio reservation deadlines, PCM schedules, accents, mute
slots, repeat order, and requested tempo are not changed.

The investigation separated three problems:

1. A subdivision state update caused the entire screen, including its modal
   tree, to render. Batching updates once per frame did not make that render
   inexpensive. At 240 BPM / nine slots, a whole-screen commit path measured a
   median position-update lag of approximately 51ms. Local display subscribers
   reduced this to approximately 19–22ms in subsequent iframe probes.
2. Dial pulses had a 50ms attack and 150ms deactivation trail; center pulses had
   a 60ms attack and followed only main beats. A nine-way slot at 240 BPM lasts
   27.8ms. Before the fix, the center produced about 11 peaks while approximately
   97 subdivision onsets occurred in the measured interval.
3. Realtime presentation correction subtracted output latency but assumed that
   the audio graph and performance clock had advanced together. The browser
   probe observed an AudioContext that initially did not advance with wall time.
   Visuals now map presentation time through the SAME clock adapter used by
   click reservations. The adapter and reservation deadlines are not reset.

## Implementation boundaries

- Independently clocked playback can be read at the applying frame without
  invoking audio callbacks or seeking/restarting output.
- Callback-driven native/Polygon output retains callback timing.
- A latest-only immutable visual mailbox notifies display components locally.
  Stopped/hidden consumers unsubscribe. Main-beat side effects remain separate.
- Web frame commits are synchronous inside the existing rAF batch. Native uses
  React Native's batched updates; no web renderer is bundled into native.
- Pulses have immediate onset and a decay shorter than the actual slot.
  Delayed/expired pulses are not queued or restarted. Pulse identities include
  the playback lifetime/pass/slot, including single-beat loops.
- Existing positive/negative visual offsets are retained exactly once.
- Unknown random/finite/pending boundary handoffs are not extrapolated.

## Browser measurements

The real Expo app ran inside an iframe with autoplay permission, using Chromium
and the existing Pixel 5 viewport. An AudioBufferSource start probe recorded
audio graph deadlines; output timestamps estimated presentation position.
DOM sampling observed applied subdivision states and center-glow peaks.
Noninteractive data attributes also measured callback-to-frame queue time and
frame-sample-to-DOM-commit time. These are not physical speaker measurements.

Representative final readings:

| Condition | Median position-update lag | P95 lag | Median frame queue | Median DOM commit |
| --- | ---: | ---: | ---: | ---: |
| 120 BPM / 3 slots / realtime | 17.8ms | 65.8ms | 4.9ms | 9.7ms |
| 120 BPM / 9 slots / realtime | 21.0ms | 51.3ms | 9.0ms | 9.8ms |
| 240 BPM / 3 slots / realtime | 15.5ms | 45.0ms | 5.7ms | 8.1ms |
| 240 BPM / 9 slots / realtime | 22.1ms | 52.1ms | 7.6ms | 8.6ms |
| 240 BPM / 9 slots / tone-shaped prerender | 18.9ms | 55.2ms | 5.9ms | 8.1ms |
| 120 BPM / 6 slots / realtime | 20.1ms | 44.0ms | 11.3ms | 8.1ms |

The six-way 120 BPM and three-way 240 BPM cases both produce 12 slots/second,
separating slot density from BPM. Each BPM also has 1/3/9-way comparisons at the
same neutral output settings. Tone shaping, not above-unity volume, selects the
prerender case: the current application clamps built-in volume to unity.

At 120 BPM / nine slots, the center produced 47 observed peaks for approximately
48 onsets. At 240 BPM / nine slots, peaks and individual frames are sometimes
missed. This is bounded frame loss, NOT a guarantee that every slot is separately
visible. The latest position is retained instead of replaying obsolete slots.

The browser probes cover repeat boundaries, startup/steady playback, a deliberate
130ms JS stall with recovery checks, stop, glow clearing, and restart. Fake-clock
tests additionally cover 40 missed measures without callback replay, single-beat
loops, tempo changes, signed offsets, coincident layer ticks, and mute roles.

## Verification

- TypeScript: `npx tsc --noEmit` passed.
- Jest: 183 suites / 2,425 tests passed.
- Browser matrix: eight scenarios passed across the final matrix and the targeted
  realtime/prerender dense recovery runs.
- Web, iOS, and Android production bundles exported successfully with
  `npx expo export --platform all --output-dir /tmp/visual-sync-export`.
- Native bundle success is NOT a physical native-device UI/audio test.

## Remaining limitations

- No connected iPhone/Android or physical speaker/Bluetooth measurement was
  available. Device/output-route latency remains unverified.
- Firefox/WebKit presentation-clock and iframe behavior remain unverified.
- Performance readings are development/headless-browser observations and vary
  with load; they are not universal millisecond guarantees.
- The generic initial screenshot can precede font readiness. Browser scenarios
  explicitly wait for the real play control before measuring playback.