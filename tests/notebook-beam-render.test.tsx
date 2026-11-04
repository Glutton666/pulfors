/** @jest-environment jsdom */
import React from "react";
import { render } from "@testing-library/react";
import { NotebookNoteGlyph } from "@/components/lab-score/notebook/NotebookNoteGlyph";
import { NotebookBeamLayer } from "@/components/lab-score/notebook/NotebookBeamLayer";
import { NotebookTupletGlyph } from "@/components/lab-score/notebook/NotebookTupletGlyph";
import { notebookBeaming } from "@/lib/notebook-beaming";
import type { StaffPage } from "@/lib/staff-notebook";

jest.mock("react-native-svg", () => {
  const React = require("react");
  return { __esModule: true, ...Object.fromEntries([
    ["default", "svg"], ["G", "g"], ["Path", "path"], ["Text", "text"], ["Ellipse", "ellipse"], ["Polygon", "polygon"],
  ].map(([key, tag]) => [key, ({ children, testID, ...props }: any) =>
    React.createElement(tag, { ...props, "data-testid": testID }, children)])) };
});

test("beam polygons replace individual flags and meet scaled down-stem endpoints", () => {
  const page: StaffPage = { id: "p", strokes: [], stamps: [0, 1].map((i) =>
    ({ id: `n${i}`, glyph: "sixteenth", x: 100 + i * 70, y: 80, size: 39 })) };
  const beaming = notebookBeaming(page);
  const view = render(<svg>
    {page.stamps!.map((stamp) => <NotebookNoteGlyph key={stamp.id} duration="sixteenth" {...stamp}
      beam={beaming.stems.get(stamp.id)} />)}
    <NotebookBeamLayer groups={beaming.groups} />
  </svg>);
  expect(view.queryAllByTestId(/notebook-note-flag/)).toHaveLength(0);
  expect(view.getAllByTestId("notebook-note-head")).toHaveLength(2);
  expect(view.getAllByTestId("notebook-beam-level-1")).toHaveLength(1);
  expect(view.getAllByTestId("notebook-beam-level-2")).toHaveLength(1);
  for (const path of view.getAllByTestId("notebook-note-stem")) {
    const stem = beaming.stems.get("n0")!;
    expect(path.getAttribute("d")).toBe(`M -4.8 0 L -4.8 ${(stem.stemY - 80) / 1.5}`);
  }
  expect(view.container.innerHTML).not.toMatch(/NaN|Infinity/);
});

test("unbeamed notes keep their ordinary flag and original stem", () => {
  const view = render(<svg><NotebookNoteGlyph duration="eighth" x={10} y={100} size={26} /></svg>);
  expect(view.getByTestId("notebook-note-flag-0")).toBeTruthy();
  expect(view.getByTestId("notebook-note-stem").getAttribute("d")).toBe("M 4.8 0 L 4.8 -31");
});

test("fully beamed tuplets show only the number while partial groups retain hooks", () => {
  const view = render(<svg><NotebookTupletGlyph left={50} right={150} y={40} count={3} numberOnly /></svg>);
  expect(view.getByTestId("notebook-tuplet-number").textContent).toBe("3");
  expect(view.container.querySelectorAll("path")).toHaveLength(0);
  view.rerender(<svg><NotebookTupletGlyph left={50} right={150} y={40} count={3} /></svg>);
  expect(view.container.querySelectorAll("path")).toHaveLength(2);
});
