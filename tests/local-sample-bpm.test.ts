import { test } from "node:test";
import assert from "node:assert/strict";
import { adjustBpmCandidatesForPlaybackSpeed } from "../lib/onset-bpm-detect";
import * as fs from "node:fs";
import * as path from "node:path";

test("local BPM candidates reflect playback speed and remain in the supported range", () => {
  assert.deepEqual(adjustBpmCandidatesForPlaybackSpeed([60, 120, 180], 0.5), [60, 90]);
  assert.deepEqual(adjustBpmCandidatesForPlaybackSpeed([60, 120, 180], 1.5), [90, 180]);
  assert.deepEqual(adjustBpmCandidatesForPlaybackSpeed([120, 120], 1), [120]);
});

test("sample BPM measurement is manual and never posts audio to the server", () => {
  const modal = fs.readFileSync(path.resolve(process.cwd(), "components/NoteRecorderModal.tsx"), "utf8");
  const routes = fs.readFileSync(path.resolve(process.cwd(), "server/routes.ts"), "utf8");

  assert.ok(modal.includes("BPM 측정"));
  assert.ok(!modal.includes("/api/analyze-audio"));
  assert.ok(!routes.includes("analyze-audio"));
  assert.ok(!routes.includes("ffmpeg"));
});