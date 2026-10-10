---
name: screenshot tool sometimes hits wrong port
description: app_preview screenshot tool intermittently shows the Express QR landing page instead of the real Expo web app in this project.
---

## Plan-mode browser capture constraints

Local Playwright can complete navigation and save a screenshot in `/tmp`, yet the shell command can still be blocked by browser NSS or cache-bookkeeping writes under the workspace.

**Why:** Plan mode enforces workspace read-only access independently of whether browser navigation and screenshot capture succeeded; launching Chromium may touch profile/certificate/cache metadata.

**How to apply:** Keep temporary browser profiles and generated capture files outside the workspace. A blocked command is not a passing test. If its log reports an already-saved screenshot, verify that image exists and inspect it for read-only visual planning rather than repeatedly launching the browser.

In this Expo + Express project (frontend on port 8081, backend on port 5000), the backend's `/` route serves a QR-code "Download Expo Go" landing page for any request without an `expo-platform` header. The `screenshot` tool's `app_preview` type sometimes resolves to this port-5000 landing page instead of the actual Expo web app on port 8081, even though `curl localhost:8081/` correctly returns the real app HTML.

**Why:** Wasted several retries assuming the app was down (502) when it was actually a tool/routing quirk unrelated to the app's health.

**How to apply:** If `app_preview` screenshots show the "Download Expo Go" / QR code page instead of the real app, don't keep retrying the screenshot tool. Verify the app is actually up with `curl localhost:8081/`, then prefer `runTest()` (the Playwright e2e testing tool) for visual/behavioral verification — it reliably reaches the real app even when the screenshot tool doesn't.

The testing-subagent configuration can be unavailable even when its skill is present: the runtime may reject `$kind: "testing"` as unknown. Use the project's local Playwright tests in that case, including iframe embedding for audio checks, rather than retrying the unsupported configuration.

**Why:** The available skill text and the active runtime's supported subagent kinds can differ.

**How to apply:** Treat a rejected configuration as an interface mismatch, not an app failure. Existing Playwright infrastructure can verify the same browser journey and save screenshots for inspection.
