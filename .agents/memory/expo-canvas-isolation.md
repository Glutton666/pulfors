---
name: Expo and canvas sandbox isolation
description: Why canvas infrastructure must be verified separately from the existing Expo application's toolchain.
---

Keep the canvas sandbox's type checking independent of the Expo application.

**Why:** The Expo project's broad TypeScript include also discovers nested Vite sandbox files. Their different path aliases and browser environment declarations then produce unrelated errors in the main application's check.

**How to apply:** When adding a nested design sandbox, verify both toolchains with their own configurations instead of rewriting Expo aliases to accommodate sandbox components. Sandbox provisioning may also install root dependencies; verify the existing Expo workflow afterward rather than treating sandbox startup as proof that the app still works.
