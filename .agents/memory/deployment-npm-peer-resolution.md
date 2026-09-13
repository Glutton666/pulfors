---
name: Deployment npm peer resolution
description: Why local Yarn installs can pass while Replit publishing fails during npm dependency resolution.
---

Replit publishing resolves this project with `npm install`, even though the repository keeps `yarn.lock`. Direct dependencies therefore need an npm-resolvable peer graph; a Yarn installation already present in the workspace is not proof that publishing can install from scratch.

**Why:** A publish failed before the build command because the native audio API required a newer optional worklets peer than the project pinned. The compatible worklets release also remained inside Reanimated's declared peer range, so aligning the direct dependency fixed npm resolution without using `--legacy-peer-deps`.

**How to apply:** After changing native React dependencies, run an npm resolution check as well as the normal Yarn lock update. Regenerate `yarn.lock` explicitly against the npm registry, verify the direct peer tree with `npm ls`, and run the exact production build command.