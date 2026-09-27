package expo.modules.sparsemetronome

import java.io.File
import java.io.RandomAccessFile

/** Validates the exact PCM WAV format used by SparseClipDescriptor. */
internal object PcmWavInfo {
  data class Info(
    val sampleRate: Int,
    val channels: Int,
    val frames: Long
  )

  fun read(file: File, expectedSampleRate: Int, expectedFrames: Long): Info {
    RandomAccessFile(file, "r").use { input ->
      if (input.length() < 44L || readFourCc(input) != "RIFF") {
        throw IllegalArgumentException("Clip ${file.name} is not a RIFF/WAVE file.")
      }
      val riffSize = readUnsignedInt(input)
      if (readFourCc(input) != "WAVE" || riffSize + 8L > input.length()) {
        throw IllegalArgumentException("Clip ${file.name} has an invalid RIFF/WAVE header.")
      }

      var format: Int? = null
      var channels: Int? = null
      var sampleRate: Long? = null
      var blockAlign: Int? = null
      var bitsPerSample: Int? = null
      var dataSize: Long? = null

      while (input.filePointer + 8L <= input.length()) {
        val chunkId = readFourCc(input)
        val chunkSize = readUnsignedInt(input)
        val chunkStart = input.filePointer
        val chunkEnd = chunkStart + chunkSize
        if (chunkEnd > input.length()) {
          throw IllegalArgumentException("Clip ${file.name} contains a truncated WAV chunk.")
        }
        when (chunkId) {
          "fmt " -> {
            if (chunkSize < 16L) {
              throw IllegalArgumentException("Clip ${file.name} has a truncated PCM format chunk.")
            }
            format = readUnsignedShort(input)
            channels = readUnsignedShort(input)
            sampleRate = readUnsignedInt(input)
            readUnsignedInt(input) // Byte rate is redundant with block alignment.
            blockAlign = readUnsignedShort(input)
            bitsPerSample = readUnsignedShort(input)
          }
          "data" -> dataSize = chunkSize
        }
        input.seek(chunkEnd + (chunkSize and 1L))
      }

      val parsedChannels = channels
        ?: throw IllegalArgumentException("Clip ${file.name} is missing its WAV format chunk.")
      val parsedRate = sampleRate
        ?: throw IllegalArgumentException("Clip ${file.name} is missing its WAV sample rate.")
      val parsedBlockAlign = blockAlign
        ?: throw IllegalArgumentException("Clip ${file.name} is missing its WAV block alignment.")
      val parsedBits = bitsPerSample
        ?: throw IllegalArgumentException("Clip ${file.name} is missing its WAV sample width.")
      val pcmBytes = dataSize
        ?: throw IllegalArgumentException("Clip ${file.name} is missing its WAV audio data.")

      if (format != 1 || parsedChannels !in 1..2 || parsedRate != expectedSampleRate.toLong() ||
        parsedBits != 16 || parsedBlockAlign != parsedChannels * 2 ||
        pcmBytes % parsedBlockAlign != 0L
      ) {
        throw IllegalArgumentException(
          "Clip ${file.name} must be mono or stereo 16-bit integer PCM WAV at $expectedSampleRate Hz."
        )
      }
      val frames = pcmBytes / parsedBlockAlign
      if (frames != expectedFrames) {
        throw IllegalArgumentException(
          "Clip ${file.name} contains $frames PCM frames but its descriptor declares $expectedFrames."
        )
      }
      return Info(parsedRate.toInt(), parsedChannels, frames)
    }
  }

  private fun readFourCc(input: RandomAccessFile): String {
    val bytes = ByteArray(4)
    input.readFully(bytes)
    return String(bytes, Charsets.US_ASCII)
  }

  private fun readUnsignedShort(input: RandomAccessFile): Int {
    return input.readUnsignedByte() or (input.readUnsignedByte() shl 8)
  }

  private fun readUnsignedInt(input: RandomAccessFile): Long {
    return input.readUnsignedByte().toLong() or
      (input.readUnsignedByte().toLong() shl 8) or
      (input.readUnsignedByte().toLong() shl 16) or
      (input.readUnsignedByte().toLong() shl 24)
  }
}