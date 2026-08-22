---
name: Native feature removal audit
description: Prevent incomplete removal of features that include a local Expo or React Native module.
---

When retiring a feature that has a local native module, search the full module directory after removing its package declaration and TypeScript entry point; platform-specific source files can remain without being autolinked.

**Why:** Package removal and deletion of the module manifest do not necessarily remove every Android/iOS implementation file, leaving misleading dead code behind.

**How to apply:** Before completing such a removal, scan native module directories as well as app imports, package/lock files, Metro configuration, model assets, and test stubs. Add a small regression check for the removed dependency/config/native-source paths when practical.