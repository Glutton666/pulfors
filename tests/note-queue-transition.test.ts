import { scheduleOwnedNoteQueueAdvance } from "@/lib/note-queue-transition";

describe("Note queue transition ownership", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("cancels a pending automatic advance after a manual transition takes ownership", () => {
    let epoch = 7;
    const advance = jest.fn();

    scheduleOwnedNoteQueueAdvance({
      expectedEpoch: epoch,
      getCurrentEpoch: () => epoch,
      advance,
    });

    epoch += 1;
    jest.runOnlyPendingTimers();

    expect(advance).not.toHaveBeenCalled();
  });

  it("advances exactly once when no competing transition replaces it", () => {
    const epoch = 3;
    const advance = jest.fn();

    scheduleOwnedNoteQueueAdvance({
      expectedEpoch: epoch,
      getCurrentEpoch: () => epoch,
      advance,
    });

    jest.runOnlyPendingTimers();

    expect(advance).toHaveBeenCalledTimes(1);
  });
});