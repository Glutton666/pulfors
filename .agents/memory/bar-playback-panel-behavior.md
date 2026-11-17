---
name: Bar playback panel behavior
description: User-approved distinction between Bar editing selection and playback information.
---

During Bar playback, hide all editing operations in the bottom panel and show the currently sounding bar's information. Keep the play/stop button. Tighten gaps left by hidden controls without a major redesign.

**Why:** The user requested a modest editing/playback UI distinction and explicitly confirmed that the playback button must remain.

**How to apply:** Never change the editor selection just to display the playing bar. On stop, return to the bar selected before playback, including no selection when that was the previous state.
