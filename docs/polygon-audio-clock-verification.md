# Polygon audio clock verification

## Automated coverage

Run the focused regression suite before a release:

```sh
npx jest __tests__/usePolygonMode.test.ts --runInBand
```

The suite covers:

- A 4:4 polygon scheduling all four clicks on one Web Audio clock.
- 3:4 and 5:4 layers sharing the same measure anchor at 300 BPM.
- Custom/decoded PCM sources starting at future `AudioContext` times.
- Cancellation of future sources after a layer edit or playback stop.
- Existing native pooled-player, vertex role, mute, volume, offset, and meter behavior.

## Physical-device listening checklist

Use wired headphones or a low-latency output path. Repeat each case on a real
Android and iOS build because their audio players cannot reserve a future start
time in the same way as Web Audio.

1. Start Polygon mode at **300 BPM**, 4/4, with one 5-sided layer and one
   3-sided layer. Listen for steady, repeating 5:4 and 3:4 relationships for
   at least 30 seconds; there should be no drifting or doubled clicks.
2. While it is playing, change BPM twice and change the meter once. The old
   future clicks must stop, and the new rhythm must begin from the next engine
   beat without an extra click.
3. Change a layer's side count, vertex role, offset, sound set, and volume
   during playback. Only the edited layer may change; muted vertices must stay
   silent and strong/accent/normal vertices must keep their intended sound.
4. Stop halfway through a measure, wait one second, then restart. No sound
   from the stopped measure may leak into the next start; the first vertex
   should be the measure anchor.
5. Repeat steps 1–4 after briefly backgrounding and returning to the app.
   Record the device model, OS version, output route, and any audible issue in
   the release test notes.