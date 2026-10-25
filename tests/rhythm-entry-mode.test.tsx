/** @jest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RHYTHM_ENTRY_MODE_KEY, useRhythmEntryMode } from "../hooks/useRhythmEntryMode";

describe("Rhythm entry preference", () => {
  beforeEach(async () => { await AsyncStorage.clear(); });
  afterEach(() => jest.restoreAllMocks());

  test("defaults to capture and restores a saved direct-entry selection before ready", async () => {
    const first = renderHook(useRhythmEntryMode);
    expect(first.result.current.entryModeReady).toBe(false);
    await waitFor(() => expect(first.result.current.entryModeReady).toBe(true));
    expect(first.result.current.entryMode).toBe("capture");
    act(() => first.result.current.chooseEntryMode("notation"));
    await waitFor(() => expect(AsyncStorage.getItem(RHYTHM_ENTRY_MODE_KEY)).resolves.toBe("notation"));
    first.unmount();
    const next = renderHook(useRhythmEntryMode);
    await waitFor(() => expect(next.result.current.entryModeReady).toBe(true));
    expect(next.result.current.entryMode).toBe("notation");
  });

  test("a delayed restore cannot overwrite a selection already made by the user", async () => {
    let complete!: (value: string | null) => void;
    jest.spyOn(AsyncStorage, "getItem").mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const { result } = renderHook(useRhythmEntryMode);
    await act(async () => { await Promise.resolve(); });
    act(() => result.current.chooseEntryMode("capture"));
    await act(async () => { complete("notation"); });
    expect(result.current.entryMode).toBe("capture");
    expect(result.current.entryModeReady).toBe(true);
  });

  test("rapid writes retain the latest choice even across workspace visits", async () => {
    let complete!: () => void;
    const original = AsyncStorage.setItem.bind(AsyncStorage);
    jest.spyOn(AsyncStorage, "setItem").mockImplementationOnce((key, value) => new Promise<void>((resolve) => {
      complete = () => { void original(key, value).then(resolve); };
    }));
    const first = renderHook(useRhythmEntryMode);
    await waitFor(() => expect(first.result.current.entryModeReady).toBe(true));
    act(() => first.result.current.chooseEntryMode("notation"));
    await act(async () => { await Promise.resolve(); });
    act(() => first.result.current.chooseEntryMode("capture"));
    first.unmount();
    const second = renderHook(useRhythmEntryMode);
    await act(async () => { complete(); });
    await waitFor(() => expect(second.result.current.entryModeReady).toBe(true));
    expect(second.result.current.entryMode).toBe("capture");
    expect(await AsyncStorage.getItem(RHYTHM_ENTRY_MODE_KEY)).toBe("capture");
  });

  test("failed writes are visible and can be retried without changing the document format", async () => {
    jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("full"));
    const { result } = renderHook(useRhythmEntryMode);
    await waitFor(() => expect(result.current.entryModeReady).toBe(true));
    act(() => result.current.chooseEntryMode("notation"));
    await waitFor(() => expect(result.current.entryModeError).toBe(true));
    expect(result.current.entryMode).toBe("notation");
    act(() => result.current.chooseEntryMode("notation"));
    await waitFor(() => expect(AsyncStorage.getItem(RHYTHM_ENTRY_MODE_KEY)).resolves.toBe("notation"));
    expect(result.current.entryModeError).toBe(false);
  });
});
