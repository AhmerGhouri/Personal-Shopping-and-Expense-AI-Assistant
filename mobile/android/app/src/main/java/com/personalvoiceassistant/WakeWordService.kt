package com.personalvoiceassistant

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.RecognitionListener
import org.vosk.android.SpeechService
import java.io.File
import java.util.concurrent.Executors

/**
 * Listens for the wake word on-device while the app is closed or the phone is locked.
 * Android only allows background microphone use from a visible foreground service, which is why
 * a permanent notification is shown, and the service must be started while the app is open.
 */
class WakeWordService : Service() {
  companion object {
    const val ACTION_START = "com.personalvoiceassistant.wakeword.START"
    const val ACTION_STOP = "com.personalvoiceassistant.wakeword.STOP"
    const val EXTRA_WAKE = "wakeWord"
    private const val CHANNEL_LISTENING = "wake_word_listening"
    private const val CHANNEL_ALERT = "wake_word_alert"
    private const val NOTIFICATION_LISTENING = 4101
    private const val NOTIFICATION_ALERT = 4102
    private const val PREFS = "wake_word"
    private const val MODEL_ASSET = "vosk-model-en"
    /** Bump when the bundled model changes so the copy on the phone is refreshed. */
    private const val MODEL_VERSION = "small-en-us-0.15"
    /** Restricting Vosk to these phrases is what makes it a keyword spotter; "[unk]" absorbs other speech. */
    private const val GRAMMAR = """["gigi", "gee gee", "gg", "[unk]"]"""
    private val WAKE_PHRASE = Regex("""\b(gigi|gee gee|gg)\b""")

    @Volatile var instance: WakeWordService? = null
    /** Set when the wake word fired and the app has not picked it up yet (covers cold starts). */
    @Volatile var pendingWake = false
    /** Lets the React Native module forward detections and errors to JavaScript. */
    var listener: ((event: String, message: String?) -> Unit)? = null

    fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  }

  private var model: Model? = null
  private var speech: SpeechService? = null
  private var loading = false
  private var paused = false
  private val main = Handler(Looper.getMainLooper())
  private val worker = Executors.newSingleThreadExecutor()

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    createChannels()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      prefs(this).edit().putBoolean("enabled", false).apply()
      shutdown()
      return START_NOT_STICKY
    }
    val notification = listeningNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_LISTENING, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    } else startForeground(NOTIFICATION_LISTENING, notification)
    if (!paused) startListening()
    // Not sticky: Android forbids restarting microphone services from the background.
    return START_NOT_STICKY
  }

  /** The app pauses detection while it is open so its own recorder gets the microphone. */
  fun pause() { paused = true; stopListening() }
  fun resume() { paused = false; startListening() }
  fun isListening() = speech != null

  private fun startListening() {
    if (speech != null || loading) return
    val loaded = model
    if (loaded == null) {
      // Copying and loading the ~70 MB model takes a few seconds, so keep it off the main thread.
      loading = true
      worker.execute {
        val result = runCatching { Model(unpackModel().absolutePath) }
        main.post {
          loading = false
          result.onSuccess { model = it; if (!paused && instance === this) startListening() }
            .onFailure { fail("Could not load the speech model: ${it.message}") }
        }
      }
      return
    }
    try {
      val recognizer = Recognizer(loaded, 16000f, GRAMMAR)
      speech = SpeechService(recognizer, 16000f).also { it.startListening(recognitionListener) }
      prefs(this).edit().remove("lastError").apply()
    } catch (error: Exception) {
      speech = null
      fail(if (error is SecurityException) "Microphone permission is missing." else "Could not start listening: ${error.message}")
    }
  }

  private val recognitionListener = object : RecognitionListener {
    private fun check(hypothesis: String?, key: String) {
      val text = hypothesis?.let { runCatching { JSONObject(it).optString(key) }.getOrNull() } ?: return
      if (WAKE_PHRASE.containsMatchIn(text)) main.post { if (speech != null) onWakeWord() }
    }
    override fun onPartialResult(hypothesis: String?) = check(hypothesis, "partial")
    override fun onResult(hypothesis: String?) = check(hypothesis, "text")
    override fun onFinalResult(hypothesis: String?) = check(hypothesis, "text")
    override fun onError(exception: Exception?) { main.post { fail(exception?.message ?: "Wake word engine error.") } }
    override fun onTimeout() {}
  }

  /** Assets can't be opened as a directory by Vosk, so copy the model into app storage once. */
  private fun unpackModel(): File {
    val target = File(filesDir, MODEL_ASSET)
    val marker = File(target, ".version")
    if (marker.exists() && marker.readText() == MODEL_VERSION) return target
    target.deleteRecursively()
    fun copy(asset: String, destination: File) {
      val children = assets.list(asset).orEmpty()
      if (children.isEmpty()) {
        destination.parentFile?.mkdirs()
        assets.open(asset).use { input -> destination.outputStream().use { input.copyTo(it) } }
      } else children.forEach { copy("$asset/$it", File(destination, it)) }
    }
    copy(MODEL_ASSET, target)
    marker.writeText(MODEL_VERSION)
    return target
  }

  private fun stopListening() {
    val current = speech ?: return
    speech = null
    current.stop()
    current.shutdown()
  }

  private fun onWakeWord() {
    // Release the microphone so the assistant's recorder can use it.
    paused = true
    stopListening()
    pendingWake = true
    listener?.invoke("detected", null)
    val launch = Intent(this, MainActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
      .putExtra(EXTRA_WAKE, true)
    // Apps may only open screens from the background with "Display over other apps" access;
    // otherwise a full-screen notification opens the app on a locked or sleeping phone.
    if (Settings.canDrawOverlays(this)) {
      try { startActivity(launch); return } catch (_: Exception) {}
    }
    val pending = PendingIntent.getActivity(this, 1, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val alert = NotificationCompat.Builder(this, CHANNEL_ALERT)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("Listening…")
      .setContentText("Tap to talk to your assistant")
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setAutoCancel(true)
      .setTimeoutAfter(15000)
      .setContentIntent(pending)
      .setFullScreenIntent(pending, true)
      .build()
    getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ALERT, alert)
  }

  private fun fail(message: String) {
    prefs(this).edit().putString("lastError", message).apply()
    listener?.invoke("error", message)
    stopListening()
  }

  private fun shutdown() {
    stopListening()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() {
    stopListening()
    worker.shutdown()
    model?.close()
    model = null
    if (instance === this) instance = null
    super.onDestroy()
  }

  private fun listeningNotification(): Notification {
    val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
    val stop = PendingIntent.getService(this, 2, Intent(this, WakeWordService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE)
    return NotificationCompat.Builder(this, CHANNEL_LISTENING)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("Say “Gigi” to talk to your assistant")
      .setContentText("Listening on this phone only. Tap to open.")
      .setOngoing(true)
      .setSilent(true)
      .setContentIntent(open)
      .addAction(0, "Turn off", stop)
      .build()
  }

  private fun createChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val notifications = getSystemService(NotificationManager::class.java)
    notifications.createNotificationChannel(NotificationChannel(CHANNEL_LISTENING, "Wake word", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Shown while the assistant listens for its name"
    })
    notifications.createNotificationChannel(NotificationChannel(CHANNEL_ALERT, "Wake word alerts", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Opens the assistant when you say its name"
      setSound(null, null)
    })
  }
}
