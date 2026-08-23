import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import path from "node:path";

test("i18n.data can be imported by plain Node without React Native side effects", () => {
  const projectRoot = path.resolve(__dirname, "..");
  let categoryCount = 0;
  let lastOutput = "";

  // tsx's loader can occasionally start before its cache is ready while Jest
  // launches many workers. Retry the isolated Node process, not the assertion:
  // a successful attempt still proves i18n.data has no native runtime import.
  for (let attempt = 0; attempt < 3 && categoryCount === 0; attempt += 1) {
    try {
      const output = execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "--eval",
          "const mod = await import('./lib/i18n.data.ts'); const translations = mod.translations ?? mod.default?.translations; console.log(`I18N_CATEGORY_COUNT=${Object.keys(translations).length}`);",
        ],
        { cwd: projectRoot, encoding: "utf8" },
      ).trim();

      lastOutput = output;
      const match = output.match(/I18N_CATEGORY_COUNT=(\d+)/);
      categoryCount = match ? Number(match[1]) : 0;
    } catch (error) {
      lastOutput = error instanceof Error ? error.message : String(error);
    }
  }

  assert.ok(
    categoryCount > 0,
    `translation data should be available to Node (output: ${lastOutput})`,
  );
});