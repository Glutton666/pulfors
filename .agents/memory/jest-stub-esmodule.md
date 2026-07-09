---
name: Jest stub __esModule for import * as
description: Without __esModule:true on a CJS stub, Babel's _interopRequireWildcard copies the stub object at import time; later mutations to the stub are invisible to the module under test.
---

## Rule
Any Jest stub used with `import * as Foo from "pkg"` (ES namespace import) must set `stub.__esModule = true` before `module.exports = stub`.

**Why:** Babel transforms `import * as` into `_interopRequireWildcard(require("pkg"))`. When `__esModule` is missing, `_interopRequireWildcard` creates a NEW object copying all enumerable properties at module-load time. Later patches to the stub object (e.g. `fsStub.readAsStringAsync = newFn`) are invisible because the module holds a different reference.

**How to apply:** In `tests/_stubs/expo-file-system.js` (and any stub used via namespace import), add `stub.__esModule = true;` before `module.exports = stub`. This causes `_interopRequireWildcard` to return the original stub object so mutations are live.

## Related: expo/virtual/env.js ESM stub
`babel-preset-expo` rewrites `process.env.EXPO_PUBLIC_*` to `require("expo/virtual/env.js")`. That file is ESM and can't be loaded by Jest. Fix: add `"^expo/virtual/env(\\.js)?$": "<rootDir>/tests/_stubs/expo-virtual-env.js"` to `jest.config.js` moduleNameMapper. This also reduces the number of failing test suites in the baseline (~22 → ~12).
