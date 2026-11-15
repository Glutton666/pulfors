import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const { normalizeNpmRegistry } = require("../scripts/normalize-npm-registry.cjs");
const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));

// These are intentional file-format/build contracts, not assertions about UI
// implementation text. npm itself consumes these exact public data formats.
test("npm's tracked install contract covers the manifest without legacy peer bypasses", () => {
  expect(manifest.packageManager).toMatch(/^npm@10\./);
  expect(lock.lockfileVersion).toBe(3);
  expect(lock.packages[""].dependencies).toEqual(manifest.dependencies);
  expect(lock.packages[""].devDependencies).toEqual(manifest.devDependencies);
  expect(manifest.resolutions).toBeUndefined();
  expect(manifest.overrides.postcss).toBe(">=8.5.10");
  expect(manifest.overrides["@oclif/plugin-autocomplete"]).toBe("3.2.40");
  // --no-index also evaluates this after it has been committed. A local lock
  // that is ignored must not make the install contract appear healthy again.
  expect(spawnSync("git", ["check-ignore", "--no-index", "--quiet", "--", "package-lock.json"]).status).toBe(1);
  for (const name of ["yarn.lock", "pnpm-lock.yaml"]) expect(fs.existsSync(name)).toBe(false);
  for (const pkg of Object.values(lock.packages) as { resolved?: string }[]) {
    if (pkg.resolved) expect(new URL(pkg.resolved).origin).toBe("https://registry.npmjs.org");
  }
});

test.each(["\n", "\r\n"])("registry repair preserves identity, integrity and dependencies with %j", eol => {
  const original = { lockfileVersion: 3, packages: {
    "node_modules/example": {
      version: "1.2.3", integrity: "sha512-fixture",
      resolved: "http://package-firewall.replit.internal/npm/example/-/example-1.2.3.tgz",
      dependencies: { other: "^2" },
    },
  } };
  const repaired = normalizeNpmRegistry(JSON.stringify(original, null, 2).replace(/\n/g, eol), "https://registry.npmjs.org");
  const expected = JSON.parse(JSON.stringify(original));
  expected.packages["node_modules/example"].resolved = "https://registry.npmjs.org/example/-/example-1.2.3.tgz";
  expect(JSON.parse(repaired)).toEqual(expected);
  expect(normalizeNpmRegistry(repaired, "https://registry.npmjs.org")).toBe(repaired);
  expect(() => normalizeNpmRegistry(repaired, undefined)).toThrow("Expected --registry");
});

test("Git keeps text LF, Windows command files CRLF and image bytes untouched", () => {
  const output = execFileSync("git", ["check-attr", "text", "eol", "--",
    "package.json", "fixture.png", "fixture.cmd"], { cwd: path.resolve("."), encoding: "utf8" });
  expect(output).toContain("package.json: eol: lf");
  expect(output).toContain("fixture.png: text: unset");
  expect(output).toContain("fixture.cmd: eol: crlf");
});
