---
name: Jest baseline verification
description: Historical Jest failures are not a permanent baseline; verify against current evidence.
---

Do not dismiss a Jest failure as pre-existing solely because older memory listed failing suites. A later full run passed without those failures.

**Why:** Test tooling and mocks evolve; historical failure counts became stale and could hide new regressions.

**How to apply:** Use the project's current Jest command, keep Playwright specs out of Jest, and investigate current failures against a verified baseline. Use scoped checks during edits and a request-level verification pass before delivery.
