// Development-only Metro override for the documented row-window benchmark.
// Point RHYTHM_STAFF_BASELINE at an extracted, unwindowed RhythmStaff.tsx.
const path = require("node:path");
const config = require("../metro.config.js");
const baseline = process.env.RHYTHM_STAFF_BASELINE;
if (!baseline) throw new Error("RHYTHM_STAFF_BASELINE must point to the baseline RhythmStaff.tsx");
const original = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "./RhythmStaff" && context.originModulePath.endsWith("/RhythmWorkspace.tsx")) {
    return { type: "sourceFile", filePath: path.resolve(baseline) };
  }
  return original
    ? original(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
