import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const baseline = readFileSync("docs/audio-pipeline-migration-baseline.md", "utf8");
const verifier = readFileSync("scripts/verify-audio-migration-stage.ts", "utf8");

describe("audio migration guardrails", () => {
  test("requires implementation, production wiring, and legacy removal evidence", () => {
    expect(baseline).toContain("새 구현 존재");
    expect(baseline).toContain("실제 실행 경로 연결");
    expect(baseline).toContain("대응 구 구현 제거");
    expect(baseline).toContain("사용자가 diff와 Git 상태를 직접 확인");
  });

  test("documents current ownership of every high-risk resource class", () => {
    for (const resource of [
      "native rendered player",
      "web rendered loop",
      "realtime web source",
      "rendered URL",
      "render task",
      "Polygon timer",
      "Score prepare/RAF",
      "PCM cache",
      "watchdog timer",
    ]) {
      expect(baseline).toContain(resource);
    }
  });

  test("keeps mode-specific plans separate", () => {
    expect(baseline).toContain("discriminated union");
    expect(baseline).toContain("Score와 Polygon");
  });

  test("verifier checks files, production imports, legacy markers, and Git evidence", () => {
    expect(verifier).toContain("required file does not exist");
    expect(verifier).toContain("does not import binding");
    expect(verifier).toContain("does not consume imported");
    expect(verifier).toContain("legacy API call remains");
    expect(verifier).toContain("legacy resource operation remains");
    expect(verifier).toContain('"diff", "--check"');
    expect(verifier).toContain('"status", "--short"');
  });

  function fixture(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "audio-migration-"));
    execFileSync("git", ["init", "-q", root]);
    for (const [file, content] of Object.entries(files)) {
      const path = join(root, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
    return root;
  }

  function verify(root: string, stage: string) {
    return spawnSync(
      process.execPath,
      [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/verify-audio-migration-stage.ts"), stage],
      { cwd: root, env: { ...process.env, AUDIO_MIGRATION_ROOT: root }, encoding: "utf8" },
    );
  }

  test("rejects a stage when any required production caller is missing", () => {
    const root = fixture({ "lib/audio-render-lifecycle.ts": "export {};\n" });
    const result = verify(root, "lifecycle");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("required production caller does not exist");
  });

  test("rejects import-only wiring that never uses the replacement", () => {
    const root = fixture({
      "lib/audio-playback-plan.ts": "export {};\n",
      "hooks/usePlaybackControl.ts":
        'import { buildPlaybackPlan } from "@/lib/audio-playback-plan";\n' +
        "const startPreparedPlayback = () => 1;\n",
    });
    const result = verify(root, "plan");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("does not consume imported");
  });

  test("rejects a called but discarded replacement result", () => {
    const root = fixture({
      "lib/audio-playback-plan.ts": "export {};\n",
      "hooks/usePlaybackControl.ts":
        'import { buildPlaybackPlan } from "@/lib/audio-playback-plan";\n' +
        "const startPreparedPlayback = () => {\n" +
        "  buildPlaybackPlan();\n" +
        "  return Platform.OS === 'web';\n" +
        "};\n",
    });
    const result = verify(root, "plan");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("does not consume imported");
  });

  test("rejects retained legacy API despite formatting changes", () => {
    const root = fixture({
      "lib/audio-playback-plan.ts": "export {};\n",
      "hooks/usePlaybackControl.ts":
        'import { buildPlaybackPlan } from "@/lib/audio-playback-plan";\n' +
        "const startPreparedPlayback = () => {\n" +
        "  const plan = buildPlaybackPlan();\n" +
        "  configureEngine\n(\nengine\n);\n" +
        "  return plan;\n" +
        "};\n",
    });
    const result = verify(root, "plan");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("legacy API call remains");
  });

  test("comments, strings, and unrelated methods cannot fake production wiring", () => {
    const root = fixture({
      "lib/audio-playback-plan.ts": "export {};\n",
      "hooks/usePlaybackControl.ts":
        '// import { buildPlaybackPlan } from "@/lib/audio-playback-plan";\n' +
        'const text = "buildPlaybackPlan()";\n' +
        "const startPreparedPlayback = () => owner.buildPlaybackPlan();\n",
    });
    const result = verify(root, "plan");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("does not import binding");
  });

  test("shadowed and dead replacement calls cannot satisfy wiring", () => {
    const root = fixture({
      "lib/audio-playback-plan.ts": "export {};\n",
      "hooks/usePlaybackControl.ts":
        'import { buildPlaybackPlan } from "@/lib/audio-playback-plan";\n' +
        "const startPreparedPlayback = () => {\n" +
        "  const dead = (buildPlaybackPlan: () => unknown) => buildPlaybackPlan();\n" +
        "  return 1;\n" +
        "};\n",
    });
    const result = verify(root, "plan");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("does not consume imported");
  });

  test("explicitly voided replacement results cannot satisfy wiring", () => {
    const root = fixture({
      "lib/audio-playback-plan.ts": "export {};\n",
      "hooks/usePlaybackControl.ts":
        'import { buildPlaybackPlan } from "@/lib/audio-playback-plan";\n' +
        "const startPreparedPlayback = () => {\n" +
        "  void buildPlaybackPlan();\n" +
        "  return 1;\n" +
        "};\n",
    });
    const result = verify(root, "plan");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("does not consume imported");
  });

  test("allows unrelated scheduler stop calls outside known audio receivers", () => {
    const root = fixture({
      "lib/audio-output-owner.ts": "export {};\n",
      "lib/web-audio-output.ts": "export {};\n",
      "lib/native-audio-output.ts": "export {};\n",
      "hooks/useAudioPipeline.ts":
        'import { createAudioOutputOwner } from "@/lib/audio-output-owner";\n' +
        "const useAudioPipeline = () => {\n" +
        "  engineRef.current?.stop();\n" +
        "  return createAudioOutputOwner();\n" +
        "};\n",
      "hooks/usePlaybackControl.ts":
        'import { publishAudioOutput } from "@/lib/audio-output-owner";\n' +
        "const startPreparedPlayback = () => publishAudioOutput();\n",
      "hooks/usePolygonMode.ts":
        'import { playPolygonAudioOutput } from "@/lib/audio-output-owner";\n' +
        "const usePolygonMode = () => playPolygonAudioOutput();\n",
    });
    const result = verify(root, "output");
    expect(result.status).toBe(0);
  });

  test("reports untracked files as review evidence", () => {
    const root = fixture({
      "docs/audio-pipeline-migration-baseline.md": "baseline\n",
      "scripts/benchmark-audio-renderer.ts": "benchmark\n",
      "scripts/verify-audio-migration-stage.ts": "verifier\n",
      "extra-untracked.txt": "review me\n",
    });
    const result = verify(root, "baseline");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Untracked files included in review");
    expect(result.stdout).toContain("extra-untracked.txt");
  });

  test("checks and reports staged changes too", () => {
    const root = fixture({
      "docs/audio-pipeline-migration-baseline.md": "baseline\n",
      "scripts/benchmark-audio-renderer.ts": "benchmark\n",
      "scripts/verify-audio-migration-stage.ts": "verifier\n",
    });
    execFileSync("git", ["-C", root, "add", "."]);
    const result = verify(root, "baseline");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Staged:");
    expect(result.stdout).toContain("3 files changed");
  });
});