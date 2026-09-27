package expo.modules.sparsemetronome

internal data class SparseClockAnchor(
  val elapsedRealtimeNanos: Long,
  val wallClockTimeMillis: Long
) {
  companion object {
    fun futureStart(
      snapshotElapsedRealtimeNanos: Long,
      snapshotWallClockTimeMillis: Long,
      leadNanos: Long
    ): SparseClockAnchor {
      return atElapsedTime(
        snapshotElapsedRealtimeNanos + leadNanos,
        snapshotElapsedRealtimeNanos,
        snapshotWallClockTimeMillis
      )
    }

    fun atElapsedTime(
      targetElapsedRealtimeNanos: Long,
      snapshotElapsedRealtimeNanos: Long,
      snapshotWallClockTimeMillis: Long
    ): SparseClockAnchor {
      return SparseClockAnchor(
        targetElapsedRealtimeNanos,
        snapshotWallClockTimeMillis +
          (targetElapsedRealtimeNanos - snapshotElapsedRealtimeNanos) / NANOS_PER_MILLISECOND
      )
    }
  }
}

private const val NANOS_PER_MILLISECOND = 1_000_000L

internal object SparseSchedulerPolicy {
  fun shouldSkipLateClip(firstEventPending: Boolean, latenessNanos: Long, maxLateNanos: Long): Boolean {
    return !firstEventPending && latenessNanos > maxLateNanos
  }
}