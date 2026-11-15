// Repair transport URLs only; package versions and integrity hashes are unchanged.
const fs = require("node:fs");
const PUBLIC_REGISTRY = "https://registry.npmjs.org";

function normalizeNpmRegistry(text, registry) {
  if (registry !== PUBLIC_REGISTRY) throw new Error(`Expected --registry ${PUBLIC_REGISTRY}`);
  const lock = JSON.parse(text);
  for (const pkg of Object.values(lock.packages ?? {})) {
    if (typeof pkg.resolved !== "string") continue;
    pkg.resolved = pkg.resolved.replace(
      /^https?:\/\/package-firewall\.replit\.(?:local|internal)\/npm\//,
      `${PUBLIC_REGISTRY}/`,
    );
  }
  return `${JSON.stringify(lock, null, 2)}\n`;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const index = args.indexOf("--registry");
  const before = fs.readFileSync("package-lock.json", "utf8");
  const after = normalizeNpmRegistry(before, index < 0 ? undefined : args[index + 1]);
  if (args.includes("--write")) fs.writeFileSync("package-lock.json", after);
  else if (before !== after) {
    console.error("package-lock.json contains nonportable registry URLs; run with --write.");
    process.exitCode = 1;
  }
}

module.exports = { normalizeNpmRegistry };
