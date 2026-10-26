/** @jest-environment jsdom */
import React from "react";
import { act, render } from "@testing-library/react";
import { RhythmStaff } from "../components/lab-score/RhythmStaff";
import { indexStaffEvents, layoutStaffMeasures, staffWindow } from "../components/lab-score/rhythm-staff-layout";
import type { NotationEvent } from "../lib/rhythm-lab/types";

jest.mock("react-native-svg", () => {
  const React = require("react");
  return { __esModule: true, ...Object.fromEntries([["default", "svg"], ["Circle", "circle"], ["Ellipse", "ellipse"],
    ["G", "g"], ["Line", "line"], ["Path", "path"], ["Rect", "rect"], ["Text", "text"]]
    .map(([name, tag]) => [name, ({ children, testID, ...props }: any) =>
      React.createElement(tag, { ...props, "data-testid": testID }, children)])) };
});
jest.mock("react-native", () => {
  const React = require("react"), actual = jest.requireActual("react-native");
  const View = React.forwardRef(({ children, testID, onLayout, onScroll, __gesture, style }: any, ref: any) =>
    React.createElement("div", { "data-testid": testID, style: actual.StyleSheet.flatten(style), ref: (node: any) => {
      if (node) {
        node.__onLayout = onLayout;
        node.__onScroll = onScroll;
        node.__gesture = __gesture;
        node.scrollTo ??= jest.fn();
      }
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    } }, children));
  View.displayName = "StaffTestView";
  return { ...actual, View, ScrollView: View,
    PanResponder: { create: (config: any) => ({ panHandlers: { __gesture: config } }) } };
});

const note = (measureIndex: number, extra: Partial<NotationEvent> = {}): NotationEvent => ({
  id: `n${measureIndex}`, kind: "note", startQ: { n: measureIndex * 4, d: 1 }, durationQ: { n: 1, d: 2 },
  measureIndex, hitIds: [`h${measureIndex}`], value: 8, ...extra,
});
const props = (events = Array.from({ length: 125 }, (_, i) => note(i))) => ({
  events, meter: { numerator: 4, denominator: 4 } as const, selected: [] as string[], symbols: [],
  onSelect: jest.fn(), onMovePreview: jest.fn(), onMoveCommit: jest.fn(), onMoveCancel: jest.fn(),
  playheadQ: 0, singleLine: true, followPlayhead: false,
});
const layout = (screen: ReturnType<typeof render>, width = 360) =>
  act(() => (screen.getByTestId("rhythm-staff") as any).__onLayout({ nativeEvent: { layout: { width } } }));
const scroll = (screen: ReturnType<typeof render>, x: number) =>
  act(() => (screen.getByTestId("rhythm-staff-scroll") as any).__onScroll({ nativeEvent: { contentOffset: { x } } }));
const targets = (screen: ReturnType<typeof render>) => screen.container.querySelectorAll('[data-testid^="rhythm-note-target-"]');

test.each([38, 125])("only a viewport and overscan of %i measures create glyphs and targets; old measures remount", (count) => {
  const p = props(Array.from({ length: count }, (_, i) => note(i)));
  const screen = render(<RhythmStaff {...p} />);
  layout(screen);
  expect(targets(screen).length).toBeLessThanOrEqual(5);
  expect(screen.queryByTestId("rhythm-note-target-n0")).not.toBeNull();
  expect(screen.queryByTestId(`rhythm-note-target-n${count - 1}`)).toBeNull();
  scroll(screen, (28 + (count - 2) * 260) * 0.8);
  expect(screen.queryByTestId("rhythm-note-target-n0")).toBeNull();
  expect(screen.queryByTestId(`rhythm-note-target-n${count - 1}`)).not.toBeNull();
  expect(targets(screen).length).toBeLessThanOrEqual(5);
  expect(Number(screen.container.querySelector("svg")!.getAttribute("width"))).toBeLessThan(1500);
  scroll(screen, 0);
  expect(screen.queryByTestId("rhythm-note-target-n0")).not.toBeNull();
});

test("follow uses the new viewport immediately, allows historical exploration, and stopping retains position", () => {
  const p = props(), screen = render(<RhythmStaff {...p} followPlayhead playheadQ={400} />);
  layout(screen);
  expect(screen.queryByTestId("rhythm-note-target-n100")).not.toBeNull();
  scroll(screen, 0);
  expect(screen.queryByTestId("rhythm-note-target-n0")).not.toBeNull();
  screen.rerender(<RhythmStaff {...p} followPlayhead playheadQ={404} />);
  expect(screen.queryByTestId("rhythm-note-target-n101")).not.toBeNull();
  screen.rerender(<RhythmStaff {...p} playheadQ={404} />);
  expect(screen.queryByTestId("rhythm-note-target-n101")).not.toBeNull();
  scroll(screen, 0);
  expect(screen.queryByTestId("rhythm-note-target-n0")).not.toBeNull();
});

