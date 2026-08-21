/**
 * @jest-environment jsdom
 */

import React from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { ExportEntryModal } from "@/components/ExportEntryModal";

const mockExportPracticeEntry = jest.fn(
  (_entry: unknown, _options: { signal: AbortSignal }) => new Promise<never>(() => {}),
);
const mockDiscardExportedUri = jest.fn();

jest.mock("@/components/AnimatedModal", () => ({
  AnimatedSlideModal: ({ visible, children }: any) => visible ? <div>{children}</div> : null,
}));
jest.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#000", surface: "#111", text: "#fff", textSecondary: "#aaa",
      textTertiary: "#666", accent: "#3af", border: "#333", danger: "#f44",
    },
  }),
}));
jest.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ t: (_ns: string, key: string) => key }),
}));
jest.mock("@/lib/scale", () => ({
  useScale: () => ({ ms: (v: number) => v }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/lib/audio-export", () => ({
  exportPracticeEntry: (...args: any[]) => mockExportPracticeEntry(args[0], args[1]),
  shareExportedFile: jest.fn(),
  revokeExportedUri: jest.fn(),
  discardExportedUri: (...args: any[]) => mockDiscardExportedUri(args[0]),
  clampRepeats: (n: number) => n,
  clampFadeOutSec: (n: number) => n,
  EXPORT_ABORTED: "EXPORT_ABORTED",
}));

describe("ExportEntryModal cancellation", () => {
  beforeEach(() => {
    mockExportPracticeEntry.mockReset();
    mockExportPracticeEntry.mockImplementation(
      (_entry: unknown, _options: { signal: AbortSignal }) => new Promise<never>(() => {}),
    );
    mockDiscardExportedUri.mockClear();
  });

  it("aborts an in-progress export and closes immediately from the Cancel button", () => {
    const onClose = jest.fn();
    const entry = { id: "entry-1", label: "Long practice", mode: "bar" } as any;
    const { getByTestId } = render(
      <ExportEntryModal visible entry={entry} onClose={onClose} />,
    );

    fireEvent.click(getByTestId("export-start-btn"));
    const call = mockExportPracticeEntry.mock.calls[0];
    expect(call).toBeDefined();
    const signal = call![1].signal;
    expect(signal.aborted).toBe(false);

    fireEvent.click(getByTestId("export-cancel-btn"));
    expect(signal.aborted).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("discards a late result from a cancelled export after a new export starts", async () => {
    let resolveFirst: ((result: any) => void) | undefined;
    mockExportPracticeEntry
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise(() => {}));
    const entry = { id: "entry-1", label: "Long practice", mode: "bar" } as any;
    const onClose = jest.fn();
    const view = render(<ExportEntryModal visible entry={entry} onClose={onClose} />);

    fireEvent.click(view.getByTestId("export-start-btn"));
    fireEvent.click(view.getByTestId("export-cancel-btn"));
    view.rerender(<ExportEntryModal visible entry={entry} onClose={onClose} />);
    fireEvent.click(view.getByTestId("export-start-btn"));

    await act(async () => {
      resolveFirst?.({ uri: "file:///cache/cancelled.wav", filename: "cancelled.wav", format: "wav" });
      await Promise.resolve();
    });

    expect(mockDiscardExportedUri).toHaveBeenCalledWith("file:///cache/cancelled.wav");
  });
});