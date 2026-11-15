import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRepoSource, importedMemberCallCount } from "./helpers/source-contract";

test.each(["\n", "\r\n"])("retained architecture guards read equivalent text with %j and spaces in paths", eol => {
  const folder = mkdtempSync(join(tmpdir(), "pulfors source with spaces "));
  try {
    const file = join(folder, "source with spaces.ts");
    const source = 'const active = true;\n  apply(active);\n';
    writeFileSync(file, source.replace(/\n/g, eol));
    expect(readRepoSource(file)).toBe(source);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test.each(["\n", "\r\n"])("architecture inspection accepts refactoring with %j but rejects duplicate subscriptions", eol => {
  const source = [
    'import { BackHandler as nativeBack } from "react-native";',
    "// BackHandler.addEventListener in a comment is not executable.",
    "nativeBack",
    '  .addEventListener ( "hardwareBackPress", () => true );',
  ].join(eol);
  expect(importedMemberCallCount(source, "react-native", "BackHandler", "addEventListener")).toBe(1);
  expect(importedMemberCallCount(`${source}${eol}nativeBack.addEventListener("hardwareBackPress", handler)`,
    "react-native", "BackHandler", "addEventListener")).toBe(2);
  expect(importedMemberCallCount(source.replace(/\.addEventListener/g, ".removeEventListener"),
    "react-native", "BackHandler", "addEventListener")).toBe(0);
});
