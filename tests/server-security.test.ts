import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

describe("server boundary policy", () => {
  const indexSource = fs.readFileSync(path.resolve(process.cwd(), "server/index.ts"), "utf8");
  const routesSource = fs.readFileSync(path.resolve(process.cwd(), "server/routes.ts"), "utf8");

  test("keeps CORS, proxy, and common response safeguards", () => {
    assert.match(indexSource, /TRUST_PROXY_HOPS/);
    assert.match(indexSource, /app\.set\("trust proxy", getTrustProxyHops\(\)\)/);
    assert.match(indexSource, /Origin not allowed/);
    for (const header of ["X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"]) {
      assert.ok(indexSource.includes(header), `missing security header: ${header}`);
    }
  });

  test("does not expose a server-side audio decoder or analysis endpoint", () => {
    for (const removedSurface of ["analyze-audio", "ffmpeg", "worker_threads", "child_process"]) {
      assert.ok(!routesSource.includes(removedSurface), `${removedSurface} must not be reachable from routes`);
    }
  });
});