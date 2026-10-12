package expo.modules.notetts

import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Finalized file is authoritative; engines need not supply PCM callback stats. */
internal object NoteTtsWav {
  fun duration(file: File): Double = try {
    if (file.length() !in 45L..(16L * 1024 * 1024)) 0.0 else duration(file.readBytes())
  } catch (_: Exception) { 0.0 }

  private fun duration(bytes: ByteArray): Double {
    if (bytes.size < 44) return 0.0
    fun tag(off: Int) = String(bytes, off, 4, Charsets.US_ASCII)
    val b = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    if (tag(0) != "RIFF" || tag(8) != "WAVE") return 0.0
    val declared = b.getInt(4).toLong() + 8
    if (declared !in 44L..bytes.size.toLong()) return 0.0
    val limit = declared.toInt()
    var off = 12
    var fmt = -1
    var dataSize = -1
    while (off + 8 <= limit) {
      val size = b.getInt(off + 4)
      if (size < 0 || off.toLong() + 8 + size > limit) return 0.0
      when (tag(off)) {
        "fmt " -> { if (size < 16 || fmt != -1) return 0.0; fmt = off + 8 }
        "data" -> { if (dataSize != -1) return 0.0; dataSize = size }
      }
      off += 8 + size + size % 2
    }
    if (fmt < 0 || dataSize <= 0) return 0.0
    val format = b.getShort(fmt).toInt() and 0xffff
    val channels = b.getShort(fmt + 2).toInt() and 0xffff
    val rate = b.getInt(fmt + 4)
    val bits = b.getShort(fmt + 14).toInt() and 0xffff
    if (channels !in 1..2 || rate !in 8000..192000 ||
        !((format == 1 && bits in listOf(8, 16, 24, 32)) || (format == 3 && bits == 32))) return 0.0
    val frameBytes = channels * bits / 8
    if (b.getShort(fmt + 12).toInt() != frameBytes || dataSize % frameBytes != 0) return 0.0
    return dataSize.toDouble() / frameBytes / rate
  }
}
