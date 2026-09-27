package expo.modules.sparsemetronome

import org.junit.Assert.assertEquals
import org.junit.Test

class SparseClockAnchorTest {
  @Test
  fun futureStartIsScheduledAheadAndWallClockUsesSameAnchor() {
    val anchor = SparseClockAnchor.futureStart(
      snapshotElapsedRealtimeNanos = 8_000_000_000L,
      snapshotWallClockTimeMillis = 1_700_000_000_000L,
      leadNanos = 120_000_000L
    )

    assertEquals(8_120_000_000L, anchor.elapsedRealtimeNanos)
    assertEquals(1_700_000_000_120L, anchor.wallClockTimeMillis)
  }

  @Test
  fun replacementBoundaryCanBeMappedBackToTheSameWallClock() {
    val anchor = SparseClockAnchor.atElapsedTime(
      targetElapsedRealtimeNanos = 9_500_000_000L,
      snapshotElapsedRealtimeNanos = 8_000_000_000L,
      snapshotWallClockTimeMillis = 1_700_000_000_000L
    )

    assertEquals(9_500_000_000L, anchor.elapsedRealtimeNanos)
    assertEquals(1_700_000_001_500L, anchor.wallClockTimeMillis)
  }

  @Test
  fun lateInitialEventIsNotDroppedButLaterOverdueEventsStillAre() {
    assertEquals(
      false,
      SparseSchedulerPolicy.shouldSkipLateClip(
        firstEventPending = true,
        latenessNanos = 2_000_000_000L,
        maxLateNanos = 50_000_000L
      )
    )
    assertEquals(
      true,
      SparseSchedulerPolicy.shouldSkipLateClip(
        firstEventPending = false,
        latenessNanos = 51_000_000L,
        maxLateNanos = 50_000_000L
      )
    )
  }
}