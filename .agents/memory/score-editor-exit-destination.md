---
name: Score editor exit destination
description: The expected destination for the score editor's explicit X close action.
---

The score editor's X button should close the score surface and return to the Lab menu that opened it.

**Why:** The user confirmed that score mode is entered from the Lab menu and expects its explicit exit action to return there, rather than jumping to the main metronome screen.

**How to apply:** Keep the editor/list close path on the shared menu-item return handler. The chevron remains the separate action for returning from the editor to the score list.