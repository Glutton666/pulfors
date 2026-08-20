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

describe("polygon controls styling", () => {
  it("uses the beat-mode BPM controller after the layer editor", () => {
    const source = readSource("components/PolygonModeView.tsx");

    expect(source).toContain('import { BpmSlider } from "@/components/BpmSlider";');
    expect(source.indexOf("<PolygonLayerEditor")).toBeLessThan(source.indexOf("<BpmSlider"));
    expect(source).not.toContain('testID="bpm-minus"');
    expect(source).not.toContain('testID="bpm-plus"');
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

});