test("historical targets keep global event identity and drag time scale despite local SVG origin", () => {
  const p = props(), screen = render(<RhythmStaff {...p} />);
  layout(screen);
  scroll(screen, (28 + 50 * 260) * 0.8);
  let handler = (screen.getByTestId("rhythm-note-target-n50") as any).__gesture;
  act(() => { handler.onPanResponderGrant(); handler.onPanResponderRelease(); });
  expect(p.onSelect).toHaveBeenLastCalledWith(p.events[50]);
  const now = jest.spyOn(Date, "now").mockReturnValue(1000);
  handler = (screen.getByTestId("rhythm-note-target-n50") as any).__gesture;
  act(() => handler.onPanResponderGrant());
  now.mockReturnValue(1400);
  act(() => handler.onPanResponderMove({}, { dx: 44.8, dy: 0 }));
  expect(p.onMovePreview).toHaveBeenLastCalledWith("n50", 201);
  act(() => handler.onPanResponderRelease());
  expect(p.onMoveCommit).toHaveBeenLastCalledWith("n50", 201);
  act(() => { handler.onPanResponderGrant(); handler.onPanResponderTerminate(); });
  expect(p.onMoveCancel).toHaveBeenCalled();
  now.mockRestore();
});

test("ties across window edges are not duplicated; full tuplets and offscreen tie selections survive", () => {
  const events = Array.from({ length: 30 }, (_, i) => note(i, {
    tie: { id: "held", part: i, count: 30 }, midi: [60, 64],
    tuplet: { actual: 3, normal: 2, groupId: "crossing" },
  }));
  const p = { ...props(events), selected: ["n0"] }, screen = render(<RhythmStaff {...p} />);
  layout(screen);
  scroll(screen, (28 + 15 * 260) * 0.8);
  const bracket = screen.getByTestId("rhythm-tuplet-bracket-n15");
  expect(bracket.textContent).toContain("3:2 ‹ ›");
  expect(screen.getAllByTestId("tie-held-14-0")).toHaveLength(1);
  // Both entering and leaving arcs must exist even if their far endpoint is culled.
  const renderedIds = [...targets(screen)].map((node) => Number(node.getAttribute("data-testid")!.replace("rhythm-note-target-n", "")));
  const first = Math.min(...renderedIds), last = Math.max(...renderedIds);
  expect(screen.getByTestId(`tie-held-${first - 1}-0`)).toBeTruthy();
  expect(screen.getByTestId(`tie-held-${last}-0`)).toBeTruthy();
  expect(screen.getByTestId("rhythm-glyph-note-n15").querySelector("circle")).not.toBeNull();
  expect(screen.queryByTestId("rhythm-glyph-note-n0")).toBeNull();
});

test("dense widths, sparse measures, resize, removal and wrapped review stay correct", () => {
  const events = [note(0), note(0, { id: "dense", startQ: { n: 1, d: 16 } }), note(80)];
  const indexed = indexStaffEvents(events), geometry = layoutStaffMeasures(indexed.byMeasure, 81, 4, 81);
  expect(geometry.widths[0]).toBe(1472);
  expect(geometry.starts[80]).toBe(28 + 1472 + 79 * 260);
  expect(staffWindow(geometry.starts, geometry.widths, geometry.starts[80] * 0.8, 360).last).toBe(80);
  const p = props(events), screen = render(<RhythmStaff {...p} />);
  layout(screen, 900);
  scroll(screen, geometry.starts[80] * 0.8);
  expect(screen.queryByTestId("rhythm-note-target-n80")).not.toBeNull();
  screen.rerender(<RhythmStaff {...p} events={[note(0)]} />);
  expect(screen.queryByTestId("rhythm-note-target-n0")).not.toBeNull();
  screen.rerender(<RhythmStaff {...p} singleLine={false} />);
  expect(targets(screen)).toHaveLength(3);
  expect(screen.container.querySelector("svg")!.getAttribute("height")).toBe(String(41 * 118 * 0.8));
});

test("empty notation still has a staff and the playhead can extend a single line", () => {
  const p = props([]), screen = render(<RhythmStaff {...p} />);
  layout(screen);
  expect(targets(screen)).toHaveLength(0);
  screen.rerender(<RhythmStaff {...p} followPlayhead playheadQ={4000} />);
  expect(Number(screen.container.querySelector("svg")!.getAttribute("width"))).toBeLessThan(1500);
});
