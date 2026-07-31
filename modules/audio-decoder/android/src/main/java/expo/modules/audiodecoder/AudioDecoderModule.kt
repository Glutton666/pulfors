package expo.modules.audiodecoder

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Decodes any audio file MediaCodec can handle (MP3, M4A/AAC, etc.) into a
 * 16-bit PCM WAV file, using the OS's own decoder — no third-party codec
 * library involved. MediaCodec audio decoders on Android always output raw
 * PCM as 16-bit signed little-endian samples unless a different
 * KEY_PCM_ENCODING is explicitly requested, so the WAV header below is
 * always correct for the data actually produced.
 */
class AudioDecoderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioDecoder")

    AsyncFunction("decodeToWavAsync") { sourceUri: String, destUri: String ->
      decode(sourceUri, destUri)
    }
  }

  private fun decode(sourceUri: String, destUri: String): String {
    val extractor = MediaExtractor()
    setDataSource(extractor, sourceUri)

    var trackIndex = -1
    var format: MediaFormat? = null
    for (i in 0 until extractor.trackCount) {
      val f = extractor.getTrackFormat(i)
      val mime = f.getString(MediaFormat.KEY_MIME) ?: continue
      if (mime.startsWith("audio/")) {
        trackIndex = i
        format = f
        break
      }
    }
    if (trackIndex < 0 || format == null) {
      extractor.release()
      throw IllegalStateException("No audio track found in $sourceUri")
    }
    extractor.selectTrack(trackIndex)

    val mime = format.getString(MediaFormat.KEY_MIME)!!
    var sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
    var channelCount = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)

    val codec = MediaCodec.createDecoderByType(mime)
    codec.configure(format, null, null, 0)
    codec.start()

    val destFile = File(uriToPath(destUri))
    destFile.parentFile?.mkdirs()
    if (destFile.exists()) destFile.delete()
    val raf = RandomAccessFile(destFile, "rw")
    raf.setLength(0)
    // Reserve the 44-byte WAV header; filled in once the total PCM size is known.
    raf.seek(44)

    var totalPcmBytes = 0L
    val bufferInfo = MediaCodec.BufferInfo()
    var sawInputEOS = false
    var sawOutputEOS = false
    val timeoutUs = 10_000L

    try {
      while (!sawOutputEOS) {
        if (!sawInputEOS) {
          val inputIndex = codec.dequeueInputBuffer(timeoutUs)
          if (inputIndex >= 0) {
            val inputBuffer = codec.getInputBuffer(inputIndex)!!
            val sampleSize = extractor.readSampleData(inputBuffer, 0)
            if (sampleSize < 0) {
              codec.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              sawInputEOS = true
            } else {
              val presentationTimeUs = extractor.sampleTime
              codec.queueInputBuffer(inputIndex, 0, sampleSize, presentationTimeUs, 0)
              extractor.advance()
            }
          }
        }

        var outputIndex = codec.dequeueOutputBuffer(bufferInfo, timeoutUs)
        while (outputIndex != MediaCodec.INFO_TRY_AGAIN_LATER) {
          if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
            val newFormat = codec.outputFormat
            sampleRate = newFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            channelCount = newFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
          } else if (outputIndex >= 0) {
            if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
              sawOutputEOS = true
            }
            if (bufferInfo.size > 0) {
              val outputBuffer = codec.getOutputBuffer(outputIndex)!!
              outputBuffer.position(bufferInfo.offset)
              outputBuffer.limit(bufferInfo.offset + bufferInfo.size)
              val chunk = ByteArray(bufferInfo.size)
              outputBuffer.get(chunk)
              raf.write(chunk)
              totalPcmBytes += chunk.size
            }
            codec.releaseOutputBuffer(outputIndex, false)
          }
          if (sawOutputEOS) break
          outputIndex = codec.dequeueOutputBuffer(bufferInfo, 0)
        }
      }
    } finally {
      codec.stop()
      codec.release()
      extractor.release()
    }

    writeWavHeader(raf, totalPcmBytes, sampleRate, channelCount, bitsPerSample = 16)
    raf.close()

    return destUri
  }

  private fun writeWavHeader(
    raf: RandomAccessFile,
    pcmBytes: Long,
    sampleRate: Int,
    channels: Int,
    bitsPerSample: Int,
  ) {
    val byteRate = sampleRate * channels * bitsPerSample / 8
    val blockAlign = channels * bitsPerSample / 8
    val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
    header.put("RIFF".toByteArray(Charsets.US_ASCII))
    header.putInt((36 + pcmBytes).toInt())
    header.put("WAVE".toByteArray(Charsets.US_ASCII))
    header.put("fmt ".toByteArray(Charsets.US_ASCII))
    header.putInt(16)
    header.putShort(1) // PCM
    header.putShort(channels.toShort())
    header.putInt(sampleRate)
    header.putInt(byteRate)
    header.putShort(blockAlign.toShort())
    header.putShort(bitsPerSample.toShort())
    header.put("data".toByteArray(Charsets.US_ASCII))
    header.putInt(pcmBytes.toInt())

    raf.seek(0)
    raf.write(header.array())
  }

  /** MediaExtractor.setDataSource() needs a plain path for file:// URIs, but a
   *  Context-backed Uri lookup for content:// URIs (e.g. if a future caller
   *  passes a raw picker URI instead of the app's copied cache-directory file). */
  private fun setDataSource(extractor: MediaExtractor, uri: String) {
    if (uri.startsWith("content://")) {
      val context = appContext.reactContext
        ?: throw IllegalStateException("No Android context available to resolve $uri")
      extractor.setDataSource(context, Uri.parse(uri), null)
    } else {
      extractor.setDataSource(uriToPath(uri))
    }
  }

  private fun uriToPath(uri: String): String =
    if (uri.startsWith("file://")) uri.removePrefix("file://") else uri
}
