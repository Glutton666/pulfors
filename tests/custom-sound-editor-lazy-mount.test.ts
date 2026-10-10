import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "components/CustomSoundSetEditor.tsx"),
  "utf8",
);

// Regression (2026-10-10): the editor is permanently mounted inside the Bar
// editor panel, and its body creates 33 preview players (11 sets x 3 roles).
// Mounting them at app/mode start exhausted Android AudioTrack slots
// (createTrack_l -12) and silenced the metronome. The body must only mount
// while the editor is visible.
test("CustomSoundSetEditor mounts its preview-player body only while visible", () => {
  assert.match(source, /export function CustomSoundSetEditor\(props: CustomSoundSetEditorProps\)/);
  assert.match(source, /if \(!mounted && !props\.visible\) return null;/);
  assert.match(source, /<CustomSoundSetEditorBody \{\.\.\.props\} \/>/);
});

test("preview useAudioPlayer hooks live only in the lazily mounted body", () => {
  const wrapperStart = source.indexOf("export function CustomSoundSetEditor(");
  const bodyStart = source.indexOf("function CustomSoundSetEditorBody(");
  assert.ok(wrapperStart >= 0 && bodyStart > wrapperStart);
  const wrapper = source.slice(wrapperStart, bodyStart);
  assert.equal(wrapper.includes("useAudioPlayer("), false);
  assert.ok(source.slice(bodyStart).includes("useAudioPlayer("));
});
