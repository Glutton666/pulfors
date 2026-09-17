---
name: Bar subdivision drag verification
description: How to verify the nested subdivision-pattern drag when browser Bar rows are unavailable.
---

The Bar editor has two overlapping upward gestures: dragging a subdivision pattern toward the list and swiping the editor panel to add a bar. The subdivision child must claim upward movement during responder capture, while the parent must ignore web events originating inside the subdivision gesture wrapper. Because the parent previously handled that same swipe by adding a new bar, the child's Bar-mode drop completion must explicitly call the add-bar action; applying the pattern to an existing beat changes the established behavior. Native drag coordinates should come from the latest gesture state. Cache the list's window coordinates when it lays out; measuring only when drag starts is asynchronous and may leave the first drop without a target. On release, use the last confirmed row target if the release event itself no longer resolves to a row.

**Why:** Giving the child responder ownership stopped the parent's add-bar release handler from running, so the ghost reached the list but no new row appeared. A fresh Playwright context could also enter the Bar shell while its virtualized FlatList rendered only the footer and no target rows. Real release events can be delivered just outside the visibly tracked row.

**How to apply:** Test child responder capture, native move/release coordinate forwarding, web document-level pointer delivery, cached list layout, and pure row targeting independently. Show the active target row while dragging. Use a real-device check for the complete drag-to-virtualized-row interaction.