// Asset stubs for Node-based test runs. Pulfors의 lib/* 모듈은 .wav/.mp3를
// require하므로 Node 기본 로더가 binary를 JS로 파싱하다 실패한다. 이를
// 빈 객체로 stub 처리해 테스트가 import만 통과하도록 한다.
const Module = require("module");
const path = require("path");

const ASSET_EXTS = [".wav", ".mp3", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ttf", ".otf"];
for (const ext of ASSET_EXTS) {
  Module._extensions[ext] = function (module) {
    module.exports = { uri: "stub://asset", default: { uri: "stub://asset" } };
  };
}

// react-native / expo-haptics 모듈도 CJS 경로로 재라우팅 (tsx의 esbuild가
// node_modules/react-native/index.js를 Flow 타입 때문에 파싱하지 못함).
const STUB_MAP = {
  "react-native": path.join(__dirname, "react-native.js"),
  "expo-haptics": path.join(__dirname, "expo-haptics.js"),
};
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (STUB_MAP[request]) return STUB_MAP[request];
  return originalResolve.call(this, request, ...rest);
};
