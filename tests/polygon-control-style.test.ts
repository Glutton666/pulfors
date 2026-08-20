import fs from "node:fs";
import path from "node:path";

const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

const between = (source: string, start: string, end: string) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Could not find control block: ${start}`);
  return source.slice(from, to);
};

describe("polygon plus/minus control styling", () => {
  it("keeps BPM plus/minus targets at 36px without a circular container", () => {
    const source = readSource("components/PolygonModeView.tsx");

    for (const testId of ['testID="bpm-minus"', 'testID="bpm-plus"']) {
      const control = between(source, testId, "</Pressable>");
      expect(control).toContain("width: S.ms(36, 0.3)");
      expect(control).toContain("height: S.ms(36, 0.3)");
      expect(control).not.toContain("borderRadius");
      expect(control).not.toContain("backgroundColor");
      expect(control).not.toContain("borderWidth");
    }
  });

  it("keeps side-count plus/minus targets at 32px without a circular container", () => {
    const source = readSource("components/polygon-mode/PolygonLayerEditor.tsx");

    for (const direction of ["-1", "1"]) {
      const control = between(
        source,
        `handleSidesChange(editingLayer.id, ${direction})`,
        "</Pressable>",
      );
      expect(control).toContain("width: 32");
      expect(control).toContain("height: 32");
      expect(control).not.toContain("borderRadius");
      expect(control).not.toContain("backgroundColor");
      expect(control).not.toContain("borderWidth");
    }
  });

  it("does not render the status dot beside the BPM value", () => {
    const source = readSource("components/PolygonModeView.tsx");
    const bpmDisplay = between(source, "/* BPM 표시: 수직 스와이프로 조정 */", "/* + 버튼");

    expect(bpmDisplay).not.toContain("width: 8, height: 8");
    expect(bpmDisplay).not.toContain("backgroundColor: isPlaying");
  });
});