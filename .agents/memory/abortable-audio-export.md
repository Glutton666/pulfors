---
name: Abortable audio export
description: Cancellation and stale-result rules for long-running audio export work.
---

Long audio exports must accept one `AbortSignal` from the UI and use bounded cooperative chunks (with event-loop yields) through rendering, encoding, PCM assembly, and cache writing boundaries. The modal must only update progress, success, or errors while its own export controller remains current.

**Why:** Polling an abort signal inside one uninterrupted JavaScript loop cannot observe a user tap. Also, an old canceled export can complete after the modal is reopened; deterministic temporary filenames let stale cleanup delete the new export's file.

**How to apply:** Keep user-visible filenames stable but give each cached artifact a per-export unique storage name. On cancellation or a stale completion, discard that specific artifact. Any new heavy export phase must include a timer-driven cancellation test, not only a pre-aborted-signal test.