// Normalize lockfile transport URLs without resolving or upgrading packages.
const fs = require("node:fs");

const PUBLIC_REGISTRY = "https://registry.npmjs.org";

function normalizeYarnRegistry(text, registry) {
  if (registry !== PUBLIC_REGISTRY) {
    throw new Error(`Expected --registry ${PUBLIC_REGISTRY}`);
  }
  return text.replace(
    /^(\s*resolved\s+")https?:\/\/package-firewall\.replit\.(?:local|internal)\/npm\//gm,
    `$1${PUBLIC_REGISTRY}/`,
  );
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const registryIndex = args.indexOf("--registry");
  const registry = registryIndex >= 0 ? args[registryIndex + 1] : undefined;
  const original = fs.readFileSync("yarn.lock", "utf8");
  const normalized = normalizeYarnRegistry(original, registry);
  if (args.includes("--write")) {
    if (original !== normalized) fs.writeFileSync("yarn.lock", normalized);
    console.log("yarn.lock registry normalized; package versions and integrity hashes preserved.");
  } else if (original !== normalized) {
    console.error("yarn.lock contains sandbox registry URLs. Run with --write to normalize.");
    process.exitCode = 1;
  } else {
    console.log("yarn.lock registry URLs are clean.");
  }
}

module.exports = { normalizeYarnRegistry };
