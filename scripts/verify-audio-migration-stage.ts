import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

type Stage = {
  files: string[];
  callers: Array<{ file: string; module: string; binding: string; within: string }>;
  forbiddenCalls: Array<{ file: string; callee: string }>;
  forbiddenMethods: Array<{ file: string; receiver: string; method: string }>;
};

const stages: Record<string, Stage> = {
  baseline: {
    files: [
      "docs/audio-pipeline-migration-baseline.md",
      "scripts/benchmark-audio-renderer.ts",
      "scripts/verify-audio-migration-stage.ts",
    ],
    callers: [],
    forbiddenCalls: [],
    forbiddenMethods: [],
  },
  plan: {
    files: ["lib/audio-playback-plan.ts"],
    callers: [
      { file: "hooks/usePlaybackControl.ts", module: "@/lib/audio-playback-plan", binding: "buildPlaybackPlan", within: "startPreparedPlayback" },
    ],
    forbiddenCalls: [
      { file: "hooks/usePlaybackControl.ts", callee: "configureEngine" },
      { file: "hooks/usePlaybackControl.ts", callee: "toneEffectIntensity" },
    ],
    forbiddenMethods: [],
  },
  lifecycle: {
    files: ["lib/audio-render-lifecycle.ts"],
    callers: [
      { file: "hooks/useAudioPipeline.ts", module: "@/lib/audio-render-lifecycle", binding: "createAudioRenderLifecycle", within: "useAudioPipeline" },
    ],
    forbiddenCalls: [
      { file: "hooks/usePlaybackControl.ts", callee: "beginAbortableRender" },
      { file: "hooks/usePlaybackControl.ts", callee: "finishAbortableRender" },
      { file: "hooks/useAudioPipeline.ts", callee: "abortActiveRender" },
    ],
    forbiddenMethods: [],
  },
  output: {
    files: [
      "lib/audio-output-owner.ts",
      "lib/web-audio-output.ts",
      "lib/native-audio-output.ts",
    ],
    callers: [
      { file: "hooks/useAudioPipeline.ts", module: "@/lib/audio-output-owner", binding: "createAudioOutputOwner", within: "useAudioPipeline" },
      { file: "hooks/usePlaybackControl.ts", module: "@/lib/audio-output-owner", binding: "publishAudioOutput", within: "startPreparedPlayback" },
      { file: "hooks/usePolygonMode.ts", module: "@/lib/audio-output-owner", binding: "playPolygonAudioOutput", within: "usePolygonMode" },
    ],
    forbiddenCalls: [
      { file: "hooks/usePlaybackControl.ts", callee: "playWebRenderedLoop" },
      { file: "hooks/usePolygonMode.ts", callee: "safePlayWithVolume" },
      { file: "hooks/usePolygonMode.ts", callee: "playPCMOnWebRealtime" },
      { file: "hooks/usePolygonMode.ts", callee: "playWebClick" },
    ],
    forbiddenMethods: [
      { file: "hooks/usePlaybackControl.ts", receiver: "localNativePlayer", method: "release" },
      { file: "hooks/usePlaybackControl.ts", receiver: "webRenderedLoopRef.current", method: "stop" },
      { file: "hooks/useAudioPipeline.ts", receiver: "renderedPlayerRef.current", method: "release" },
      { file: "hooks/useAudioPipeline.ts", receiver: "webRenderedLoopRef.current", method: "stop" },
    ],
  },
  polygon: {
    files: ["lib/polygon-scheduler.ts"],
    callers: [
      { file: "hooks/usePolygonMode.ts", module: "@/lib/polygon-scheduler", binding: "buildPolygonSchedule", within: "usePolygonMode" },
    ],
    forbiddenCalls: [
      { file: "hooks/usePolygonMode.ts", callee: "setTimeout" },
      { file: "hooks/usePolygonMode.ts", callee: "clearTimeout" },
    ],
    forbiddenMethods: [],
  },
  tone: {
    files: ["lib/audio-tone-snapshot.ts"],
    callers: [
      { file: "hooks/useAudioPipeline.ts", module: "@/lib/audio-tone-snapshot", binding: "createAudioToneSnapshot", within: "useAudioPipeline" },
      { file: "hooks/usePlaybackControl.ts", module: "@/lib/audio-tone-snapshot", binding: "readAudioToneSnapshot", within: "startPreparedPlayback" },
      { file: "hooks/usePolygonMode.ts", module: "@/lib/audio-tone-snapshot", binding: "readAudioToneSnapshot", within: "usePolygonMode" },
    ],
    forbiddenCalls: [
      { file: "hooks/usePlaybackControl.ts", callee: "toneEffectIntensity" },
      { file: "hooks/useAudioPipeline.ts", callee: "processClickPCM" },
    ],
    forbiddenMethods: [],
  },
  pcm: {
    files: ["lib/pcm-loader.ts", "lib/pcm-cache.ts", "lib/audio-warmup.ts"],
    callers: [
      { file: "hooks/useAudioPipeline.ts", module: "@/lib/audio-warmup", binding: "createAudioWarmup", within: "useAudioPipeline" },
      { file: "hooks/useAudioPlayers.ts", module: "@/lib/pcm-loader", binding: "loadPCM", within: "useAudioPlayers" },
      { file: "hooks/usePolygonMode.ts", module: "@/lib/pcm-cache", binding: "getClickPCM", within: "usePolygonMode" },
    ],
    forbiddenCalls: [
      { file: "hooks/useAudioPipeline.ts", callee: "decodeSampleFile" },
      { file: "hooks/useAudioPipeline.ts", callee: "loadAssetPCM" },
      { file: "hooks/usePolygonMode.ts", callee: "ensurePCM" },
    ],
    forbiddenMethods: [],
  },
};

