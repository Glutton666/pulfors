---
name: Pressable gesture ownership
description: Combining a continuous PanResponder gesture with an accessible Pressable without losing pointer events.
---

Keep a continuous drag responder on a stable View rather than spreading its handlers directly onto a Pressable. A nested Pressable can provide keyboard and accessibility activation; capture the pointer at the parent when necessary.

**Why:** The notebook picker responded to keyboard activation but never entered its gesture state on mouse-down. Pressable's internal responder ownership replaced the supplied drag handlers. Moving ownership to a wrapping View was verified with real pointer gestures, including release and cancellation.

**How to apply:** When a combined button/drag control works from the keyboard but not from touch or mouse, check responder ownership before changing coordinate math. Keep the gesture owner mounted while choices appear, and verify that release places once while a mode change cancels.

When an overlapping chooser replaces how a tool looks, hide the whole idle tile (including its border and background) without removing its pointer target or changing its measured size. Suppress focus and accessibility activation for the hidden tile until the gesture ends.

**Why:** In the notebook picker, hiding only the neighboring tools left the idle tile behind the choices. Removing the active tile would also discard the drag origin used for placement.

On web, don't toggle the active gesture's nested Pressable to `disabled` on pointer-down. Hide it from focus instead and guard activation, leaving the pointer target unchanged until release.

**Why:** React Native Web changes how disabled Pressables receive pointers. With the shared notation picker, quick clicks could leave the gesture open without a release even though slower drags worked.
