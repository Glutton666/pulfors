---
name: Mode transition async leases
description: Prevent stale mode-entry data loads from winning after rapid or external mode changes.
---

Asynchronous mode entry must hold a transition lease until its data work settles. React mode commits are acknowledged only when the mode writer explicitly tags them with that lease.

**Why:** A synchronous intermediate mode can commit while a newer mode is still loading. Inferring ownership from the resulting mode name is unsafe: an external writer can select the same value. Untagged writers must win immediately, while tagged dial writes must not cancel their own async work.

**How to apply:** Start a new lease for each requested mode transition and tag each state write made by that transition before scheduling it. Route every core mode writer through the centralized boundary; untagged writes invalidate active leases immediately, even for the same resulting mode. Check the active lease after every await and immediately before applying late results, then finish it when all async work settles.