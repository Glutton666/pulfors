package expo.modules.sparsemetronome

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.ceil
import kotlin.math.max
import org.json.JSONArray

class SparseMetronomeService : Service() {
  private lateinit var schedulerThread: HandlerThread
  private lateinit var scheduler: Handler
  private lateinit var audioManager: AudioManager
  private lateinit var notificationManager: NotificationManager
  private lateinit var wakeLock: PowerManager.WakeLock
  private lateinit var audioAttributes: AudioAttributes
  private var focusRequest: AudioFocusRequest? = null
  private var hasAudioFocus = false
  private var foreground = false
  private val sessions = linkedMapOf<String, PreparedSession>()
  private val retiringSessions = linkedMapOf<String, PreparedSession>()
  private val pendingCommands = AtomicInteger(0)
  private var activeSession: PreparedSession? = null
  private var replacementSession: PreparedSession? = null
  private var cycleEpochNanos = 0L
  private var clipIndex = 0
  private var scheduledCallback: Runnable? = null
  private val retirementCallbacks = mutableMapOf<String, Runnable>()
  private var lastTriggerTargetNanos = 0L
  private var lastTriggerDispatchNanos = 0L
  private var preloadedBytes = 0L
  private var lastOverrunReportNanos = 0L

  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    scheduler.post { handleFocusChange(change) }
  }

  override fun onCreate() {
    super.onCreate()
    notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:SparseMetronome")
    wakeLock.setReferenceCounted(false)

    schedulerThread = HandlerThread("SparseMetronomeScheduler")
    schedulerThread.start()
    scheduler = Handler(schedulerThread.looper)
    audioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_MEDIA)
      .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
      .build()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent == null) {
      stopSelf(startId)
      return START_NOT_STICKY
    }
    pendingCommands.incrementAndGet()
    val commandIntent = Intent(intent)
    scheduler.post {
      try {
        if (commandIntent.getStringExtra("command") != "stop") {
          try {
            ensureForeground("Preparing sparse audio…")
          } catch (error: Exception) {
            sendReply(
              commandIntent.getStringExtra("replyAction"),
              commandIntent.getStringExtra("requestId"),
              commandIntent.getStringExtra("sessionId"),
              false,
              "FOREGROUND_SERVICE_START_FAILED",
              error.message ?: "Android could not start the sparse playback foreground service."
            )
            return@post
          }
        }
        handleCommand(commandIntent, startId)
      } catch (error: Exception) {
        sendReply(
          commandIntent.getStringExtra("replyAction"),
          commandIntent.getStringExtra("requestId"),
          commandIntent.getStringExtra("sessionId"),
          false,
          "SERVICE_COMMAND_FAILED",
          error.message ?: "Sparse playback command failed."
        )
      } finally {
        if (pendingCommands.decrementAndGet() == 0 && sessions.isEmpty() && activeSession == null) {
          stopForegroundService()
          stopSelf(startId)
        }
      }
    }
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    if (::scheduler.isInitialized && ::schedulerThread.isInitialized) {
      val cleanupComplete = CountDownLatch(1)
      scheduler.post {
        cancelScheduledCallback()
        retirementCallbacks.values.forEach { scheduler.removeCallbacks(it) }
        retirementCallbacks.clear()
        activeSession = null
        replacementSession = null
        sessions.values.toList().forEach { releaseSession(it) }
        retiringSessions.values.toList().forEach { releaseSession(it) }
        sessions.clear()
        retiringSessions.clear()
        releasePlaybackResources()
        cleanupComplete.countDown()
      }
      try {
        cleanupComplete.await(1500, TimeUnit.MILLISECONDS)
      } catch (_: InterruptedException) {
        Thread.currentThread().interrupt()
      }
      schedulerThread.quitSafely()
    }
    super.onDestroy()
  }

  private fun handleCommand(intent: Intent, startId: Int) {
    val command = intent.getStringExtra("command")
    val sessionId = intent.getStringExtra("sessionId")
    val replyAction = intent.getStringExtra("replyAction")
    val requestId = intent.getStringExtra("requestId")
    if (sessionId.isNullOrBlank()) {
      replyError(replyAction, requestId, sessionId, "INVALID_SESSION", "A non-empty session id is required.")
      return
    }

    when (command) {
      "prepare" -> prepare(intent, replyAction, requestId, sessionId, startId)
      "start" -> startPlayback(replyAction, requestId, sessionId)
      "replace" -> scheduleReplacement(replyAction, requestId, sessionId)
      "stop" -> stopSession(replyAction, requestId, sessionId)
      else -> replyError(replyAction, requestId, sessionId, "UNKNOWN_COMMAND", "Unknown sparse playback command.")
    }
  }

  private fun prepare(
    intent: Intent,
    replyAction: String?,
    requestId: String?,
    sessionId: String,
    startId: Int
  ) {
    if (sessions.containsKey(sessionId)) {
      replyError(replyAction, requestId, sessionId, "SESSION_ALREADY_EXISTS", "Session id is already prepared.")
      return
    }
    if (sessions.size >= MAX_PREPARED_SESSIONS) {
      replyError(
        replyAction,
        requestId,
        sessionId,
        "TOO_MANY_PREPARED_SESSIONS",
        "At most $MAX_PREPARED_SESSIONS sessions may be loaded at once."
      )
      return
    }
    val periodFrames = intent.getLongExtra("periodFrames", 0L)
    if (periodFrames !in 1..MAX_PERIOD_FRAMES) {
      replyError(replyAction, requestId, sessionId, "INVALID_PERIOD", "periodFrames is outside the supported range.")
      return
    }
    val descriptorJson = intent.getStringExtra("clipDescriptors")
    val descriptors = try {
      JSONArray(descriptorJson ?: "[]")
    } catch (_: Exception) {
      replyError(replyAction, requestId, sessionId, "INVALID_CLIPS", "Clip descriptors were not valid JSON.")
      return
    }
    if (descriptors.length() > MAX_CLIPS) {
      replyError(replyAction, requestId, sessionId, "TOO_MANY_INTERVALS", "At most $MAX_CLIPS clip segments are supported per loop.")
      return
    }

    val session = PreparedSession(sessionId, periodFrames)
    val ids = mutableSetOf<String>()
    for (index in 0 until descriptors.length()) {
      val descriptor = descriptors.optJSONObject(index)
      val id = descriptor?.optString("id")
      val uriString = descriptor?.optString("uri")
      val startFrame = descriptor?.optLong("startFrame", -1L) ?: -1L
      val durationFrames = descriptor?.optLong("durationFrames", -1L) ?: -1L
      val wrapGroupId = descriptor?.optString("wrapGroupId", null)
      val wrapRole = descriptor?.optString("wrapRole", null)
      if (id.isNullOrBlank() || !ids.add(id) || uriString.isNullOrBlank() ||
        startFrame < 0 || startFrame >= periodFrames ||
        durationFrames < 1 || durationFrames > MAX_CLIP_DURATION_FRAMES ||
        ((wrapGroupId == null) != (wrapRole == null)) ||
        (wrapGroupId != null && wrapGroupId.isBlank()) ||
        (wrapRole != null && wrapRole !in setOf("head", "tail"))
      ) {
        replyError(replyAction, requestId, sessionId, "INVALID_CLIPS", "Clip descriptor $index is invalid.")
        return
      }
      val clip = PreparedClip(id, uriString, startFrame, durationFrames, wrapGroupId, wrapRole)
      session.clips.add(clip)
    }
    if (!validateWrapGroups(session.clips, periodFrames)) {
      replyError(
        replyAction,
        requestId,
        sessionId,
        "INVALID_WRAP_SEGMENTS",
        "Each wrapping interval needs one head at frame 0 and one tail ending at periodFrames."
      )
      return
    }
    session.clips.sortBy { it.startFrame }

    val clipFiles = linkedMapOf<String, File>()
    var sessionBytes = 0L
    try {
      session.clips.forEach { clip ->
        val file = toPrivateFile(clip.uri)
        val bytes = file.length()
        if (bytes <= 0 || bytes > MAX_CLIP_BYTES) {
          replyError(
            replyAction,
            requestId,
            sessionId,
            "CLIP_SIZE_LIMIT",
            "Each PCM16 WAV must be non-empty and no larger than $MAX_CLIP_BYTES bytes."
          )
          return
        }
        if (clipFiles.values.none { it.canonicalPath == file.canonicalPath }) {
          sessionBytes += bytes
        }
        if (preloadedBytes + sessionBytes > MAX_TOTAL_PRELOADED_BYTES) {
          replyError(
            replyAction,
            requestId,
            sessionId,
            "PRELOADED_SIZE_LIMIT",
            "Prepared PCM WAV files may total at most $MAX_TOTAL_PRELOADED_BYTES bytes."
          )
          return
        }
        clipFiles[clip.id] = file
      }
    } catch (error: Exception) {
      replyError(
        replyAction,
        requestId,
        sessionId,
        "CLIP_URI_INVALID",
        error.message ?: "Clip files must be inside this app's private directories."
      )
      return
    }
    if (preloadedBytes + sessionBytes > MAX_TOTAL_PRELOADED_BYTES) {
      replyError(
        replyAction,
        requestId,
        sessionId,
        "PRELOADED_SIZE_LIMIT",
        "Prepared PCM WAV files may total at most $MAX_TOTAL_PRELOADED_BYTES bytes."
      )
      return
    }
    val samplesByPath = session.clips.groupBy { clipFiles.getValue(it.id).canonicalPath }
    samplesByPath.forEach { (path, clipsForSample) ->
      val sample = PreparedSample(path)
      sample.voiceCount = requiredVoices(clipsForSample, periodFrames)
      session.samples.add(sample)
      clipsForSample.forEach { it.sample = sample }
    }
    val voiceCount = session.samples.sumOf { it.voiceCount }
    if (voiceCount > MAX_VOICES_PER_SESSION) {
      replyError(
        replyAction,
        requestId,
        sessionId,
        "TOO_MANY_CONCURRENT_CLIPS",
        "This loop needs $voiceCount overlapping playback voices; Android supports at most $MAX_VOICES_PER_SESSION per session."
      )
      return
    }
    session.preloadedBytes = sessionBytes
    preloadedBytes += sessionBytes
    session.prepareReplyAction = replyAction
    session.prepareRequestId = requestId
    session.prepareStartId = startId
    sessions[sessionId] = session

    try {
      session.samples.forEach { sample ->
        val sampleClips = samplesByPath.getValue(sample.canonicalPath)
        val expectedFrames = sampleClips.first().durationFrames
        if (sampleClips.any { it.durationFrames != expectedFrames }) {
          failPreparation(
            session,
            "SAMPLE_DURATION_MISMATCH",
            "All events reusing one WAV URI must declare its exact same durationFrames."
          )
          return
        }
        try {
          PcmWavInfo.read(File(sample.canonicalPath), SAMPLE_RATE.toInt(), expectedFrames)
        } catch (error: IllegalArgumentException) {
          failPreparation(session, "UNSUPPORTED_AUDIO_FORMAT", error.message ?: "The WAV format is unsupported.")
          return
        }
        session.pendingLoads += sample.voiceCount
        repeat(sample.voiceCount) {
          loadClip(session, sample, File(sample.canonicalPath))
        }
      }
      if (session.pendingLoads == 0) finishPreparation(session)
    } catch (error: Exception) {
      failPreparation(
        session,
        "CLIP_LOAD_FAILED",
        error.message ?: "A WAV voice could not be prepared by Android."
      )
    }
  }

  private fun loadClip(session: PreparedSession, sample: PreparedSample, file: File) {
    val length = file.length()
    if (length <= 0 || length > MAX_CLIP_BYTES) {
      throw IllegalArgumentException("Clip ${file.name} must be a PCM WAV no larger than $MAX_CLIP_BYTES bytes.")
    }
    val player = MediaPlayer()
    val voice = PreparedVoice(player)
    sample.voices.add(voice)
    player.setAudioAttributes(audioAttributes)
    player.setOnPreparedListener {
      scheduler.post { handleLoadComplete(session.sessionId, sample, voice, null) }
    }
    player.setOnErrorListener { _, what, extra ->
      scheduler.post {
        handleLoadComplete(
          session.sessionId,
          sample,
          voice,
          "Android could not decode WAV ${file.name} (MediaPlayer error $what/$extra)."
        )
      }
      true
    }
    try {
      player.setDataSource(file.absolutePath)
      player.prepareAsync()
    } catch (error: Exception) {
      releaseVoice(voice)
      sample.voices.remove(voice)
      throw IllegalArgumentException("Android could not prepare WAV ${file.name}: ${error.message ?: "unsupported WAV"}")
    }
  }

  private fun validateWrapGroups(clips: List<PreparedClip>, periodFrames: Long): Boolean {
    // A wrapping source interval is supplied as two already-split WAVs:
    // its head is triggered at frame zero (including the first cycle), and
    // its tail is triggered late in every cycle and ends at the loop boundary.
    val groups = clips.filter { it.wrapGroupId != null }.groupBy { it.wrapGroupId }
    return groups.values.all { pair ->
      if (pair.size != 2) return@all false
      val head = pair.singleOrNull { it.wrapRole == "head" } ?: return@all false
      val tail = pair.singleOrNull { it.wrapRole == "tail" } ?: return@all false
      head.startFrame == 0L && tail.startFrame > 0L &&
        tail.startFrame + tail.durationFrames == periodFrames
    }
  }

  private fun requiredVoices(clips: List<PreparedClip>, periodFrames: Long): Int {
    var peak = 0L
    clips.forEach { event ->
      var active = 0L
      clips.forEach { source ->
        val phaseAge = (event.startFrame - source.startFrame + periodFrames) % periodFrames
        if (source.durationFrames > phaseAge) {
          val liveInstances = (source.durationFrames - phaseAge - 1L) / periodFrames + 1L
          active += liveInstances
        }
      }
      peak = max(peak, active)
    }
    return peak.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
  }

  private fun handleLoadComplete(
    sessionId: String,
    sample: PreparedSample,
    voice: PreparedVoice,
    errorMessage: String?
  ) {
    val session = sessions[sessionId]
    if (session == null || !sample.voices.contains(voice)) {
      releaseVoice(voice)
      return
    }
    if (errorMessage != null) {
      if (session.prepared) {
        emitError("AUDIO_PLAYBACK_FAILED", errorMessage, session.sessionId)
        if (activeSession === session) {
          stopPlayback(clearAllSessions = true)
          stopForegroundService()
          stopSelf()
        }
        return
      }
      failPreparation(session, "CLIP_DECODE_FAILED", errorMessage)
      return
    }
    if (voice.prepared) return
    voice.prepared = true
    session.pendingLoads--
    if (session.pendingLoads == 0) finishPreparation(session)
  }

  private fun finishPreparation(session: PreparedSession) {
    session.prepared = true
    try {
      updateNotification(if (session.clips.isEmpty()) "Silent loop ready" else "Sparse audio ready")
    } catch (error: Exception) {
      failPreparation(
        session,
        "NOTIFICATION_UPDATE_FAILED",
        error.message ?: "Could not update the foreground preparation notification."
      )
      return
    }
    sendReply(
      session.prepareReplyAction,
      session.prepareRequestId,
      session.sessionId,
      true,
      status = "prepared"
    )
    session.prepareReplyAction = null
    session.prepareRequestId = null
  }

  private fun failPreparation(session: PreparedSession, code: String, message: String) {
    if (sessions[session.sessionId] !== session) return
    val requestAction = session.prepareReplyAction
    val requestId = session.prepareRequestId
    val startId = session.prepareStartId
    sessions.remove(session.sessionId)
    releaseSession(session)
    replyError(requestAction, requestId, session.sessionId, code, message)
    if (pendingCommands.get() == 0 && sessions.isEmpty() && activeSession == null) {
      stopForegroundService()
      stopSelf(startId)
    }
  }

  private fun startPlayback(replyAction: String?, requestId: String?, sessionId: String) {
    val session = sessions[sessionId]
    if (session == null || !session.prepared) {
      replyError(replyAction, requestId, sessionId, "SESSION_NOT_READY", "prepare must finish successfully before start.")
      return
    }
    if (activeSession != null) {
      replyError(replyAction, requestId, sessionId, "PLAYBACK_ALREADY_ACTIVE", "Use replace({ sessionId }) at a loop boundary.")
      return
    }
    if (session.clips.isNotEmpty() && !requestAudioFocus()) {
      replyError(replyAction, requestId, sessionId, "AUDIO_FOCUS_DENIED", "Android did not grant audio focus.")
      return
    }
    try {
      if (!wakeLock.isHeld) wakeLock.acquire()
    } catch (error: Exception) {
      abandonAudioFocus()
      replyError(replyAction, requestId, sessionId, "WAKE_LOCK_FAILED", error.message ?: "Could not acquire a partial wake lock.")
      return
    }
    activeSession = session
    clipIndex = 0
    lastTriggerTargetNanos = 0L
    lastTriggerDispatchNanos = 0L
    try {
      updateNotification(if (session.clips.isEmpty()) "Silent loop running" else "Sparse audio playing")
    } catch (error: Exception) {
      stopPlayback(clearAllSessions = false)
      replyError(
        replyAction,
        requestId,
        sessionId,
        "NOTIFICATION_UPDATE_FAILED",
        error.message ?: "Could not update the foreground playback notification."
      )
      return
    }
    val anchorSnapshotNanos = SystemClock.elapsedRealtimeNanos()
    val anchorWallClockMillis = System.currentTimeMillis()
    val startAnchor = SparseClockAnchor.futureStart(
      anchorSnapshotNanos,
      anchorWallClockMillis,
      START_LEAD_NANOS
    )
    cycleEpochNanos = startAnchor.elapsedRealtimeNanos
    session.firstEventPending = session.clips.isNotEmpty()
    sendReply(
      replyAction,
      requestId,
      sessionId,
      true,
      status = "started",
      startElapsedRealtimeNanos = cycleEpochNanos,
      startWallClockTimeMillis = startAnchor.wallClockTimeMillis
    )
    driveScheduler()
  }

  private fun scheduleReplacement(replyAction: String?, requestId: String?, sessionId: String) {
    val session = sessions[sessionId]
    if (session == null || !session.prepared) {
      replyError(replyAction, requestId, sessionId, "SESSION_NOT_READY", "Replacement session must be fully prepared first.")
      return
    }
    if (retiringSessions.containsKey(sessionId)) {
      replyError(replyAction, requestId, sessionId, "STALE_SESSION", "A retiring session cannot be scheduled as a replacement.")
      return
    }
    val active = activeSession
    if (active == null) {
      replyError(replyAction, requestId, sessionId, "NO_ACTIVE_SESSION", "There is no active loop to replace.")
      return
    }
    if (session === active) {
      replyError(
        replyAction,
        requestId,
        sessionId,
        "INCOMPATIBLE_REPLACEMENT",
        "Replacement must be a different prepared session."
      )
      return
    }
    if (replacementSession != null) {
      replyError(replyAction, requestId, sessionId, "REPLACEMENT_PENDING", "A loop-boundary replacement is already pending.")
      return
    }
    if (session.clips.isNotEmpty() && !hasAudioFocus && !requestAudioFocus()) {
      replyError(replyAction, requestId, sessionId, "AUDIO_FOCUS_DENIED", "Android did not grant audio focus for the replacement.")
      return
    }
    val periodNanos = framesToNanos(active.periodFrames)
    val now = SystemClock.elapsedRealtimeNanos()
    val nowWallClockMillis = System.currentTimeMillis()
    val elapsed = max(0L, now - cycleEpochNanos)
    val nextCycle = elapsed / periodNanos + 1
    val boundaryNanos = cycleEpochNanos + nextCycle * periodNanos
    val boundaryAnchor = SparseClockAnchor.atElapsedTime(boundaryNanos, now, nowWallClockMillis)
    replacementSession = session
    sendReply(
      replyAction,
      requestId,
      sessionId,
      true,
      status = "replacementScheduled",
      boundaryElapsedRealtimeNanos = boundaryNanos,
      boundaryWallClockTimeMillis = boundaryAnchor.wallClockTimeMillis
    )
    driveScheduler()
  }

  private fun stopSession(replyAction: String?, requestId: String?, sessionId: String) {
    val session = sessions[sessionId]
    if (session == null) {
      replyError(replyAction, requestId, sessionId, "STALE_SESSION", "Session is unknown or has already been replaced/stopped.")
      return
    }
    if (retiringSessions.containsKey(sessionId)) {
      replyError(replyAction, requestId, sessionId, "STALE_SESSION", "Session has been replaced and is retained only for its audio tail.")
      return
    }
    if (replacementSession === session) {
      replacementSession = null
      sessions.remove(sessionId)
      releaseSession(session)
      abandonAudioFocusIfIdle()
      sendReply(replyAction, requestId, sessionId, true, status = "stopped")
      return
    }
    if (activeSession === session) {
      stopPlayback(clearAllSessions = true)
      sendReply(replyAction, requestId, sessionId, true, status = "stopped")
      stopForegroundService()
      return
    }

    sessions.remove(sessionId)
    releaseSession(session)
    sendReply(replyAction, requestId, sessionId, true, status = "stopped")
  }

  private fun driveScheduler() {
    val active = activeSession ?: return
    val periodNanos = framesToNanos(active.periodFrames)
    val now = SystemClock.elapsedRealtimeNanos()
    if (!active.firstEventPending && now - cycleEpochNanos >= periodNanos * 2) {
      val missedCycles = (now - cycleEpochNanos) / periodNanos
      cycleEpochNanos += missedCycles * periodNanos
      clipIndex = 0
      reportOverrun(active.sessionId, "Skipped $missedCycles overdue loop cycles.")
    }

    if (clipIndex >= active.clips.size) {
      val boundary = cycleEpochNanos + periodNanos
      scheduleAt(boundary) { onLoopBoundary(boundary) }
      return
    }

    val clip = active.clips[clipIndex]
    val clipTime = cycleEpochNanos + framesToNanos(clip.startFrame)
    val boundaryTime = cycleEpochNanos + periodNanos
    if (replacementSession != null && boundaryTime <= clipTime) {
      scheduleAt(boundaryTime) { onLoopBoundary(boundaryTime) }
      return
    }
    scheduleAt(clipTime) {
      val stillActive = activeSession
      if (stillActive !== active || clipIndex >= active.clips.size) return@scheduleAt
      val dueClip = active.clips[clipIndex]
      val dispatchNanos = SystemClock.elapsedRealtimeNanos()
      val latenessNanos = dispatchNanos - clipTime
      if (
        SparseSchedulerPolicy.shouldSkipLateClip(
          active.firstEventPending,
          latenessNanos,
          MAX_LATE_NANOS
        ) ||
        (clipTime < lastTriggerDispatchNanos && clipTime != lastTriggerTargetNanos)
      ) {
        reportOverrun(
          active.sessionId,
          "Skipped overdue clip ${dueClip.id} (${max(0L, latenessNanos) / 1_000_000L} ms late)."
        )
        clipIndex++
        driveScheduler()
        return@scheduleAt
      }
      val sample = dueClip.sample
      val voice = sample?.voices?.firstOrNull { candidate ->
        candidate.prepared && !candidate.released && candidate.availableAtNanos <= dispatchNanos &&
          try {
            !candidate.player.isPlaying
          } catch (_: IllegalStateException) {
            false
          }
      }
      if (voice == null) {
        emitError(
          "AUDIO_VOICE_EXHAUSTED",
          "No prepared voice was available for event ${dueClip.id}; no fallback audio was started.",
          active.sessionId
        )
        stopPlayback(clearAllSessions = true)
        stopForegroundService()
        stopSelf()
        return@scheduleAt
      }
      try {
        voice.player.start()
      } catch (error: Exception) {
        emitError("AUDIO_PLAYBACK_FAILED", error.message ?: "Android could not start the WAV voice.", active.sessionId)
        stopPlayback(clearAllSessions = true)
        stopForegroundService()
        stopSelf()
        return@scheduleAt
      }
      lastTriggerTargetNanos = clipTime
      lastTriggerDispatchNanos = dispatchNanos
      active.firstEventPending = false
      voice.availableAtNanos = dispatchNanos + framesToNanos(dueClip.durationFrames)
      active.latestExpectedEndNanos = max(
        active.latestExpectedEndNanos,
        voice.availableAtNanos
      )
      clipIndex++
      driveScheduler()
    }
  }

  private fun onLoopBoundary(boundaryNanos: Long) {
    val previous = activeSession ?: return
    val replacement = replacementSession
    if (replacement != null) {
      activeSession = replacement
      replacementSession = null
      retiringSessions[previous.sessionId] = previous
      scheduleRetirement(
        previous,
        max(previous.latestExpectedEndNanos, boundaryNanos) + RETIREMENT_GRACE_NANOS
      )
      clipIndex = 0
      lastTriggerTargetNanos = 0L
      lastTriggerDispatchNanos = 0L
      cycleEpochNanos = boundaryNanos
      replacement.firstEventPending = replacement.clips.isNotEmpty()
      try {
        updateNotification(if (replacement.clips.isEmpty()) "Silent loop running" else "Sparse audio playing")
      } catch (error: Exception) {
        emitError(
          "NOTIFICATION_UPDATE_FAILED",
          error.message ?: "Could not update the foreground replacement notification.",
          replacement.sessionId
        )
        stopPlayback(clearAllSessions = true)
        stopForegroundService()
        stopSelf()
        return
      }
      emitEvent(
        "onSessionReplaced",
        mapOf(
          "previousSessionId" to previous.sessionId,
          "sessionId" to replacement.sessionId,
          "boundaryElapsedRealtimeNanos" to boundaryNanos.toString(),
          "boundaryWallClockTimeMillis" to SparseClockAnchor.atElapsedTime(
            boundaryNanos,
            SystemClock.elapsedRealtimeNanos(),
            System.currentTimeMillis()
          ).wallClockTimeMillis
        )
      )
    } else {
      cycleEpochNanos = boundaryNanos
      clipIndex = 0
    }
    driveScheduler()
  }

  private fun scheduleAt(targetNanos: Long, action: () -> Unit) {
    cancelScheduledCallback()
    val callback = Runnable {
      scheduledCallback = null
      val remainingNanos = targetNanos - SystemClock.elapsedRealtimeNanos()
      if (remainingNanos > 0) {
        scheduleAt(targetNanos, action)
      } else {
        action()
      }
    }
    scheduledCallback = callback
    val delayMillis = ceil(max(0L, targetNanos - SystemClock.elapsedRealtimeNanos()) / 1_000_000.0).toLong()
    scheduler.postDelayed(callback, delayMillis)
  }

  private fun scheduleRetirement(session: PreparedSession, releaseAtNanos: Long) {
    retirementCallbacks.remove(session.sessionId)?.let { scheduler.removeCallbacks(it) }
    val callback = object : Runnable {
      override fun run() {
        if (retirementCallbacks[session.sessionId] !== this) return
        val remainingNanos = releaseAtNanos - SystemClock.elapsedRealtimeNanos()
        if (remainingNanos > 0) {
          scheduler.postDelayed(this, ceil(remainingNanos / 1_000_000.0).toLong())
          return
        }
        retirementCallbacks.remove(session.sessionId)
        if (retiringSessions[session.sessionId] === session) {
          retiringSessions.remove(session.sessionId)
          releaseSession(session)
          abandonAudioFocusIfIdle()
        }
      }
    }
    retirementCallbacks[session.sessionId] = callback
    scheduler.postDelayed(
      callback,
      ceil(max(0L, releaseAtNanos - SystemClock.elapsedRealtimeNanos()) / 1_000_000.0).toLong()
    )
  }

  private fun reportOverrun(sessionId: String, message: String) {
    val now = SystemClock.elapsedRealtimeNanos()
    if (now - lastOverrunReportNanos < OVERRUN_REPORT_INTERVAL_NANOS) return
    lastOverrunReportNanos = now
    emitEvent(
      "onTimingOverrun",
      mapOf("code" to "SCHEDULE_OVERRUN", "message" to message, "sessionId" to sessionId)
    )
  }

  private fun handleFocusChange(change: Int) {
    if (change == AudioManager.AUDIOFOCUS_GAIN) return
    val active = activeSession ?: return
    emitEvent("onInterruption", mapOf("sessionId" to active.sessionId))
    stopPlayback(clearAllSessions = true)
    stopForegroundService()
    stopSelf()
  }

  private fun stopPlayback(clearAllSessions: Boolean) {
    cancelScheduledCallback()
    activeSession = null
    replacementSession = null
    releasePlaybackResources()
    if (clearAllSessions) {
      retirementCallbacks.values.forEach { scheduler.removeCallbacks(it) }
      retirementCallbacks.clear()
      sessions.values.toList().forEach { releaseSession(it) }
      retiringSessions.values.toList().forEach { releaseSession(it) }
      retiringSessions.clear()
      sessions.clear()
    }
  }

  private fun releaseSession(session: PreparedSession) {
    sessions.remove(session.sessionId)
    retiringSessions.remove(session.sessionId)
    session.samples.forEach { sample -> sample.voices.forEach(::releaseVoice) }
    session.samples.clear()
    session.prepareReplyAction = null
    session.prepareRequestId = null
    session.prepareStartId = 0
    preloadedBytes = (preloadedBytes - session.preloadedBytes).coerceAtLeast(0L)
    session.preloadedBytes = 0L
  }

  private fun requestAudioFocus(): Boolean {
    val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(audioAttributes)
        .setWillPauseWhenDucked(true)
        .setOnAudioFocusChangeListener(focusListener, scheduler)
        .build()
      focusRequest = request
      audioManager.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
    }
    hasAudioFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    return hasAudioFocus
  }

  private fun abandonAudioFocus() {
    if (!hasAudioFocus) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
      focusRequest = null
    } else {
      @Suppress("DEPRECATION")
      audioManager.abandonAudioFocus(focusListener)
    }
    hasAudioFocus = false
  }

  private fun abandonAudioFocusIfIdle() {
    val activeNeedsFocus = activeSession?.clips?.isNotEmpty() == true
    val replacementNeedsFocus = replacementSession?.clips?.isNotEmpty() == true
    val retiringNeedsFocus = retiringSessions.values.any { it.clips.isNotEmpty() }
    if (!activeNeedsFocus && !replacementNeedsFocus && !retiringNeedsFocus) {
      abandonAudioFocus()
    }
  }

  private fun releasePlaybackResources() {
    abandonAudioFocus()
    if (wakeLock.isHeld) wakeLock.release()
  }

  private fun releaseVoice(voice: PreparedVoice) {
    if (voice.released) return
    voice.released = true
    try {
      voice.player.release()
    } catch (_: Exception) {
      // The decoder may already have released this player.
    }
  }

  private fun ensureForeground(text: String) {
    if (foreground) {
      updateNotification(text)
      return
    }
    val notification = buildNotification(text)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    foreground = true
  }

  private fun stopForegroundService() {
    if (foreground) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        stopForeground(STOP_FOREGROUND_REMOVE)
      } else {
        @Suppress("DEPRECATION")
        stopForeground(true)
      }
      foreground = false
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        NOTIFICATION_CHANNEL_ID,
        "Sparse audio playback",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Shows while sparse audio clips are prepared or playing."
        setShowBadge(false)
      }
      notificationManager.createNotificationChannel(channel)
    }
  }

  private fun buildNotification(text: String): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
      ?: Intent().setPackage(packageName)
    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    return builder
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Sparse metronome")
      .setContentText(text)
      .setContentIntent(pendingIntent)
      .setCategory(Notification.CATEGORY_SERVICE)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .build()
  }

  private fun updateNotification(text: String) {
    if (!foreground) return
    notificationManager.notify(NOTIFICATION_ID, buildNotification(text))
  }

  private fun sendReply(
    replyAction: String?,
    requestId: String?,
    sessionId: String?,
    success: Boolean,
    code: String? = null,
    message: String? = null,
    status: String? = null,
    boundaryElapsedRealtimeNanos: Long? = null,
    startElapsedRealtimeNanos: Long? = null,
    boundaryWallClockTimeMillis: Long? = null,
    startWallClockTimeMillis: Long? = null
  ) {
    val action = replyAction ?: return
    val intent = Intent(action).setPackage(packageName)
      .putExtra("requestId", requestId)
      .putExtra("sessionId", sessionId)
      .putExtra("success", success)
    if (code != null) intent.putExtra("code", code)
    if (message != null) intent.putExtra("message", message)
    if (status != null) intent.putExtra("status", status)
    if (boundaryElapsedRealtimeNanos != null) {
      intent.putExtra("nextBoundaryElapsedRealtimeNanos", boundaryElapsedRealtimeNanos)
    }
    if (startElapsedRealtimeNanos != null) {
      intent.putExtra("startElapsedRealtimeNanos", startElapsedRealtimeNanos)
    }
    if (boundaryWallClockTimeMillis != null) {
      intent.putExtra("nextBoundaryWallClockTimeMillis", boundaryWallClockTimeMillis)
    }
    if (startWallClockTimeMillis != null) {
      intent.putExtra("startWallClockTimeMillis", startWallClockTimeMillis)
    }
    sendBroadcast(intent)
  }

  private fun replyError(
    replyAction: String?,
    requestId: String?,
    sessionId: String?,
    code: String,
    message: String
  ) {
    sendReply(replyAction, requestId, sessionId, false, code, message)
  }

  private fun emitError(code: String, message: String, sessionId: String?) {
    emitEvent(
      "onError",
      mapOf("code" to code, "message" to message, "sessionId" to (sessionId ?: ""))
    )
  }

  private fun emitEvent(eventName: String, values: Map<String, Any>) {
    val action = "$packageName.SPARSE_METRONOME_REPLY"
    val intent = Intent(action).setPackage(packageName).putExtra("eventName", eventName)
    values.forEach { (key, value) ->
      when (value) {
        is Long -> intent.putExtra(key, value)
        is Int -> intent.putExtra(key, value)
        is Boolean -> intent.putExtra(key, value)
        else -> intent.putExtra(key, value.toString())
      }
    }
    sendBroadcast(intent)
  }

  private fun cancelScheduledCallback() {
    scheduledCallback?.let { scheduler.removeCallbacks(it) }
    scheduledCallback = null
  }

  private fun toPrivateFile(value: String): File {
    val parsed = Uri.parse(value)
    if (parsed.scheme != null && parsed.scheme != "file") {
      throw IllegalArgumentException("Only app-private file:// WAV clip URIs are supported.")
    }
    val candidate = if (parsed.scheme == "file") File(parsed.path ?: "") else File(value)
    val canonical = candidate.canonicalFile
    val privateRoots = listOf(filesDir, cacheDir, noBackupFilesDir).map { it.canonicalFile }
    if (privateRoots.none { root ->
        canonical.path.startsWith(root.path + File.separator)
      }
    ) {
      throw IllegalArgumentException("Clip path must be inside this app's private files, cache, or no-backup directory.")
    }
    if (!canonical.isFile) {
      throw IllegalArgumentException("Clip URI does not point to an app-private file.")
    }
    return canonical
  }

  private fun framesToNanos(frames: Long): Long = frames * NANOS_PER_SECOND / SAMPLE_RATE

  private data class PreparedSession(
    val sessionId: String,
    val periodFrames: Long,
    val clips: MutableList<PreparedClip> = mutableListOf(),
    val samples: MutableList<PreparedSample> = mutableListOf(),
    var pendingLoads: Int = 0,
    var prepared: Boolean = false,
    var prepareReplyAction: String? = null,
    var prepareRequestId: String? = null,
    var prepareStartId: Int = 0,
    var latestExpectedEndNanos: Long = 0L,
    var firstEventPending: Boolean = false,
    var preloadedBytes: Long = 0L
  )

  private data class PreparedClip(
    val id: String,
    val uri: String,
    val startFrame: Long,
    val durationFrames: Long,
    val wrapGroupId: String?,
    val wrapRole: String?,
    var sample: PreparedSample? = null
  )
  private data class PreparedSample(
    val canonicalPath: String,
    val voices: MutableList<PreparedVoice> = mutableListOf(),
    var voiceCount: Int = 1
  )
  private data class PreparedVoice(
    val player: MediaPlayer,
    var prepared: Boolean = false,
    var released: Boolean = false,
    var availableAtNanos: Long = 0L
  )

  companion object {
    const val ACTION_COMMAND = "expo.modules.sparsemetronome.COMMAND"
    const val NOTIFICATION_CHANNEL_ID = "sparse_metronome_playback"
    const val MAX_CLIPS = 256
    private const val MAX_VOICES_PER_SESSION = 32
    private const val MAX_PREPARED_SESSIONS = 2
    private const val MAX_CLIP_BYTES = 128 * 1024 * 1024L
    private const val MAX_TOTAL_PRELOADED_BYTES = 256 * 1024 * 1024L
    private const val MAX_CLIP_DURATION_FRAMES = SAMPLE_RATE * 60L * 30L
    private const val MAX_LATE_NANOS = 50_000_000L
    private const val START_LEAD_NANOS = 120_000_000L
    private const val RETIREMENT_GRACE_NANOS = 150_000_000L
    private const val OVERRUN_REPORT_INTERVAL_NANOS = 1_000_000_000L
    private const val SAMPLE_RATE = 44_100L
    private const val NANOS_PER_SECOND = 1_000_000_000L
    private const val MAX_PERIOD_FRAMES = SAMPLE_RATE * 60L * 60L
    private const val NOTIFICATION_ID = 7412
  }
}