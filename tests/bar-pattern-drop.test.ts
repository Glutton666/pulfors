/** @jest-environment jsdom */

import {
  getBarRowDropTarget,
  getBarRowDropTargetFromElement,
} from "@/lib/bar-pattern-drop";

describe("bar drawer pattern drop targeting", () => {
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