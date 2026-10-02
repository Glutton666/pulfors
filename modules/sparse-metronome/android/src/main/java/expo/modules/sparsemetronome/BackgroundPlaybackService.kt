package expo.modules.sparsemetronome

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

/**
 * Keeps the existing Expo Audio output alive without registering a MediaSession.
 * The actual click/rendered/silent players stay owned by JS, not this service.
 */
class BackgroundPlaybackService : Service() {
  private var foreground = false
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent == null) {
      stopSelfResult(startId)
      return START_NOT_STICKY
    }
    val owner = intent.getStringExtra("sessionId").orEmpty()
    val acquiring = intent.getStringExtra("command") == "acquireBackground"
    try {
      // Even a canceled startForegroundService request must fulfill Android's
      // foreground-start deadline before it is immediately stopped.
      if (acquiring || hasOwners()) ensureForeground()
      if (hasOwners()) {
        if (wakeLock == null) {
          wakeLock = (getSystemService(POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:BackgroundPlayback")
            .apply { setReferenceCounted(false) }
        }
        if (wakeLock?.isHeld != true) wakeLock?.acquire()
      }
      if (acquiring && !containsOwner(owner)) {
        reply(intent, false, "CANCELED", "Background playback acquisition was canceled.")
      } else {
        reply(intent, true)
      }
    } catch (error: Exception) {
      unregisterOwner(owner)
      reply(intent, false, "FOREGROUND_SERVICE_START_FAILED", error.message)
    }
    if (!hasOwners()) {
      releaseResources()
      stopSelfResult(startId)
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    releaseResources()
    super.onDestroy()
  }

  private fun ensureForeground() {
    if (foreground) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
        .createNotificationChannel(
          NotificationChannel(CHANNEL_ID, "Background playback", NotificationManager.IMPORTANCE_LOW)
            .apply { setShowBadge(false) }
        )
    }
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
      ?: Intent().setPackage(packageName)
    val pendingIntent = PendingIntent.getActivity(
      this, 0, launchIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    val notification = builder
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle(applicationInfo.loadLabel(packageManager))
      .setContentText("Background playback enabled")
      .setContentIntent(pendingIntent)
      .setCategory(Notification.CATEGORY_SERVICE)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    foreground = true
  }

  private fun releaseResources() {
    if (wakeLock?.isHeld == true) wakeLock?.release()
    wakeLock = null
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

  private fun reply(intent: Intent, success: Boolean, code: String? = null, message: String? = null) {
    val action = intent.getStringExtra("replyAction") ?: return
    sendBroadcast(
      Intent(action).setPackage(packageName)
        .putExtra("requestId", intent.getStringExtra("requestId"))
        .putExtra("sessionId", intent.getStringExtra("sessionId"))
        .putExtra("status", if (intent.getStringExtra("command") == "acquireBackground") "started" else "stopped")
        .putExtra("success", success)
        .putExtra("code", code)
        .putExtra("message", message)
    )
  }

  companion object {
    private const val CHANNEL_ID = "metronome_background_playback"
    private const val NOTIFICATION_ID = 7392
    // Accessed exclusively on Android's main queue. Desired ownership is set
    // before dispatching service intents, so a late acquire cannot undo release.
    private val owners = mutableSetOf<String>()
    fun registerOwner(owner: String) { owners.add(owner) }
    fun unregisterOwner(owner: String) { owners.remove(owner) }
    private fun containsOwner(owner: String) = owners.contains(owner)
    private fun hasOwners() = owners.isNotEmpty()
  }
}