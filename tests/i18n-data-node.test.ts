import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import path from "node:path";

test("i18n.data can be imported by plain Node without React Native side effects", () => {
  const projectRoot = path.resolve(__dirname, "..");
  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      "const mod = await import('./lib/i18n.data.ts'); const translations = mod.translations ?? mod.default?.translations; console.log(Object.keys(translations).length);",
    ],
    { cwd: projectRoot, encoding: "utf8" },
  ).trim();

  assert.ok(Number(output) > 0, "translation data should be available to Node");
});