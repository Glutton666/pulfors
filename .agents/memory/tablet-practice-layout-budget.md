---
name: Tablet practice layout budget
description: Prevent tablet breakpoints from shrinking the metronome's primary controls.
---

On 4:3 tablets, give the primary practice dial and BPM controls the usable display area rather than retaining a narrow phone-sized content column. Bound the dial by its actual column width and remaining vertical space; cap dense subdivision controls independently.

**Why:** The user found the tablet layout cramped. The tablet breakpoint previously made the dial smaller than it was in a shorter browser window of the same width, while a percentage-wide content cap left large unused gutters.

**How to apply:** Compare tablet landscape, tablet portrait, and a resized wide-but-short frame against phone and desktop layouts. Verify that nearby tools remain reachable and the dial does not clip when rotating or crossing a breakpoint.
