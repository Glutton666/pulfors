---
name: Score editor scrolling vs. note/rest tap-to-place gestures
description: The main score ScrollView previously disabled scrolling whenever activeTool was "note"/"rest" so single-finger drags would place notes instead of scrolling. This blocked all scrolling (mouse wheel, trackpad, touch drag) most of the time since "note" is the default tool.
---

**Resolution (current):** `scrollEnabled` on the main ScrollView in `components/ScoreEditorScreen.tsx` is now always `true`. Instead, `components/ScoreCanvas.tsx`'s `PanResponder.onStartShouldSetPanResponder`/`onMoveShouldSetPanResponder` check `e.nativeEvent.touches.length <= 1` — multi-touch (2-finger) gestures are ignored by the canvas responder and fall through to native scroll, while single-finger/mouse taps still place notes as before. Mouse wheel scroll is unaffected by PanResponder entirely (it's not a touch gesture), so making `scrollEnabled` always-true was sufficient to fix wheel/trackpad scrolling without needing the touches-length guard for that case — the guard mainly protects two-finger touch-scroll on real mobile devices.

**Why:** Locking scroll while the note tool was active (previously the common workaround for tap-vs-drag conflicts) made the "마디 설정" (measure settings) drawer and general page scrolling unreachable during normal note entry (reported: "스크롤이 안 됨").

**How to apply:** If a future conflict arises between canvas gesture handling and page scroll, prefer gating on touch count (single vs. multi) rather than disabling `scrollEnabled` based on tool mode — that fix is coarser and blocks legitimate scroll input (mouse wheel, 2-finger trackpad/touch) for the entire time a tool is selected.
