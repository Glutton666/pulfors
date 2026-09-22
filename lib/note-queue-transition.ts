export interface ScheduleNoteQueueAdvanceOptions {
  expectedEpoch: number;
  getCurrentEpoch: () => number;
  advance: () => void;
  schedule?: (callback: () => void) => void;
}

export function scheduleOwnedNoteQueueAdvance({
  expectedEpoch,
  getCurrentEpoch,
  advance,
  schedule = (callback) => setTimeout(callback, 0),
}: ScheduleNoteQueueAdvanceOptions): void {
  schedule(() => {
    if (expectedEpoch !== getCurrentEpoch()) return;
    advance();
  });
}