/** @jest-environment jsdom */

import {
  getPatternDropAction,
  getBarRowDropTarget,
  getBarRowDropTargetFromElement,
} from "@/lib/bar-pattern-drop";

describe("bar drawer pattern drop targeting", () => {
  it("adds the configured pattern as a new bar when dropped onto the Bar list", () => {
    expect(getPatternDropAction("bar", 0, 4)).toBe("add-bar");
    expect(getPatternDropAction("bar", 7, 2)).toBe("add-bar");
    expect(getPatternDropAction("bar", null, 4)).toBe("none");
  });

  it("keeps beat-mode pattern drops as edits to existing beats", () => {
    expect(getPatternDropAction("beat", -1, 4)).toBe("apply-all");
    expect(getPatternDropAction("beat", 2, 4)).toBe("apply-one");
    expect(getPatternDropAction("beat", 2, 0)).toBe("clear-one");
  });

  it("targets the first visible row without the removed center-padding offset", () => {
    expect(getBarRowDropTarget(120, { y: 100, height: 220 }, 0, 44, 8)).toBe(0);
    expect(getBarRowDropTarget(150, { y: 100, height: 220 }, 0, 44, 8)).toBe(1);
  });

  it("includes the list scroll offset when targeting native rows", () => {
    expect(getBarRowDropTarget(110, { y: 100, height: 220 }, 88, 44, 8)).toBe(2);
    expect(getBarRowDropTarget(154, { y: 100, height: 220 }, 88, 44, 8)).toBe(3);
  });

  it("keeps the apply-all zone directly above the list and rejects outside drops", () => {
    expect(getBarRowDropTarget(75, { y: 100, height: 220 }, 0, 44, 8)).toBe(-1);
    expect(getBarRowDropTarget(20, { y: 100, height: 220 }, 0, 44, 8)).toBeNull();
    expect(getBarRowDropTarget(321, { y: 100, height: 220 }, 0, 44, 8)).toBeNull();
  });

  it("accepts empty list space so the first Bar can be dropped", () => {
    expect(getBarRowDropTarget(180, { y: 100, height: 220 }, 0, 44, 0)).toBe(-1);
  });

  it("accepts unused list space below the final rendered row", () => {
    expect(getBarRowDropTarget(260, { y: 100, height: 220 }, 0, 44, 2)).toBe(-1);
  });

  it("uses the actual row under a web pointer", () => {
    document.body.innerHTML = `
      <div data-testid="bar-row-3"><span id="cell">cell</span></div>
      <div data-testid="bar-row-12"><span id="outside">outside</span></div>
    `;

    expect(getBarRowDropTargetFromElement(document.getElementById("cell"), 8)).toBe(3);
    expect(getBarRowDropTargetFromElement(document.getElementById("outside"), 8)).toBeNull();
    expect(getBarRowDropTargetFromElement(document.body, 8)).toBeNull();
  });
});