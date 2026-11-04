/** @jest-environment jsdom */
import React from "react";
import { render } from "@testing-library/react";
import { NotebookGlyph, NotebookGlyphPreview } from "@/components/lab-score/notebook/NotebookGlyph";
import { StaffNoteGlyph } from "@/components/staff/StaffGlyphs";

jest.mock("@/components/ScorePalette", () => ({ ALL_INSTR_SYMBOLS: [], ARTICULATIONS: [] }));
jest.mock("react-native-svg", () => {
  const React = require("react");
  return {
    __esModule: true,
    ...Object.fromEntries([
      ["default", "svg"], ["G", "g"], ["Ellipse", "ellipse"],
      ["Circle", "circle"], ["Path", "path"], ["Line", "line"], ["Text", "text"],
    ].map(([key, tag]) => [key, ({ children, testID, ...props }: any) =>
      React.createElement(tag, { ...props, "data-testid": testID }, children)])),
  };
});

test.each(["whole", "half", "quarter", "eighth", "sixteenth", "thirty_second"])("rest %s renders a dot in both the page and picker preview", (duration) => {
  const glyph = `rest-${duration}`;
  const view = render(<svg><NotebookGlyph glyph={glyph} x={100} y={102} size={26} dotted /></svg>);
  expect(view.getByTestId("notebook-rest-dot")).toBeTruthy();
  expect(view.queryByTestId("notebook-strong-mark")).toBeNull();
  if (duration === "thirty_second") expect(view.container.querySelectorAll('[data-testid^="bar-rest-flag-"]')).toHaveLength(3);
  view.unmount();
  const preview = render(<NotebookGlyphPreview glyph={glyph} dotted />);
  expect(preview.getByTestId("notebook-rest-dot")).toBeTruthy();
});

test.each([
  ["whole", false, true, 0],
  ["half", true, true, 0],
  ["quarter", true, false, 0],
  ["eighth", true, false, 1],
  ["sixteenth", true, false, 2],
  ["thirty_second", true, false, 3],
] as const)("%s uses a standard head, correct stem and flag count without ghost parentheses", (glyph, stem, open, flags) => {
  const view = render(<svg><NotebookGlyph glyph={glyph} x={220} y={150} size={26} /></svg>);
  const group = view.getByTestId(`notebook-note-${glyph}`);
  expect(group.getAttribute("transform")).toBe("translate(220 150) scale(1)");
  expect(view.queryByTestId("notebook-note-stem") !== null).toBe(stem);
  expect(view.getByTestId("notebook-note-head").getAttribute("fill")).toBe(open ? "none" : "#111111");
  expect(group.querySelectorAll("path")).toHaveLength((stem ? 1 : 0) + flags);
  for (let index = 0; index < flags; index++) {
    const flag = view.getByTestId(`notebook-note-flag-${index}`);
    expect(flag.getAttribute("fill")).toBe("#111111");
    expect(flag.getAttribute("d")).toMatch(/C/);
    expect(flag.getAttribute("d")).toMatch(/Z$/);
    expect(flag.getAttribute("d")).toContain("M 4.8 ");
  }
});

test("the palette uses the same full note shapes as paper, without clipping flag tops", () => {
  const view = render(<NotebookGlyphPreview glyph="sixteenth" />);
  expect(view.getByTestId("notebook-note-sixteenth")).toBeTruthy();
  const preview = view.container.querySelector("svg")!;
  const [left, top, width, height] = preview.getAttribute("viewBox")!.split(" ").map(Number);
  const transform = view.getByTestId("notebook-note-sixteenth").getAttribute("transform")!;
  const [, x, y, scale] = transform.match(/translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/)!;
  expect(Number(y) - 31 * Number(scale)).toBeGreaterThan(top);
  expect(Number(y) + 6 * Number(scale)).toBeLessThan(top + height);
  expect(Number(x) + 13 * Number(scale)).toBeLessThan(left + width);
});

test("rest notation and Beat/Bar's intentional normal ghost glyph remain unchanged", () => {
  const view = render(<svg>
    <NotebookGlyph glyph="rest-eighth" x={0} y={0} size={26} />
    <StaffNoteGlyph type="normal" active index={9} x={50} beamCount={0} grouped={false}
      noteValueDenominator={4} colors={{ accent: "#111111" }} noteY={0} stemTop={-31} beamGap={5} />
  </svg>);
  expect(view.getByTestId("bar-rest-eighth-0")).toBeTruthy();
  expect(view.getByTestId("bar-note-normal-9").querySelectorAll("path")).toHaveLength(2);
});
test.each(["normal", "ghost", "strong"] as const)("%s role and dot remain explicit rather than becoming default ghost notes", (role) => {
  const view = render(<svg><NotebookGlyph glyph="quarter" x={0} y={50} size={26} role={role} dotted /></svg>);
  expect(view.queryByTestId("notebook-ghost-mark") !== null).toBe(role === "ghost");
  expect(view.queryByTestId("notebook-strong-mark") !== null).toBe(role === "strong");
  expect(view.getByTestId("notebook-dot")).toBeTruthy();
});
