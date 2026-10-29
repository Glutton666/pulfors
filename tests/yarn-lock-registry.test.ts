import { readFileSync } from "node:fs";

/**
 * Replit 샌드박스에서 lockfile이 재생성되면 `resolved` URL이 샌드박스 전용
 * 프록시(package-firewall.replit.local / .internal)로 오염되는 사고가 반복됐다.
 * EAS 클라우드 빌드는 이 호스트에 접근할 수 없어 `yarn install`이
 * `getaddrinfo ENOTFOUND`로 실패한다. 커밋 전에 이 테스트가 잡도록 한다.
 *
 * 복구: sed -i -E 's#http://package-firewall\.replit\.(local|internal)/npm/#https://registry.npmjs.org/#g' yarn.lock
 */

const SANDBOX_HOST = /replit\.(local|internal)|package-firewall/i;

interface Offense {
  line: number;
  text: string;
}

/** 샌드박스 프록시를 가리키거나 평문 http로 받는 `resolved` 줄을 찾는다. */
export function findRegistryOffenses(lockfile: string): Offense[] {
  const offenses: Offense[] = [];
  lockfile.split(/\r?\n/).forEach((text, index) => {
    const resolved = /^\s*resolved\s+"([^"]+)"/.exec(text);
    if (!resolved) return;
    const url = resolved[1];
    if (SANDBOX_HOST.test(url) || /^http:\/\//i.test(url)) {
      offenses.push({ line: index + 1, text: url });
    }
  });
  return offenses;
}

describe("yarn.lock registry hygiene", () => {
  test("detector flags sandbox-proxy and plain-http resolved URLs", () => {
    const poisoned = [
      'foo@^1.0.0:',
      '  version "1.0.0"',
      '  resolved "http://package-firewall.replit.internal/npm/foo/-/foo-1.0.0.tgz"',
      'bar@^2.0.0:',
      '  version "2.0.0"',
      '  resolved "http://package-firewall.replit.local/npm/bar/-/bar-2.0.0.tgz"',
      'baz@^3.0.0:',
      '  version "3.0.0"',
      '  resolved "http://example.com/baz-3.0.0.tgz"',
    ].join("\r\n");
    expect(findRegistryOffenses(poisoned).map((o) => o.line)).toEqual([3, 6, 9]);

    const clean = [
      'foo@^1.0.0:',
      '  version "1.0.0"',
      '  resolved "https://registry.npmjs.org/foo/-/foo-1.0.0.tgz#abc"',
    ].join("\n");
    expect(findRegistryOffenses(clean)).toEqual([]);
  });

  test("yarn.lock has no sandbox-proxy or plain-http resolved URLs", () => {
    const offenses = findRegistryOffenses(readFileSync("yarn.lock", "utf8"));
    const preview = offenses
      .slice(0, 5)
      .map((o) => `  yarn.lock:${o.line}  ${o.text}`)
      .join("\n");
    // 실패 시 개수와 일부 위치, 복구 방법을 함께 보여준다.
    expect({
      count: offenses.length,
      hint: offenses.length
        ? `EAS 빌드가 getaddrinfo ENOTFOUND로 실패합니다. 이 파일 상단의 sed 명령으로 복구하세요.\n${preview}`
        : "",
    }).toEqual({ count: 0, hint: "" });
  });
});
