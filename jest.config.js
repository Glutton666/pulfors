/** @type {import('jest').Config} */
module.exports = {
  modulePathIgnorePatterns: [
    "<rootDir>/.cache/",
    "<rootDir>/node_modules/.cache/",
  ],
  moduleNameMapper: {
    // node:test / node:assert 브릿지
    "^node:test$": "<rootDir>/tests/_stubs/node-test.js",
    "^node:assert/strict$": "<rootDir>/tests/_stubs/node-assert.js",
    // @/ alias 경로의 바이너리 에셋 → 먼저 stub 처리 (@/ 일반 alias보다 앞에 위치해야 함)
    "^@/.*\\.(wav|mp3|png|jpg|jpeg|gif|webp|ttf|otf)$": "<rootDir>/tests/_stubs/asset-file.js",
    // 경로 별칭 (@/ → 프로젝트 루트)
    "^@/(.*)$": "<rootDir>/$1",
    // 바이너리 에셋 → 빈 stub
    "\\.(wav|mp3|png|jpg|jpeg|gif|webp|ttf|otf)$": "<rootDir>/tests/_stubs/asset-file.js",
    // Expo / React Native 패키지 → stub
    "^react-native$": "<rootDir>/tests/_stubs/react-native.js",
    "^expo-haptics$": "<rootDir>/tests/_stubs/expo-haptics.js",
    "^expo-file-system$": "<rootDir>/tests/_stubs/expo-file-system.js",
    "^expo-file-system/legacy$": "<rootDir>/tests/_stubs/expo-file-system.js",
    "^@react-native-async-storage/async-storage$": "<rootDir>/tests/_stubs/async-storage.js",
    "^expo-crypto$": "<rootDir>/tests/_stubs/expo-crypto.js",
    "^expo-location$": "<rootDir>/tests/_stubs/expo-location.js",
    "^expo-image-picker$": "<rootDir>/tests/_stubs/expo-image-picker.js",
    "^expo-audio$": "<rootDir>/tests/_stubs/expo-audio.js",
    "^expo-document-picker$": "<rootDir>/tests/_stubs/expo-document-picker.js",
    "^expo-sharing$": "<rootDir>/tests/_stubs/expo-sharing.js",
    "^expo-av$": "<rootDir>/tests/_stubs/expo-av.js",
    "^expo-asset$": "<rootDir>/tests/_stubs/expo-asset.js",
    "^expo-modules-core$": "<rootDir>/tests/_stubs/expo-modules-core.js",
    "^onnxruntime-react-native$": "<rootDir>/tests/_stubs/onnxruntime-react-native.js",
    // babel-preset-expo rewrites EXPO_PUBLIC_* to require("expo/virtual/env.js"),
    // which is an ESM module that Jest can't load. Stub it with a CJS equivalent.
    "^expo/virtual/env(\\.js)?$": "<rootDir>/tests/_stubs/expo-virtual-env.js",
  },
  transform: {
    "^.+\\.[jt]sx?$": ["babel-jest", { presets: ["babel-preset-expo"] }],
  },
  setupFiles: ["<rootDir>/tests/_stubs/jest-setup.cjs"],
};
