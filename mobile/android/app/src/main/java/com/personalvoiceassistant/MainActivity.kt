package com.personalvoiceassistant

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "PersonalVoiceAssistant"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    applyWakeIntent(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    applyWakeIntent(intent)
  }

  /** Opened by the wake word: turn the screen on and show above the lock screen without unlocking. */
  private fun applyWakeIntent(intent: Intent?) {
    if (intent?.getBooleanExtra(WakeWordService.EXTRA_WAKE, false) != true) return
    WakeWordService.pendingWake = true
    setOverLockScreen(true)
  }

  override fun onStop() {
    super.onStop()
    // Normal launches must still require unlocking.
    setOverLockScreen(false)
  }

  private fun setOverLockScreen(enabled: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(enabled)
      setTurnScreenOn(enabled)
    } else {
      @Suppress("DEPRECATION")
      val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      if (enabled) window.addFlags(flags) else window.clearFlags(flags)
    }
  }
}
