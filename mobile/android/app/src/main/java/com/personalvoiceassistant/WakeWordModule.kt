package com.personalvoiceassistant

import android.Manifest
import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class WakeWordModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "WakeWord"

  init {
    WakeWordService.listener = { event, message ->
      if (context.hasActiveReactInstance()) {
        val payload = Arguments.createMap().apply { putString("type", event); putString("message", message) }
        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("WakeWordEvent", payload)
      }
    }
  }

  private fun granted(permission: String) =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

  @ReactMethod
  fun getStatus(promise: Promise) {
    val prefs = WakeWordService.prefs(context)
    promise.resolve(Arguments.createMap().apply {
      putBoolean("enabled", prefs.getBoolean("enabled", false))
      putBoolean("running", WakeWordService.instance != null)
      putBoolean("listening", WakeWordService.instance?.isListening() == true)
      putString("lastError", prefs.getString("lastError", null))
      putBoolean("microphone", granted(Manifest.permission.RECORD_AUDIO))
      putBoolean("notifications", Build.VERSION.SDK_INT < 33 || granted(Manifest.permission.POST_NOTIFICATIONS))
      putBoolean("overlay", Settings.canDrawOverlays(context))
      putBoolean("fullScreen", Build.VERSION.SDK_INT < 34 || context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent())
    })
  }

  /** Must be called while the app is on screen; Android blocks starting background microphone use otherwise. */
  @ReactMethod
  fun start(promise: Promise) {
    if (!granted(Manifest.permission.RECORD_AUDIO)) { promise.reject("NO_MIC", "Allow microphone access first."); return }
    WakeWordService.prefs(context).edit().putBoolean("enabled", true).apply()
    try {
      ContextCompat.startForegroundService(context, Intent(context, WakeWordService::class.java).setAction(WakeWordService.ACTION_START))
      // The app is open right now, so keep the microphone free for it until it goes to the background.
      context.runOnUiQueueThread { WakeWordService.instance?.pause() }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("START_FAILED", error.message ?: "Could not start listening.")
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    WakeWordService.prefs(context).edit().putBoolean("enabled", false).apply()
    context.startService(Intent(context, WakeWordService::class.java).setAction(WakeWordService.ACTION_STOP))
    promise.resolve(null)
  }

  @ReactMethod fun pause() { context.runOnUiQueueThread { WakeWordService.instance?.pause() } }
  @ReactMethod fun resume() { context.runOnUiQueueThread { WakeWordService.instance?.resume() } }

  /** True once after the app was opened by the wake word. */
  @ReactMethod
  fun consumeWake(promise: Promise) {
    val pending = WakeWordService.pendingWake
    WakeWordService.pendingWake = false
    promise.resolve(pending)
  }

  @ReactMethod
  fun isLocked(promise: Promise) {
    promise.resolve(context.getSystemService(KeyguardManager::class.java).isKeyguardLocked)
  }

  /** Shows the system PIN/fingerprint prompt. Resolves true once the phone is unlocked. */
  @ReactMethod
  fun unlock(promise: Promise) {
    val activity = context.currentActivity
    val keyguard = context.getSystemService(KeyguardManager::class.java)
    if (!keyguard.isKeyguardLocked) { promise.resolve(true); return }
    if (activity == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) { promise.resolve(false); return }
    activity.runOnUiThread {
      keyguard.requestDismissKeyguard(activity, object : KeyguardManager.KeyguardDismissCallback() {
        override fun onDismissSucceeded() { promise.resolve(true) }
        override fun onDismissCancelled() { promise.resolve(false) }
        override fun onDismissError() { promise.resolve(false) }
      })
    }
  }

  @ReactMethod
  fun openSettings(kind: String) {
    val uri = Uri.parse("package:${context.packageName}")
    val intent = when (kind) {
      "overlay" -> Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, uri)
      "fullScreen" -> if (Build.VERSION.SDK_INT >= 34) Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, uri) else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri)
      "battery" -> Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
      else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri)
    }.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try { context.startActivity(intent) } catch (_: Exception) {
      context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Double) {}
}
