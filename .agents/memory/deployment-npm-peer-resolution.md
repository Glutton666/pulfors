---
name: Deployment npm peer resolution
description: Why local Yarn installs can pass while Replit publishing fails during npm dependency resolution.
---

Replit publishing resolves this project with `npm install`, even though the repository keeps `yarn.lock`. Direct dependencies therefore need an npm-resolvable peer graph; a Yarn installation already present in the workspace is not proof that publishing can install from scratch.

**Why:** A publish failed before the build command because the native audio API required a newer optional worklets peer than the project pinned. The compatible worklets release also remained inside Reanimated's declared peer range, so aligning the direct dependency fixed npm resolution without using `--legacy-peer-deps`.

**How to apply:** After changing native React dependencies, run an npm resolution check as well as the normal Yarn lock update. Regenerate `yarn.lock` explicitly against the npm registry, verify the direct peer tree with `npm ls`, and run the exact production build command.

Yarn-only security resolutions do not protect npm publishing from a transitive dependency pinned by its parent. Check the failed build's installation log and update the parent dependency; do not bypass the package firewall.

**Why:** A vulnerable archive dependency was already upgraded by Yarn locally, but npm publishing still downloaded the old version pinned by the native build CLI. Local installation success did not establish fresh npm compatibility.

**How to apply:** Validate fresh npm resolution without reusing the workspace lockfile or installed packages. Keep the currently tested native audio API pinned when a newer patch would require a different worklets peer; upgrade that native pair deliberately, not incidentally while fixing web publishing.