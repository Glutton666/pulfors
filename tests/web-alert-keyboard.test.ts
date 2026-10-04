/** @jest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { Platform } from "react-native";
import { WebAlertHost } from "../components/WebAlertHost";
import { Alert, getWebAlert, resolveWebAlert } from "../lib/alert";

jest.mock("../contexts/ThemeContext", () => ({
  useTheme: () => ({ colors: {} }),
}));

describe("web alert keyboard boundary", () => {
  const originalOS = Platform.OS;
  beforeEach(() => { (Platform as { OS: string }).OS = "web"; });
  afterEach(() => {
    while (getWebAlert()) resolveWebAlert(getWebAlert()!.id);
    (Platform as { OS: string }).OS = originalOS;
  });

  it("swallows Escape release after dismissal, leaving the underlying modal open", () => {
    const parentKeyup = jest.fn();
    const cancel = jest.fn();
    const confirm = jest.fn();
    document.addEventListener("keyup", parentKeyup);
    const host = renderHook(() => WebAlertHost());
    try {
      act(() => Alert.alert("Delete?", "", [
        { text: "Cancel", style: "cancel", onPress: cancel },
        { text: "Delete", style: "destructive", onPress: confirm },
      ]));
      act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
      expect(getWebAlert()).toBeNull();
      expect(cancel).toHaveBeenCalledTimes(1);
      act(() => document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true })));
      expect(parentKeyup).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
      // A separate Escape belongs to the parent, not the now-closed alert.
      act(() => document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true })));
      expect(parentKeyup).toHaveBeenCalledTimes(1);
    } finally {
      host.unmount();
      document.removeEventListener("keyup", parentKeyup);
    }
  });

  it("does not install web keyboard interception on native", () => {
    (Platform as { OS: string }).OS = "ios";
    const parent = jest.fn();
    document.addEventListener("keyup", parent);
    const host = renderHook(() => WebAlertHost());
    try {
      document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
      expect(parent).toHaveBeenCalledTimes(1);
    } finally {
      host.unmount();
      document.removeEventListener("keyup", parent);
    }
  });
});