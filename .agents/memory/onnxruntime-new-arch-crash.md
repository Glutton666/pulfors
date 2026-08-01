---
name: onnxruntime-react-native new arch crash
description: onnxruntime-react-native uses old-arch RCTBridge and crashes on startup with newArchEnabled=true
---

## Rule
`onnxruntime-react-native` (v1.x) uses `RCT_EXPORT_MODULE` + `RCTCxxBridge* cxxBridge = (RCTCxxBridge*)_bridge` — classic old-arch bridge pattern. With `newArchEnabled: true` (RN 0.74+), this causes a native crash at startup because `_bridge` is nil/wrong type in bridgeless mode.

**Why:** react-native-reanimated v4 (Expo SDK 54) requires new arch, so you cannot simply disable new arch. The solution is to prevent onnxruntime from being native-linked while keeping it in dependencies for JS-level use.

**How to apply:** Add `react-native.config.js` with `onnxruntime-react-native: { platforms: { ios: null, android: null } }` to disable auto-linking. Also remove it from app.json plugins. The JS lazy-require in lib/stem-separation.ts (inside try-catch) will then return false from isOnnxRuntimeAvailable() — the stem separation feature gracefully degrades but the app opens.
