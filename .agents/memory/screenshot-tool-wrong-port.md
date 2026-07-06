---
name: screenshot tool sometimes hits wrong port
description: app_preview screenshot tool intermittently shows the Express QR landing page instead of the real Expo web app in this project.
---

In this Expo + Express project (frontend on port 8081, backend on port 5000), the backend's `/` route serves a QR-code "Download Expo Go" landing page for any request without an `expo-platform` header. The `screenshot` tool's `app_preview` type sometimes resolves to this port-5000 landing page instead of the actual Expo web app on port 8081, even though `curl localhost:8081/` correctly returns the real app HTML.

**Why:** Wasted several retries assuming the app was down (502) when it was actually a tool/routing quirk unrelated to the app's health.

**How to apply:** If `app_preview` screenshots show the "Download Expo Go" / QR code page instead of the real app, don't keep retrying the screenshot tool. Verify the app is actually up with `curl localhost:8081/`, then prefer `runTest()` (the Playwright e2e testing tool) for visual/behavioral verification — it reliably reaches the real app even when the screenshot tool doesn't.
