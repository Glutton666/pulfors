---
name: Score editor ScrollView is locked while note/rest tool is active
description: The main score ScrollView disables scrolling whenever activeTool is "note" or "rest" (so drags place notes instead of scrolling the page). Any bottom-of-page overlay opened while that tool is active becomes unreachable.
---

`components/ScoreEditorScreen.tsx`'s main vertical `ScrollView` sets `scrollEnabled={activeTool !== "note" && activeTool !== "rest"}` so that dragging on the canvas places notes instead of scrolling. Since "note" is the default/most-used tool, this scroll lock is active almost all the time.

**Why:** The "마디 설정" (measure settings) drawer renders inline at the bottom of the same scrollable content. When opened, its content grows downward; with scroll locked, users could not reach rows that no longer fit on screen (reported: "확장해도 아래로만 확장되고 안보임").

**How to apply:** Any UI element that is appended to the bottom of the score ScrollView's content (drawers, panels, etc.) must also add its own "open" state as an OR condition to `scrollEnabled` (e.g. `scrollEnabled={drawerOpen || (activeTool !== "note" && activeTool !== "rest")}`), and should generally also be added to `ScoreCanvas`'s `disabled` prop so canvas touch handling doesn't fight with scrolling while that panel is open.
