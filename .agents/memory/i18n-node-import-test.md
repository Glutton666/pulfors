---
name: Plain Node i18n import test
description: Stabilizing the test that proves i18n translation data imports without React Native.
---

The plain-Node i18n data test must use a subprocess with the tsx loader, emit an explicit translation-count marker, and tolerate a bounded retry of the isolated process.

**Why:** During parallel Jest startup, the tsx loader can intermittently produce no usable count even though the data module itself is importable; a raw numeric parse makes that environmental timing issue look like a translation regression.

**How to apply:** Preserve the subprocess boundary so the test continues to prove no native runtime side effects. Parse only the explicit output marker and fail with the captured output after the short retry budget is exhausted.