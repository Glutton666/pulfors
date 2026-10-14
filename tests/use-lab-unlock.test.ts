/** @jest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { useLabUnlock } from "@/hooks/useLabUnlock";
import { loadLabUnlocked } from "@/lib/practice-room";

jest.mock("@/lib/practice-room", () => ({ loadLabUnlocked: jest.fn() }));
const load = loadLabUnlocked as jest.MockedFunction<typeof loadLabUnlocked>;
beforeEach(() => load.mockReset());

it.each([false, true])("restores the stored Lab gate (%s) into UI and audio state on mount", async stored => {
  load.mockResolvedValue(stored);
  const { result, unmount } = renderHook(useLabUnlock);
  expect(result.current.labUnlocked).toBe(false);
  expect(result.current.labUnlockedRef.current).toBe(false);
  await act(async () => {});
  expect(result.current.labUnlocked).toBe(stored);
  expect(result.current.labUnlockedRef.current).toBe(stored);
  unmount();
});

it("unlocks synchronously for audio and ignores an older locked startup read", async () => {
  let finish!: (value: boolean) => void;
  load.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const { result, unmount } = renderHook(useLabUnlock);
  act(() => {
    result.current.unlockLab();
    expect(result.current.labUnlockedRef.current).toBe(true);
  });
  expect(result.current.labUnlocked).toBe(true);
  await act(async () => { finish(false); });
  expect(result.current.labUnlocked).toBe(true);
  expect(result.current.labUnlockedRef.current).toBe(true);
  unmount();
});

it("refreshes successful onboarding registration into UI and audio without remounting", async () => {
  load.mockResolvedValue(false);
  const { result, unmount } = renderHook(useLabUnlock);
  await act(async () => {});
  expect(result.current.labUnlocked).toBe(false);
  // The successful onboarding add has persisted its Lab room/unlock.
  load.mockResolvedValue(true);
  await act(async () => { await result.current.refreshLabUnlock(); });
  expect(result.current.labUnlocked).toBe(true);
  expect(result.current.labUnlockedRef.current).toBe(true);
  unmount();
});

it("relocks UI and audio after a full reset without remounting", async () => {
  load.mockResolvedValue(true);
  const { result, unmount } = renderHook(useLabUnlock);
  await act(async () => {});
  expect(result.current.labUnlocked).toBe(true);
  act(() => {
    result.current.resetLabUnlock();
    expect(result.current.labUnlockedRef.current).toBe(false);
  });
  expect(result.current.labUnlocked).toBe(false);
  unmount();
});

it("does not let a pre-reset startup read unlock the reset session again", async () => {
  let finish!: (value: boolean) => void;
  load.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const { result, unmount } = renderHook(useLabUnlock);
  act(() => { result.current.resetLabUnlock(); });
  await act(async () => { finish(true); });
  expect(result.current.labUnlocked).toBe(false);
  expect(result.current.labUnlockedRef.current).toBe(false);
  unmount();
});
