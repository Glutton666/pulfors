---
name: Deployment npm peer resolution
description: Why local Yarn installs can pass while Replit publishing fails during npm dependency resolution.
---

Use npm as the root application's installation contract. A working pre-existing dependency directory is not proof that a clean checkout can install.

**Why:** CI used `npm ci` while the root npm lock was ignored and Yarn/pnpm locks were saved instead. Consolidating the root contract prevents local, CI and native build graphs from diverging. The mockup sandbox remains a separate package.

**How to apply:** Preserve the committed npm lock, validate a fresh installation, and retain security/compatibility constraints when changing package-management settings. Do not recreate root Yarn/pnpm locks.

**Why:** A publish failed before the build command because the native audio API required a newer optional worklets peer than the project pinned. The compatible worklets release also remained inside Reanimated's declared peer range, so aligning the direct dependency fixed npm resolution without using `--legacy-peer-deps`.

**How to apply:** After changing native React dependencies, verify the npm peer tree and a fresh locked install, then run the relevant build. Do not use legacy peer bypasses.

Package-manager-specific security settings do not protect another install path. Check actual resolved versions and the parent dependency; do not bypass the package firewall.

**Why:** A vulnerable archive dependency was already upgraded by Yarn locally, but npm publishing still downloaded the old version pinned by the native build CLI. Local installation success did not establish fresh npm compatibility.

**How to apply:** Validate fresh npm resolution without reusing the workspace lockfile or installed packages. Keep the currently tested native audio API pinned when a newer patch would require a different worklets peer; upgrade that native pair deliberately, not incidentally while fixing web publishing.