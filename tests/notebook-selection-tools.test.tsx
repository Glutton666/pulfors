/** @jest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NotebookSelectionTools } from "../components/lab-score/notebook/NotebookSelectionTools";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
afterEach(cleanup);
const props = () => ({
  ko: true, tool: "select" as const, selectionCount: 0, selectionUnit: "object" as const,
  onTool: jest.fn(), onSelectionUnit: jest.fn(), onEditSelection: jest.fn(),
  onClearSelection: jest.fn(), onSaveClipboard: jest.fn(), onDeleteSelection: jest.fn(),
  onResizeSelection: jest.fn(), clipboard: [], onPaste: jest.fn(),
});
test("selection scope is always available; object actions appear only after selection", () => {
  const p = props(), view = render(<NotebookSelectionTools {...p} />);
  expect(view.queryByTestId("notebook-edit-selection")).toBeNull();
  expect(view.queryByTestId("notebook-clipboard-save")).toBeNull();
  for (const unit of ["object", "measure", "row"]) fireEvent.click(view.getByTestId(`notebook-select-${unit}`));
  expect(p.onSelectionUnit.mock.calls.map(([unit]) => unit)).toEqual(["object", "measure", "row"]);
  view.rerender(<NotebookSelectionTools {...p} selectionCount={3} />);
  fireEvent.click(view.getByTestId("notebook-edit-selection"));
  fireEvent.click(view.getByTestId("notebook-clipboard-save"));
  fireEvent.click(view.getByText("삭제"));
  fireEvent.click(view.getByText("해제"));
  expect(p.onEditSelection).toHaveBeenCalledTimes(1);
  expect(p.onSaveClipboard).toHaveBeenCalledTimes(1);
  expect(p.onDeleteSelection).toHaveBeenCalledTimes(1);
  expect(p.onClearSelection).toHaveBeenCalledTimes(1);
  view.rerender(<NotebookSelectionTools {...p} />);
  expect(view.queryByTestId("notebook-edit-selection")).toBeNull();
});
test("clipboard retains bundles and invokes the original paste callback", () => {
  const p = props(), view = render(<NotebookSelectionTools {...p} clipboard={[{ id: "saved", label: "연습 묶음", count: 4 }]} />);
  fireEvent.click(view.getByTestId("notebook-clipboard-tab"));
  expect(view.queryByTestId("notebook-select-object")).toBeNull();
  fireEvent.click(view.getByTestId("notebook-paste-saved"));
  expect(p.onPaste).toHaveBeenCalledWith("saved");
  fireEvent.click(view.getByTestId("notebook-selection-tab"));
  expect(view.getByTestId("notebook-select-object")).toBeTruthy();
});
