---
name: Public web verification
description: Published status and local build readiness do not prove that the public URL serves the web app.
---

A successful deployment status does not establish that the public URL serves the intended web app. Keep local release readiness separate from verification of the user's published version.

**Why:** A successfully published service served only an Expo Go landing page, while the workspace already contained a working web export and web-serving code. Telling the user it was a web app link from metadata alone was misleading.

**How to apply:** Inspect the actual public HTML and referenced web bundles before describing a URL as a working web app. If the workspace is fixed but not republished, state that explicitly. Do not infer the exact failure cause solely from missing public files.