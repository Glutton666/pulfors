import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const removedNativePackage = ["onnxruntime", "react-native"].join("-");
const removedDecoderPackage = ["audio", "decoder"].join("-");

test("stem separation removal: package, model, and native decoder residue is absent", () => {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    dependencies?: Record<string, unknown>;
  };
  const packageLock = readFileSync(join(root, "yarn.lock"), "utf8");
  const metroConfig = readFileSync(join(root, "metro.config.js"), "utf8");
  const jestConfig = readFileSync(join(root, "jest.config.js"), "utf8");

  assert.equal(packageJson.dependencies?.[removedNativePackage], undefined);
  assert.equal(packageJson.dependencies?.[removedDecoderPackage], undefined);
  assert.equal(packageLock.includes(removedNativePackage), false);
  assert.equal(packageLock.includes(removedDecoderPackage), false);
  assert.equal(/\b["']ort["']/.test(metroConfig), false);
  assert.equal(/\b["']onnx["']/.test(metroConfig), false);
  assert.equal(jestConfig.includes(removedNativePackage), false);
  assert.equal(jestConfig.includes(removedDecoderPackage), false);
  assert.equal(
    existsSync(join(root, "modules/audio-decoder/android/src/main/java/expo/modules/audiodecoder/AudioDecoderModule.kt")),
    false,
  );
  assert.equal(existsSync(join(root, "models/htdemucs.ort")), false);
  assert.equal(existsSync(join(root, "models/htdemucs_6s.ort")), false);
});