const root = resolve(process.env.AUDIO_MIGRATION_ROOT ?? process.cwd());
const atRoot = (file: string) => resolve(root, file);

function git(...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trimEnd();
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function analyze(file: string): { source: ts.SourceFile; checker: ts.TypeChecker } {
  const path = atRoot(file);
  const program = ts.createProgram([path], {
    noResolve: true,
    target: ts.ScriptTarget.Latest,
    jsx: ts.JsxEmit.ReactJSX,
  });
  const source = program.getSourceFile(path);
  if (!source) fail(`could not parse TypeScript source: ${file}`);
  return { source, checker: program.getTypeChecker() };
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function importedSymbol(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  moduleName: string,
  binding: string,
): ts.Symbol | undefined {
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== moduleName) continue;
    const clause = statement.importClause;
    if (!clause) continue;
    if (clause.name?.text === binding) return checker.getSymbolAtLocation(clause.name);
    if (!clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    const element = clause.namedBindings.elements.find((item) => item.name.text === binding);
    if (element) return checker.getSymbolAtLocation(element.name);
  }
  return undefined;
}

function callResultIsConsumed(call: ts.CallExpression): boolean {
  let current: ts.Expression = call;
  let parent = current.parent;
  while (
    ts.isAwaitExpression(parent)
    || ts.isParenthesizedExpression(parent)
    || ts.isAsExpression(parent)
    || ts.isNonNullExpression(parent)
  ) {
    current = parent;
    parent = current.parent;
  }
  if (ts.isVoidExpression(parent)) return false;
  return !ts.isExpressionStatement(parent);
}

function enclosingFunctionName(node: ts.Node): string | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current)
      || ts.isFunctionExpression(current)
      || ts.isArrowFunction(current)
      || ts.isMethodDeclaration(current)
    ) {
      if ("name" in current && current.name && ts.isIdentifier(current.name)) return current.name.text;
      if (ts.isVariableDeclaration(current.parent) && ts.isIdentifier(current.parent.name)) {
        return current.parent.name.text;
      }
      let owner: ts.Node | undefined = current.parent;
      while (owner && (ts.isCallExpression(owner) || ts.isParenthesizedExpression(owner))) {
        owner = owner.parent;
      }
      if (owner && ts.isVariableDeclaration(owner) && ts.isIdentifier(owner.name)) {
        return owner.name.text;
      }
      return undefined;
    }
    current = current.parent;
  }
  return undefined;
}

