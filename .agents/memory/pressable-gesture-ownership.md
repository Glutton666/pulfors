---
name: Pressable gesture ownership
description: Combining a continuous PanResponder gesture with an accessible Pressable without losing pointer events.
---

Keep a continuous drag responder on a stable View rather than spreading its handlers directly onto a Pressable. A nested Pressable can provide keyboard and accessibility activation; capture the pointer at the parent when necessary.

**Why:** The notebook picker responded to keyboard activation but never entered its gesture state on mouse-down. Pressable's internal responder ownership replaced the supplied drag handlers. Moving ownership to a wrapping View was verified with real pointer gestures, including release and cancellation.

**How to apply:** When a combined button/drag control works from the keyboard but not from touch or mouse, check responder ownership before changing coordinate math. Keep the gesture owner mounted while choices appear, and verify that release places once while a mode change cancels.
