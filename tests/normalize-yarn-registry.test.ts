const { normalizeYarnRegistry } = require("../scripts/normalize-yarn-registry.cjs");

const registry = "https://registry.npmjs.org";

test("normalizes only sandbox resolved URLs, preserving versions, hashes and line endings", () => {
  const source = [
    '"@scope/pkg@^1.0.0":',
    '  version "1.0.3"',
    '  resolved "http://package-firewall.replit.internal/npm/@scope/pkg/-/pkg-1.0.3.tgz#abc"',
    '  integrity sha512-AbCd==',
    '  note "http://package-firewall.replit.internal/npm/unchanged"',
  ].join("\r\n");
  expect(normalizeYarnRegistry(source, registry)).toBe(source.replace(
    'resolved "http://package-firewall.replit.internal/npm/',
    `resolved "${registry}/`,
  ));
});

test("normalization is idempotent and supports the legacy sandbox hostname", () => {
  const source = '  resolved "https://package-firewall.replit.local/npm/foo/-/foo-1.tgz"';
  const clean = normalizeYarnRegistry(source, registry);
  expect(clean).toBe('  resolved "https://registry.npmjs.org/foo/-/foo-1.tgz"');
  expect(normalizeYarnRegistry(clean, registry)).toBe(clean);
});

test("requires the explicitly approved public npm registry", () => {
  expect(() => normalizeYarnRegistry("", undefined)).toThrow("Expected --registry");
  expect(() => normalizeYarnRegistry("", "http://example.com")).toThrow("Expected --registry");
});
