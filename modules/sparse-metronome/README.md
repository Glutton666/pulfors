# Android sparse playback module

This Android native module schedules sparse PCM WAV events against
`elapsedRealtimeNanos`. Each `prepare` descriptor is one event with its own
`id`, `startFrame`, and `durationFrames`; multiple descriptors may reuse the
same WAV `uri` when they describe events from the same sample. Distinct event
IDs preserve each trigger time, and overlapping event tails are played through
independent preprepared `MediaPlayer` voices. Event durations can extend past
loop boundaries; no whole-measure render or continuous silent loop is used.

The app's Android Beat/Bar sparse route is staged behind
`EXPO_PUBLIC_ENABLE_ANDROID_SPARSE_AUDIO=1` until a custom native build and
physical-device checks are complete. Build a development client with this
variable enabled to exercise the route; Expo Go cannot load this native module.
With the flag unset, the existing playback route remains the default. When
the flag is enabled, native preparation/start failure stops playback explicitly
instead of reverting to the legacy continuous player. Locked-screen playback,
audio interruptions, wired-amplifier noise, and acoustic onset timing still
require physical-device validation before enabling it by default.

The existing TypeScript `SparseMetronome.prepare(sessionId, descriptors,
periodFrames)` API is unchanged. A reused URI must declare the same duration
on every event. WAVs must be app-private mono/stereo 16-bit integer PCM at
44.1 kHz, and their frame count must exactly match `durationFrames`.

`start()` acknowledges a first-frame anchor 120 ms in the future as
`startElapsedRealtimeNanos`, paired with an estimated
`startWallClockTimeMillis` so JavaScript can correlate Android elapsed time to
its visual clock. `replace()` and `onSessionReplaced` expose the scheduled loop
boundary in both clocks. Replacement remains at the next loop boundary after
the active epoch; the first event of a new session is not discarded as an
overdue clip if Android wakes the scheduler late.

Explicit Android resource limits are 256 event descriptors, 32 required
overlapping voices per session, 128 MiB per WAV, 256 MiB of unique WAV files
across prepared/retiring sessions, 30 minutes per event, one hour per loop,
and two loaded sessions. Unsupported formats, decoder errors, and over-limit
inputs reject without a compatibility or silent-audio fallback.

The service retains its general foreground notification and playback wake
lock. It does not create a `MediaSession`, transport controls, or a media card.
Android mixer and device latency are variable, so the scheduler is not
sample-exact. Native build and physical-device verification are still required.