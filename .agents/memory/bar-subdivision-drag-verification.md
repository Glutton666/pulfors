---
name: Bar subdivision drag verification
description: How to verify the nested subdivision-pattern drag when browser Bar rows are unavailable.
---

The Bar editor has two overlapping upward gestures: dragging a subdivision pattern toward the list and swiping the editor panel to add a bar. The subdivision child must claim upward movement during responder capture, while the parent must ignore web events originating inside the subdivision gesture wrapper. Native drag coordinates should come from the latest gesture state. Cache the list's window coordinates when it lays out; measuring only when drag starts is asynchronous and may leave the first drop without a target.

**Why:** A fresh Playwright context could enter the Bar shell while its virtualized FlatList rendered only the footer and no target rows. Repeated browser tests therefore failed before exercising the drop, even though component-level pointer delivery and pure drop targeting worked.

**How to apply:** Test child responder capture, native move/release coordinate forwarding, web document-level pointer delivery, cached list layout, and pure row targeting independently. Show the active target row while dragging. Use a real-device check for the complete drag-to-virtualized-row interaction.