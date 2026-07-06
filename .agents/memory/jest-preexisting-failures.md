---
name: Jest pre-existing failures baseline
description: A stable set of ~22 failing Jest suites in this repo unrelated to typical feature changes — don't mistake them for regressions.
---

Running `npx jest` (full suite, no path filter) in this repo consistently shows ~22 failed suites / ~53 failed tests / ~921 passed out of 974, even on an otherwise-clean tree. Two root causes:

1. Several `tests/*.test.ts` files transitively import `lib/error-tracking.ts`, which pulls in `expo/virtual/env.js` — Jest's transform can't parse this ESM `export const env = ...` module, so the whole suite fails with `SyntaxError: Unexpected token 'export'`.
2. `e2e/*.spec.ts` files are Playwright specs, not Jest specs, and fail with harness/registration errors when run under plain `npx jest`.

**Why:** this is an environment/tooling gap, not something a feature change introduces or should try to fix inline.

**How to apply:** when validating a change via `npx jest`, compare failing-suite/test counts against this baseline instead of treating any failure as a regression. Prefer running a scoped `npx jest <specific-test-file-or-glob>` for the files you actually touched to get a clean signal, then optionally run the full suite once to confirm the failure count didn't grow beyond baseline.
