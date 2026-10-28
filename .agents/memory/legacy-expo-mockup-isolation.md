---
name: Legacy Expo mockup isolation
description: Artifact scaffolding can affect the legacy app's dependency installation and checks before the sandbox is ready.
---

Treat mockup-artifact creation as scaffolding, not proof that its dependencies or preview are ready.

**Why:** In this legacy Expo workspace, the artifact installer ran pnpm at the root while the sandbox still lacked Vite. Moving dependency directories also interrupted Metro's watcher. The root TypeScript glob then picked up sandbox files with incompatible aliases.

**How to apply:** Verify the sandbox's own dependency installation and configuration independently. Keep its checks isolated from Expo, and confirm the main app still starts after scaffolding. Do not replace the app's existing package-manager conventions merely because an artifact installer used a different manager.
