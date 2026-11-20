/** @jest-environment jsdom */
import React from "react";
import { render } from "@testing-library/react";
import { NotebookTupletGlyph, NotebookTupletPreview } from "@/components/lab-score/notebook/NotebookTupletGlyph";
import { notebookTupletSpans } from "@/lib/notebook-tuplet-layout";
import { notebookBeaming } from "@/lib/notebook-beaming";
import type { StaffPage } from "@/lib/staff-notebook";

jest.mock("react-native-svg", () => {
  const React = require("react");
  return { __esModule: true, ...Object.fromEntries([
    ["default", "svg"], ["G", "g"], ["Path", "path"], ["Text", "text"],
  ].map(([key, tag]) => [key, ({ children, testID, ...props }: any) =>
    React.createElement(tag, { ...props, "data-testid": testID }, children)])) };
});

const page = (): StaffPage => ({
  id: "paper", staffCount: 4, strokes: [],
  stamps: [0, 1, 2].map((i) => ({ id: `n${i}`, glyph: "quarter", x: 100 + i * 45, y: 102, size: 26 })),
  tuplets: [{ id: "triplet", stampIds: ["n0", "n1", "n2"] }],
});

test("reference bracket has two real strokes with a centered italic numeral and no white mask", () => {
  const view = render(<svg><NotebookTupletGlyph left={50} right={150} y={40} count={3} /></svg>);
  expect(view.container.querySelectorAll("path")).toHaveLength(2);
  expect(view.container.querySelectorAll("rect")).toHaveLength(0);
  expect(view.getByTestId("notebook-tuplet-left").getAttribute("d")).toMatch(/^M50 46 V40 H/);
  expect(view.getByTestId("notebook-tuplet-right").getAttribute("d")).toMatch(/ H150 V46$/);
  expect(view.getByTestId("notebook-tuplet-number").textContent).toBe("3");
  expect(view.getByTestId("notebook-tuplet-number").getAttribute("x")).toBe("100");
});

test("the toolbar preview uses the same notation, not literal square-bracket text", () => {
  const view = render(<NotebookTupletPreview />);
  expect(view.container.textContent).toBe("3");
  expect(view.container.querySelectorAll("path")).toHaveLength(2);
});

test("bracket clears stems, strong markings and attached articulations", () => {
  const p = page();
  const normal = notebookTupletSpans(p)[0];
  expect(normal.y).toBeLessThan(102 - 32);
  p.stamps![1].role = "strong";
  const accented = notebookTupletSpans(p)[0];
  expect(accented.y).toBeLessThan(normal.y);
  p.stamps!.push({ id: "fermata", glyph: "fermata", attachTo: "n1", x: 145, y: 65, size: 26 });
  expect(notebookTupletSpans(p)[0].y).toBeLessThan(65 - 20.8);
  p.stamps!.at(-1)!.y = 45;
  const crowded = notebookTupletSpans(p)[0];
  expect(crowded.below).toBe(true);
  expect(crowded.stemJoins!.every((stem) => stem.direction === "down" && stem.stemY === crowded.y)).toBe(true);
});

test("four quarters join the thin tuplet rule without adding a rhythmic beam", () => {
  const p = page();
  p.stamps = [120, 114, 108, 108, 108].map((y, i) =>
    ({ id: `n${i}`, glyph: "quarter", x: 75 + i * 80, y, size: 26 }));
  p.tuplets![0].stampIds = ["n0", "n1", "n2", "n3"];
  const before = JSON.stringify(p);
  const beaming = notebookBeaming(p);
  const span = notebookTupletSpans(p, undefined, beaming)[0];
  expect(beaming.groups).toHaveLength(0);
  expect(span.count).toBe(4);
  expect(span.stemJoins!.map((stem) => stem.id)).toEqual(["n0", "n1", "n2", "n3"]);
  expect(span.stemJoins!.every((stem) => stem.stemY === span.y && stem.direction === "up")).toBe(true);
  expect(span.numberY).toBeUndefined();
  expect(JSON.stringify(p)).toBe(before);
});

test("a centered stem stays connected by moving the numeral off the rule", () => {
  const span = notebookTupletSpans(page())[0];
  const view = render(<svg><NotebookTupletGlyph {...span} /></svg>);
  expect(span.stemJoins).toHaveLength(3);
  expect(span.numberY).toBeLessThan(span.y);
  expect(view.getByTestId("notebook-tuplet-left").getAttribute("d")).toContain(`H${span.right}`);
  expect(view.queryByTestId("notebook-tuplet-right")).toBeNull();
  expect(Number(view.getByTestId("notebook-tuplet-number").getAttribute("y"))).toBeLessThan(span.y);
});

test("whole notes and rests count toward the same rule without gaining stems", () => {
  const p = page();
  p.stamps![0].glyph = "half";
  p.stamps![1].glyph = "rest-quarter";
  p.stamps![2].glyph = "whole";
  const span = notebookTupletSpans(p)[0];
  expect(span.count).toBe(3);
  expect(span.stemJoins!.map((stem) => stem.id)).toEqual(["n0"]);
});

test("whole notes and rests keep the bracket outside the staff, with enough numeral clearance", () => {
  const p = page();
  p.stamps!.forEach((stamp) => { stamp.glyph = "rest-thirty_second"; stamp.x = 100; });
  const span = notebookTupletSpans(p)[0];
  expect(span.y).toBeLessThan(78);
  expect(span.right - span.left).toBeGreaterThan(span.fontSize * 0.65 + 8);
  p.stamps!.forEach((stamp) => { stamp.glyph = "whole"; });
  expect(notebookTupletSpans(p)[0].y).toBeLessThan(78);
});

test("line-break fragments retain total count and only the outer endpoints have hooks", () => {
  const p = page();
  p.stamps![2].y += 155;
  const spans = notebookTupletSpans(p);
  expect(spans).toHaveLength(2);
  expect(spans.map((span) => span.count)).toEqual([3, 3]);
  expect(spans[0]).toMatchObject({ continuedLeft: false, continuedRight: true, right: 862 });
  expect(spans[1]).toMatchObject({ continuedLeft: true, continuedRight: false, left: 38 });
});

test("open bracket omits the closing hook; near-top groups can use an upward-hooked lower bracket", () => {
  const p = page();
  p.tuplets = [];
  p.stamps!.forEach((stamp) => { stamp.y = 12; });
  const span = notebookTupletSpans(p, ["n0", "n1"])[0];
  expect(span).toMatchObject({ open: true, count: 2, below: true });
  const view = render(<svg><NotebookTupletGlyph {...span} /></svg>);
  expect(view.getByTestId("notebook-open-tuplet")).toBeTruthy();
  expect(view.getByTestId("notebook-tuplet-right").getAttribute("d")).not.toMatch(/V/);
  expect(span.y).toBeGreaterThan(126);
});
