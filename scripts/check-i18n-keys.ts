// 사용법: npx tsx scripts/check-i18n-keys.ts
// 코드 내 t("namespace", "key") 호출이 lib/i18n.ts의 translations에 정의된
// 키와 일치하는지 검증. 누락 시 종료 코드 1.
//
// 동적 키 (titleKey 같은 변수)는 검출 불가하므로 정적 문자열만 본다.

import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const I18N_FILE = path.join(ROOT, "lib", "i18n.ts");

function loadTranslations(): Record<string, Set<string>> {
  const src = fs.readFileSync(I18N_FILE, "utf8");
  const result: Record<string, Set<string>> = {};
  const lines = src.split("\n");
  let currentNs: string | null = null;
  for (const line of lines) {
    const nsMatch = /^ {2}([a-zA-Z][\w]*):\s*\{\s*$/.exec(line);
    if (nsMatch) { currentNs = nsMatch[1]; result[currentNs] = new Set(); continue; }
    if (/^ {2}\},?\s*$/.test(line)) { currentNs = null; continue; }
    if (currentNs) {
      const keyMatch = /^ {4}([a-zA-Z][\w]*):\s*\{/.exec(line);
      if (keyMatch) result[currentNs].add(keyMatch[1]);
    }
  }
  return result;
}

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !p.endsWith(".d.ts")) out.push(p);
  }
}

function main(): void {
  const translations = loadTranslations();
  const files: string[] = [];
  walk(path.join(ROOT, "app"), files);
  walk(path.join(ROOT, "components"), files);

  const missing: { file: string; line: number; ns: string; key: string }[] = [];
  const callRegex = /\bt\(\s*"([a-zA-Z][\w]*)"\s*,\s*"([a-zA-Z][\w]*)"\s*\)/g;
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      callRegex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = callRegex.exec(lines[i])) !== null) {
        const [, ns, key] = m;
        const set = translations[ns];
        if (!set || !set.has(key)) {
          missing.push({ file: path.relative(ROOT, file), line: i + 1, ns, key });
        }
      }
    }
  }

  if (missing.length === 0) {
    console.log("OK: 누락된 i18n 키 없음 (정적 호출 기준)");
    return;
  }
  console.error(`FAIL: ${missing.length}개의 누락된 i18n 키:`);
  for (const m of missing) console.error(`  ${m.file}:${m.line}  ${m.ns}.${m.key}`);
  process.exit(1);
}

main();
