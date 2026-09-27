package expo.modules.sparsemetronome

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import org.json.JSONArray
import org.json.JSONObject

class SparseMetronomeModule : Module() {
  private val pendingPromises = ConcurrentHashMap<String, Promise>()
  private var receiver: BroadcastReceiver? = null
  private var replyAction: String? = null

  override fun definition() = ModuleDefinition {
    Name("SparseMetronome")
    Events("onError", "onInterruption", "onSessionReplaced", "onTimingOverrun")

    OnCreate {
      val context = appContext.reactContext?.applicationContext ?: return@OnCreate
      val action = "${context.packageName}.SPARSE_METRONOME_REPLY"
      replyAction = action
      receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          val eventName = intent.getStringExtra("eventName")
          if (eventName != null) {
            when (eventName) {
              "onError" -> sendEvent(eventName, mapOf(
                "code" to intent.getStringExtra("code").orEmpty(),
                "message" to intent.getStringExtra("message").orEmpty(),
                "sessionId" to intent.getStringExtra("sessionId")
              ))
              "onInterruption" -> sendEvent(eventName, mapOf(
                "reason" to "audioFocusLoss",
                "sessionId" to intent.getStringExtra("sessionId").orEmpty()
              ))
              "onSessionReplaced" -> sendEvent(eventName, mapOf(
                "previousSessionId" to intent.getStringExtra("previousSessionId").orEmpty(),
                "sessionId" to intent.getStringExtra("sessionId").orEmpty(),
                "boundaryElapsedRealtimeNanos" to intent.getStringExtra("boundaryElapsedRealtimeNanos").orEmpty(),
                "boundaryWallClockTimeMillis" to intent.getLongExtra("boundaryWallClockTimeMillis", 0L)
              ))
              "onTimingOverrun" -> sendEvent(eventName, mapOf(
                "code" to intent.getStringExtra("code").orEmpty(),
                "message" to intent.getStringExtra("message").orEmpty(),
                "sessionId" to intent.getStringExtra("sessionId").orEmpty()
              ))
            }
            return
          }

          val requestId = intent.getStringExtra("requestId") ?: return
          val promise = pendingPromises.remove(requestId) ?: return
          if (!intent.getBooleanExtra("success", false)) {
            promise.reject(
              intent.getStringExtra("code") ?: "SPARSE_METRONOME_ERROR",
              intent.getStringExtra("message") ?: "Sparse metronome command failed.",
              null
            )
            return
          }
          val result = mutableMapOf<String, Any?>(
            "sessionId" to intent.getStringExtra("sessionId").orEmpty(),
            "status" to intent.getStringExtra("status").orEmpty()
          )
          if (intent.hasExtra("nextBoundaryElapsedRealtimeNanos")) {
            result["nextBoundaryElapsedRealtimeNanos"] =
              intent.getLongExtra("nextBoundaryElapsedRealtimeNanos", 0L).toString()
          }
          if (intent.hasExtra("nextBoundaryWallClockTimeMillis")) {
            result["nextBoundaryWallClockTimeMillis"] =
              intent.getLongExtra("nextBoundaryWallClockTimeMillis", 0L)
          }
          if (intent.hasExtra("startElapsedRealtimeNanos")) {
            result["startElapsedRealtimeNanos"] =
              intent.getLongExtra("startElapsedRealtimeNanos", 0L).toString()
          }
          if (intent.hasExtra("startWallClockTimeMillis")) {
            result["startWallClockTimeMillis"] =
              intent.getLongExtra("startWallClockTimeMillis", 0L)
          }
          promise.resolve(result)
        }
      }
      val filter = IntentFilter(action)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        @Suppress("DEPRECATION")
        context.registerReceiver(receiver, filter)
      }
    }

    AsyncFunction("prepare") {
        sessionId: String,
        clipDescriptors: List<Map<String, Any?>>,
        periodFrames: Double,
        promise: Promise ->
      val context = appContext.reactContext?.applicationContext
      if (context == null) {
        promise.reject("NO_ANDROID_CONTEXT", "Android application context is unavailable.", null)
      } else if (sessionId.isBlank() || !periodFrames.isFinite() || periodFrames < 1.0 || periodFrames % 1.0 != 0.0) {
        promise.reject("INVALID_SESSION", "sessionId must be non-empty and periodFrames must be a positive integer.", null)
      } else if (clipDescriptors.size > SparseMetronomeService.MAX_CLIPS) {
        promise.reject(
          "TOO_MANY_INTERVALS",
          "This loop needs more than ${SparseMetronomeService.MAX_CLIPS} clip segments; reduce it before preparing.",
          null
        )
      } else {
        try {
          val descriptorArray = JSONArray()
          clipDescriptors.forEachIndexed { index, descriptor ->
            val id = descriptor["id"] as? String
            val uri = descriptor["uri"] as? String
            val startFrame = descriptor["startFrame"] as? Number
            val durationFrames = descriptor["durationFrames"] as? Number
            val wrapGroupId = descriptor["wrapGroupId"] as? String
            val wrapRole = descriptor["wrapRole"] as? String
            if (id.isNullOrBlank() || uri.isNullOrBlank() || startFrame == null ||
              !startFrame.toDouble().isFinite() || startFrame.toDouble() % 1.0 != 0.0 ||
              startFrame.toDouble() < 0 || startFrame.toDouble() >= periodFrames ||
              durationFrames == null || !durationFrames.toDouble().isFinite() ||
              durationFrames.toDouble() % 1.0 != 0.0 || durationFrames.toDouble() < 1 ||
              ((wrapGroupId == null) != (wrapRole == null)) ||
              (wrapGroupId != null && wrapGroupId.isBlank()) ||
              (wrapRole != null && wrapRole != "head" && wrapRole != "tail")
            ) {
              throw IllegalArgumentException(
                "Clip descriptor $index needs a private local WAV URI, valid startFrame/durationFrames, and paired wrap metadata."
              )
            }
            descriptorArray.put(JSONObject()
              .put("id", id)
              .put("uri", uri)
              .put("startFrame", startFrame.toLong())
              .put("durationFrames", durationFrames.toLong())
              .put("wrapGroupId", wrapGroupId)
              .put("wrapRole", wrapRole))
          }
          submit(context, "prepare", sessionId, promise) {
            putExtra("clipDescriptors", descriptorArray.toString())
            putExtra("periodFrames", periodFrames.toLong())
          }
        } catch (error: Exception) {
          promise.reject("INVALID_CLIPS", error.message ?: "Invalid sparse clip descriptors.", error)
        }
      }
    }

    AsyncFunction("start") { sessionId: String, promise: Promise ->
      val context = appContext.reactContext?.applicationContext
      if (context == null) {
        promise.reject("NO_ANDROID_CONTEXT", "Android application context is unavailable.", null)
      } else {
        submit(context, "start", sessionId, promise)
      }
    }

    AsyncFunction("replace") { nextBoundary: Map<String, Any?>, promise: Promise ->
      val context = appContext.reactContext?.applicationContext
      val sessionId = nextBoundary["sessionId"] as? String
      if (context == null) {
        promise.reject("NO_ANDROID_CONTEXT", "Android application context is unavailable.", null)
      } else if (sessionId.isNullOrBlank()) {
        promise.reject("INVALID_SESSION", "replace({ sessionId }) requires a prepared session id.", null)
      } else {
        submit(context, "replace", sessionId, promise)
      }
    }

    AsyncFunction("stop") { sessionId: String, promise: Promise ->
      val context = appContext.reactContext?.applicationContext
      if (context == null) {
        promise.reject("NO_ANDROID_CONTEXT", "Android application context is unavailable.", null)
      } else {
        submit(context, "stop", sessionId, promise, useForegroundStart = false)
      }
    }

    OnDestroy {
      val context = appContext.reactContext?.applicationContext
      val currentReceiver = receiver
      if (context != null && currentReceiver != null) {
        try {
          context.unregisterReceiver(currentReceiver)
        } catch (_: IllegalArgumentException) {
          // The React context may already have unregistered it during teardown.
        }
      }
      pendingPromises.values.forEach {
        it.reject("MODULE_DESTROYED", "SparseMetronome module was destroyed before the command completed.", null)
      }
      pendingPromises.clear()
      receiver = null
    }
  }

  private fun submit(
    context: Context,
    action: String,
    sessionId: String,
    promise: Promise,
    useForegroundStart: Boolean = true,
    extras: Intent.() -> Unit = {}
  ) {
    val requestId = UUID.randomUUID().toString()
    val intent = Intent(context, SparseMetronomeService::class.java)
      .setAction(SparseMetronomeService.ACTION_COMMAND)
      .putExtra("command", action)
      .putExtra("sessionId", sessionId)
      .putExtra("requestId", requestId)
      .putExtra("replyAction", replyAction)
      .apply(extras)
    pendingPromises[requestId] = promise
    try {
      if (useForegroundStart && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    } catch (error: Exception) {
      pendingPromises.remove(requestId)
      promise.reject("SERVICE_START_FAILED", error.message ?: "Could not start the sparse playback service.", error)
    }
  }

}