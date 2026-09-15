---
name: Scheduled playback ownership
description: Cancellation and React lifecycle rules for preparing audio before an exact target time.
---

Scheduled playback preparation must be owned by a unique attempt token. Generic stop, cancel, and user-toggle paths invalidate that token; cleanup from an older attempt may only clear its own token.

**Why:** A shared boolean allowed delayed cleanup from an old reservation to stop newer ordinary playback. Also, putting a changing cancel callback in a modal cleanup effect caused React to run cleanup on parent rerenders and cancel the reservation that had just started preparing.

**How to apply:** When adding delayed or preloaded audio starts, bind resources and cancellation to one attempt token. In modal unmount or visibility cleanup, read the latest callback through a ref so callback identity changes do not retrigger destructive cleanup.