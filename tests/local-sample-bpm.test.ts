import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

test("sample editor removes automatic BPM measurement while preserving manual tempo controls", () => {
  const modal = fs.readFileSync(path.resolve(process.cwd(), "components/NoteRecorderModal.tsx"), "utf8");
  const routes = fs.readFileSync(path.resolve(process.cwd(), "server/routes.ts"), "utf8");

  assert.ok(!modal.includes('t("noteRecorder", "bpmMeasure")'));
  assert.ok(!modal.includes("detectBpmCandidatesOnDevice"));
  assert.ok(!modal.includes("onset-bpm-detect"));
  assert.ok(modal.includes('t("noteRecorder", "previewBpm")'));
  assert.ok(modal.includes('t("noteRecorder", "tapTempo")'));
  assert.ok(modal.includes("registerSampleTempoTap"));
  assert.ok(modal.includes("onApplyPreviewBpm"));
  assert.ok(!modal.includes("/api/analyze-audio"));
  assert.ok(!routes.includes("analyze-audio"));
  assert.ok(!routes.includes("ffmpeg"));
});