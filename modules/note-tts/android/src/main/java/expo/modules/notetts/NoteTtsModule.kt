package expo.modules.notetts

import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID

/** File-only synthesis. Never calls speak(), never requests a network voice. */
class NoteTtsModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var engine: TextToSpeech? = null
  private var ready = false
  private var destroyed = false
  private data class Waiting(val promise: Promise, val action: (TextToSpeech) -> Unit, val id: String?)
  private val waiting = mutableListOf<Waiting>()
  /** Completed outputs stay hidden from cleanup until JS claims or discards them. */
  private val unclaimedFiles = mutableSetOf<File>()
  private var initEpoch = 0
  private var initTimeout: Runnable? = null
  private data class Job(
    val id: String, val file: File, val promise: Promise,
    var frames: Long = 0, var sampleRate: Int = 0,
    var channels: Int = 0, var bytesPerSample: Int = 0,
    var bytes: Long = 0, var timeout: Runnable? = null
  )
  private var active: Job? = null

  override fun definition() = ModuleDefinition {
    Name("NoteTts")
    AsyncFunction("getVoices") { promise: Promise ->
      main.post { withEngine(promise) { tts -> promise.resolve(voices(tts).map { voice ->
        // Android has no standard gender property. Do not guess from voice IDs.
        mapOf("id" to voice.name, "name" to voice.name,
          "language" to voice.locale.toLanguageTag(), "gender" to "unknown")
      }) } }
    }
    AsyncFunction("getOfflineKoreanCountVoices") { promise: Promise ->
      main.post { withEngine(promise) { tts ->
        promise.resolve(voices(tts).mapNotNull { voice ->
          val id = voice.name.lowercase()
          // Android's TTS API has no gender field. Recognize only explicit
          // engine-provided male/female voice IDs; never guess by pitch/name.
          val gender = when {
            Regex("(?:^|[#_.-])female(?:[#_.-]|$)").containsMatchIn(id) -> "female"
            Regex("(?:^|[#_.-])male(?:[#_.-]|$)").containsMatchIn(id) -> "male"
            else -> null
          }
          gender?.let { mapOf("id" to voice.name, "name" to voice.name,
            "language" to voice.locale.toLanguageTag(), "gender" to it) }
        })
      } }
    }
    AsyncFunction("generate") { text: String, voiceId: String, requestId: String, promise: Promise ->
      main.post { withEngine(promise, requestId) { tts -> generate(tts, text, voiceId, requestId, promise) } }
    }
    AsyncFunction("claim") { uri: String, promise: Promise ->
      main.post {
        generatedFile(uri)?.let { unclaimedFiles.remove(it.canonicalFile) }
        promise.resolve(null)
      }
    }
    AsyncFunction("cancel") { requestId: String, promise: Promise ->
      main.post {
        if (active?.id == requestId) fail("cancelled", "Speech generation cancelled.")
        waiting.filter { it.id == requestId }.forEach {
          it.promise.reject("cancelled", "Speech generation cancelled before initialization.", null)
        }
        waiting.removeAll { it.id == requestId }
        promise.resolve(null)
      }
    }
    AsyncFunction("discard") { uri: String, promise: Promise ->
      main.post {
        val file = generatedFile(uri)
        if (file != null && active?.file?.canonicalFile != file.canonicalFile) {
          unclaimedFiles.remove(file.canonicalFile)
          file.delete()
        }
        promise.resolve(null)
      }
    }
    AsyncFunction("listFiles") { promise: Promise ->
      main.post {
        try {
          val directory = directory() ?: throw IllegalStateException("Speech directory unavailable.")
          val activeFile = active?.file?.canonicalFile
          val files = directory.listFiles().orEmpty()
            .filter { file ->
              file.isFile &&
                file.name.matches(Regex("[a-f0-9-]{36}\\.wav")) &&
                file.canonicalFile.parentFile == directory.canonicalFile &&
                file.canonicalFile != activeFile &&
                file.canonicalFile !in unclaimedFiles
            }
            .map { Uri.fromFile(it).toString() }
          promise.resolve(files)
        } catch (error: Exception) {
          promise.reject("failed", "Cannot list speech files.", error)
        }
      }
    }
    OnDestroy {
      main.post {
        destroyed = true
        fail("cancelled", "Speech module closed.")
        failInit()
        engine?.shutdown()
        engine = null
        ready = false
      }
    }
  }

  private fun directory(): File? =
    appContext.reactContext?.filesDir?.let { File(it, "tts-samples").also { dir -> dir.mkdirs() } }

  private fun generatedFile(uri: String): File? {
    val directory = directory() ?: return null
    val path = Uri.parse(uri)
    if (path.scheme != "file") return null
    val file = File(path.path ?: "")
    return try {
      file.takeIf {
        it.parentFile?.canonicalFile == directory.canonicalFile &&
          it.name.matches(Regex("[a-f0-9-]{36}\\.wav"))
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun voices(tts: TextToSpeech): List<Voice> =
    (tts.voices ?: emptySet()).filter {
      it.locale.language == "ko" && !it.isNetworkConnectionRequired &&
        !it.features.orEmpty().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)
    }.sortedBy { it.name }

  private fun withEngine(promise: Promise, requestId: String? = null, action: (TextToSpeech) -> Unit) {
    if (destroyed) { promise.reject("unavailable", "Speech module is closed.", null); return }
    val tts = engine
    if (ready && tts != null) { action(tts); return }
    waiting.add(Waiting(promise, action, requestId))
    if (engine != null) return
    val context = appContext.reactContext?.applicationContext
    if (context == null) { failInit(); return }
    val generation = ++initEpoch
    initTimeout = Runnable { ++initEpoch; engine?.shutdown(); engine = null; failInit() }
    main.postDelayed(initTimeout!!, 10_000)
    engine = TextToSpeech(context) { status ->
      main.post {
        if (destroyed || engine == null || generation != initEpoch) return@post
        initTimeout?.let { main.removeCallbacks(it) }
        initTimeout = null
        if (status != TextToSpeech.SUCCESS) {
          engine?.shutdown(); engine = null; failInit(); return@post
        }
        ready = true
        installListener(engine!!)
        val callbacks = waiting.toList()
        waiting.clear()
        callbacks.forEach { it.action(engine!!) }
      }
    }
  }

  private fun failInit() {
    initTimeout?.let { main.removeCallbacks(it) }
    initTimeout = null
    waiting.forEach { it.promise.reject("unavailable", "Install an offline Korean TTS engine/voice in device settings.", null) }
    waiting.clear()
  }

  private fun installListener(tts: TextToSpeech) {
    tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(id: String) {}
      override fun onDone(id: String) { main.post {
        val job = active?.takeIf { it.id == id } ?: return@post
        val duration = NoteTtsWav.duration(job.file)
        if (duration <= 0) {
          fail("invalidAudio", "Speech engine produced an invalid or unsupported WAV file."); return@post
        }
        if (duration > 30 || job.file.length() > 16 * 1024 * 1024) {
          fail("tooLarge", "Invalid or overlong speech output."); return@post
        }
        job.timeout?.let { main.removeCallbacks(it) }
        active = null
        unclaimedFiles.add(job.file.canonicalFile)
        job.promise.resolve(mapOf("uri" to Uri.fromFile(job.file).toString(), "duration" to duration))
      } }
      @Deprecated("Android callback")
      override fun onError(id: String) { main.post { if (active?.id == id) fail("failed", "Speech generation failed.") } }
      override fun onError(id: String, errorCode: Int) { onError(id) }
      override fun onStop(id: String, interrupted: Boolean) { main.post { if (active?.id == id) fail("cancelled", "Speech generation stopped.") } }
      override fun onBeginSynthesis(id: String, sampleRate: Int, audioFormat: Int, channelCount: Int) { main.post {
        active?.takeIf { it.id == id }?.apply {
          this.sampleRate = sampleRate
          channels = channelCount
          bytesPerSample = when (audioFormat) { 2 -> 2; 3 -> 1; 4 -> 4; else -> 0 }
        }
      } }
      override fun onAudioAvailable(id: String, audio: ByteArray) {
        val byteCount = audio.size
        main.post {
          val job = active?.takeIf { it.id == id } ?: return@post
          job.bytes += byteCount
          if (job.channels > 0 && job.bytesPerSample > 0)
            job.frames = job.bytes / (job.channels * job.bytesPerSample)
          if (job.bytes > 16 * 1024 * 1024 ||
              (job.sampleRate > 0 && job.frames > job.sampleRate * 30L))
            fail("tooLarge", "Speech output exceeds 30 seconds.")
        }
      }
    })
  }

  private fun generate(tts: TextToSpeech, text: String, voiceId: String, requestId: String, promise: Promise) {
    if (active != null) { promise.reject("busy", "Speech generation is already active.", null); return }
    if (text.trim().isEmpty() || text.length > 300 || requestId.length > 100) {
      promise.reject("invalidText", "Enter up to 300 characters.", null); return
    }
    val voice = voices(tts).firstOrNull { it.name == voiceId }
    if (voice == null || tts.setVoice(voice) != TextToSpeech.SUCCESS) {
      promise.reject("noVoice", "The selected offline Korean voice is unavailable.", null); return
    }
    val directory = directory()
    if (directory == null || !directory.isDirectory) {
      promise.reject("failed", "Cannot create a speech file.", null); return
    }
    val job = Job(requestId, File(directory, "${UUID.randomUUID()}.wav"), promise)
    active = job
    job.timeout = Runnable { if (active === job) fail("timeout", "Speech generation timed out.") }
    main.postDelayed(job.timeout!!, 45_000)
    tts.setSpeechRate(1f)
    tts.setPitch(1f)
    if (tts.synthesizeToFile(text.trim(), Bundle(), job.file, requestId) != TextToSpeech.SUCCESS)
      fail("failed", "Speech generation could not start.")
  }

  private fun fail(code: String, message: String) {
    val job = active ?: return
    active = null
    job.timeout?.let { main.removeCallbacks(it) }
    engine?.stop()
    job.file.delete()
    job.promise.reject(code, message, null)
  }
}
