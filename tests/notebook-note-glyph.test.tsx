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
  expect(view.getByTestId("notebook-note-head").getAttribute("fill")).toBe(open && glyph !== "whole" ? "none" : "#111111");
  expect(group.querySelectorAll("path")).toHaveLength((glyph === "whole" ? 1 : 0) + (stem ? 1 : 0) + (flags > 0 ? 1 : 0));
  if (flags > 0) {
    const flag = view.getByTestId("notebook-note-flag-0");
    expect(flag.getAttribute("fill")).toBe("#111111");
    expect(flag.getAttribute("d")).toMatch(/C/);
    expect(flag.getAttribute("d")).toMatch(/Z$/);
    expect(flag.getAttribute("transform")).toBe(`translate(4.8 ${glyph === "thirty_second" ? -36.625 : -42}) scale(0.025 -0.025)`);
  }
});

test("whole-note paper and picker use the same engraved hollow outline without hiding staff lines", () => {
  const view = render(<svg><NotebookGlyph glyph="whole" x={220} y={150} size={39} role="strong" dotted /></svg>);
  const head = view.getByTestId("notebook-note-head");
  expect(head.tagName.toLowerCase()).toBe("path");
  expect(head.getAttribute("fill")).toBe("#111111");
  expect(head.getAttribute("fill-rule")).toBe("evenodd");
  expect(head.getAttribute("d")).toMatch(/[CQcq]/);
  // Distinct outer and inner contours create a transparent counter, not a
  // uniformly stroked ellipse or a white shape painted over the staff.
  expect((head.getAttribute("d")!.match(/[Mm]/g) ?? []).length).toBeGreaterThanOrEqual(2);
  expect(view.queryByTestId("notebook-note-stem")).toBeNull();
  expect(view.queryByTestId("notebook-note-flag-0")).toBeNull();
  expect(view.getByTestId("notebook-note-whole").getAttribute("transform")).toBe("translate(220 150) scale(1.5)");
  expect(view.getByTestId("notebook-strong-mark")).toBeTruthy();
  expect(view.getByTestId("notebook-dot")).toBeTruthy();
  expect(view.container.querySelector('[fill="white"], [fill="#fff"], [fill="#ffffff"]')).toBeNull();
  const outline = head.getAttribute("d");
  view.unmount();
  const preview = render(<NotebookGlyphPreview glyph="whole" />);
  expect(preview.getByTestId("notebook-note-head").getAttribute("d")).toBe(outline);
});

test("standalone flag levels use distinct compound Bravura outlines rather than stacked copies", () => {
  const view = render(<svg>
    <NotebookGlyph glyph="eighth" x={0} y={40} size={26} />
    <NotebookGlyph glyph="sixteenth" x={30} y={40} size={26} />
    <NotebookGlyph glyph="thirty_second" x={60} y={40} size={26} />
  </svg>);
  const outline = (duration: string) => view.getByTestId(`notebook-note-${duration}`).querySelector('[data-testid="notebook-note-flag-0"]')!.getAttribute("d")!;
  const path8 = outline("eighth");
  const path16 = outline("sixteenth");
  const path32 = outline("thirty_second");
  expect(new Set([path8, path16, path32]).size).toBe(3);
  expect((path16.match(/M /g) ?? []).length).toBe(2);
  expect((path32.match(/M /g) ?? []).length).toBe(3);
});

test("the palette uses the same full note shapes as paper, without clipping flag tops", () => {
  const view = render(<NotebookGlyphPreview glyph="sixteenth" />);
  expect(view.getByTestId("notebook-note-sixteenth")).toBeTruthy();
  const preview = view.container.querySelector("svg")!;
  const [left, top, width, height] = preview.getAttribute("viewBox")!.split(" ").map(Number);
  const transform = view.getByTestId("notebook-note-sixteenth").getAttribute("transform")!;
  const [, x, y, scale] = transform.match(/translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/)!;
  expect(Number(y) - 42 * Number(scale)).toBeGreaterThan(top);
  expect(Number(y) + 6 * Number(scale)).toBeLessThan(top + height);
  expect(Number(x) + 13 * Number(scale)).toBeLessThan(left + width);
});

test.each(["clef-treble", "clef-bass", "clef-alto", "clef-tenor", "clef-percussion"])("palette clef %s renders vectors instead of a missing font character", (glyph) => {
  const view = render(<svg><NotebookGlyph glyph={glyph} x={20} y={60} size={26} /></svg>);
  expect(view.getByTestId(`notebook-${glyph}`).querySelector("path")).toBeTruthy();
});
test("a placed meter renders its numerator and denominator separately", () => {
  const view = render(<svg><NotebookGlyph glyph="time-6-8" x={20} y={60} size={26} /></svg>);
  expect([...view.getByTestId("notebook-meter-glyph").querySelectorAll("text")].map((node) => node.textContent)).toEqual(["6", "8"]);
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

test.each([22, 26, 42, 52])("a strong whole note has a small, bounded head-to-accent gap at size %i", (size) => {
  const view = render(<NotebookGlyphPreview glyph="whole" role="strong" size={size} />);
  const mark = view.getByTestId("notebook-strong-mark");
  const bottom = Number(mark.getAttribute("transform")!.match(/translate\(0 ([\d.-]+)\)/)![1]);
  const gap = (-5 - bottom) * size / 26;
  expect(gap).toBeGreaterThan(2);
  expect(gap).toBeLessThanOrEqual(3.5 + 1e-8);
});

test.each([["up", 106, -22], ["down", 168, -3.85]] as const)("a strong beamed note stays next to the ink with an %s stem", (direction, stemY, top) => {
  const view = render(<svg><NotebookGlyph glyph="eighth" x={80} y={150} size={52} role="strong"
    beam={{ id: "note", stemX: 84, headY: 150, stemY, direction, scale: 2, levels: 1 }} /></svg>);
  expect(view.getByTestId("notebook-strong-mark").getAttribute("transform")).toBe(`translate(0 ${top - 1.75})`);
});
