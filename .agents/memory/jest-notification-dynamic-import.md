---
name: Jest notification dynamic import
description: Jest cannot execute the notification module's dynamic Expo import without an explicit fallback.
---

`expo-notifications` is loaded dynamically so Expo Go and unsupported platforms can safely skip the native module. The repository's Jest CommonJS runtime rejects that dynamic import callback unless experimental VM modules are enabled, so the optional loader must retain a CommonJS `require` fallback.

**Why:** Without the fallback, the loader catches Jest's runtime error and returns `null`, making category registration and notification response-listener tests silently bypass their real behavior.

**How to apply:** Keep the native dynamic import as the primary path. When changing the notification loader or its tests, ensure the CJS fallback remains available and test mocks use an ESM-compatible shape.