function callsAndConsumesImportedBinding(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  imported: ts.Symbol,
  binding: string,
  within: string,
): boolean {
  let consumed = false;
  walk(source, (node) => {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === binding
      && checker.getSymbolAtLocation(node.expression) === imported
       && (enclosingFunctionName(node) === within || isNestedWithinNamedFunction(node, within))
      && callResultIsConsumed(node)
    ) {
      consumed = true;
    }
  });
  return consumed;
}

function isNestedWithinNamedFunction(node: ts.Node, name: string): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current) || ts.isArrowFunction(current))
      && ((current.name && ts.isIdentifier(current.name) && current.name.text === name)
        || (ts.isVariableDeclaration(current.parent) && ts.isIdentifier(current.parent.name) && current.parent.name.text === name))
    ) return true;
    current = current.parent;
  }
  return false;
}

function callsIdentifier(source: ts.SourceFile, callee: string): boolean {
  let found = false;
  walk(source, (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === callee) {
      found = true;
    }
  });
  return found;
}

function callsReceiverMethod(source: ts.SourceFile, receiver: string, method: string): boolean {
  let found = false;
  walk(source, (node) => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
    if (node.expression.name.text !== method) return;
    if (node.expression.expression.getText(source) === receiver) found = true;
  });
  return found;
}

const stageName = process.argv[2] ?? "baseline";
const stage = stages[stageName];
if (!stage) fail(`unknown stage "${stageName}". Expected one of: ${Object.keys(stages).join(", ")}`);

for (const file of stage.files) {
  if (!existsSync(atRoot(file))) fail(`required file does not exist: ${file}`);
}

for (const caller of stage.callers) {
  if (!existsSync(atRoot(caller.file))) fail(`required production caller does not exist: ${caller.file}`);
  const { source, checker } = analyze(caller.file);
  const imported = importedSymbol(source, checker, caller.module, caller.binding);
  if (!imported) {
    fail(`production caller ${caller.file} does not import binding "${caller.binding}" from "${caller.module}"`);
  }
  if (!callsAndConsumesImportedBinding(source, checker, imported, caller.binding, caller.within)) {
    fail(`production caller ${caller.file} does not consume imported "${caller.binding}" in ${caller.within}`);
  }
  console.log(`Production wiring: ${caller.file} consumes ${caller.binding}()`);
}

for (const rule of stage.forbiddenCalls) {
  if (existsSync(atRoot(rule.file)) && callsIdentifier(analyze(rule.file).source, rule.callee)) {
    fail(`legacy API call remains in ${rule.file}: ${rule.callee}()`);
  }
}
for (const rule of stage.forbiddenMethods) {
  if (existsSync(atRoot(rule.file)) && callsReceiverMethod(analyze(rule.file).source, rule.receiver, rule.method)) {
    fail(`legacy resource operation remains in ${rule.file}: ${rule.receiver}.${rule.method}()`);
  }
}

console.log("\nRequired files:");
stage.files.forEach((file) => console.log(`  ${file}`));
console.log("\nGit diff --check (working tree and staged):");
execFileSync("git", ["-C", root, "diff", "--check"], { stdio: "inherit" });
execFileSync("git", ["-C", root, "diff", "--cached", "--check"], { stdio: "inherit" });

const untracked = git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean);
for (const file of untracked) {
  const source = readFileSync(atRoot(file), "utf8");
  if (/^(<{7}|={7}|>{7})(?: |$)/m.test(source)) fail(`untracked file contains conflict markers: ${file}`);
  source.split(/\r?\n/).forEach((line, index) => {
    if (/[ \t]+$/.test(line)) fail(`untracked file has trailing whitespace: ${file}:${index + 1}`);
  });
}

console.log("\nGit diff --stat:");
console.log("Working tree:");
console.log(git("diff", "--stat") || "  (no unstaged diff)");
console.log("Staged:");
console.log(git("diff", "--cached", "--stat") || "  (no staged diff)");
if (untracked.length > 0) {
  console.log("Untracked files included in review:");
  untracked.forEach((file) => console.log(`  ${file} (${statSync(atRoot(file)).size} bytes)`));
}
console.log("\nGit status --short:");
console.log(git("status", "--short") || "  (clean)");
console.log(`\nPASS: ${stageName} migration evidence is present. Manual review is still required.`);