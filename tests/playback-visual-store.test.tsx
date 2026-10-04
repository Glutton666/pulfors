/** @jest-environment jsdom */
import React from "react";
import { act, render } from "@testing-library/react";
import { createPlaybackVisualStore } from "@/lib/playback-visual-store";
import { PlaybackVisualContext, usePlaybackVisual } from "@/contexts/PlaybackVisualContext";
import type { PlaybackVisual } from "@/lib/playback-visual";

const visual = (pulseId: string, subBeat: number): PlaybackVisual => ({
  pulseId, subBeat, beat: 0, type: "normal", ageMs: 0, intervalMs: 500 / 9,
});

describe("localized playback visual delivery", () => {
  it("updates the display without rendering its screen parent and drops stale intermediate slots", () => {
    const store = createPlaybackVisualStore();
    let parentRenders = 0;
    let displayRenders = 0;
    function Display({ enabled }: { enabled: boolean }) {
      const tick = usePlaybackVisual(enabled);
      displayRenders++;
      return <div data-testid="position">{tick?.subBeat ?? -1}</div>;
    }
    function Screen({ enabled = true }: { enabled?: boolean }) {
      parentRenders++;
      return <PlaybackVisualContext.Provider value={store}><Display enabled={enabled} /></PlaybackVisualContext.Provider>;
    }
    const view = render(<Screen />);
    const parentCount = parentRenders;
    act(() => { store.publish(visual("1", 1)); });
    expect(view.getByTestId("position").textContent).toBe("1");
    expect(parentRenders).toBe(parentCount);
    act(() => { store.publish(visual("2", 2)); store.publish(visual("7", 7)); });
    expect(view.getByTestId("position").textContent).toBe("7");
    expect(parentRenders).toBe(parentCount);
    const displayCount = displayRenders;
    const snapshot = store.getSnapshot();
    act(() => { store.publish({ ...visual("7", 7), ageMs: 15 }); });
    expect(store.getSnapshot()).toBe(snapshot);
    expect(displayRenders).toBe(displayCount);
    act(() => { store.publish(null); });
    expect(view.getByTestId("position").textContent).toBe("-1");
    view.rerender(<Screen enabled={false} />);
    const disabledCount = displayRenders;
    act(() => { store.publish(visual("new-start", 0)); });
    expect(displayRenders).toBe(disabledCount);
    expect(view.getByTestId("position").textContent).toBe("-1");
    view.unmount();
  });

  it("does not subscribe standalone/stopped components", () => {
    function Standalone() {
      const tick = usePlaybackVisual(true);
      return <div data-testid="position">{tick?.subBeat ?? 5}</div>;
    }
    const view = render(<Standalone />);
    expect(view.getByTestId("position").textContent).toBe("5");
    view.unmount();
  });
});