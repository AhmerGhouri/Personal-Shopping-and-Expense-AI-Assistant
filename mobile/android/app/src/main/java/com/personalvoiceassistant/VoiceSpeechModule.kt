package com.personalvoiceassistant

import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale
import java.util.UUID

class VoiceSpeechModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private var engine: TextToSpeech? = null
  private var pending: Promise? = null
  private var generation = 0

  override fun getName() = "VoiceSpeech"

  private fun emit(name: String, id: String?) {
    if (id == null || !context.hasActiveReactInstance()) return
    val event = Arguments.createMap().apply { putString("utteranceId", id) }
    context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(name, event)
  }

  @ReactMethod
  fun speak(text: String, language: String, promise: Promise) {
    context.runOnUiQueueThread {
      val current = ++generation
      pending?.reject("CANCELLED", "Speech was replaced.")
      engine?.stop()
      engine?.shutdown()
      pending = promise
      val id = UUID.randomUUID().toString()
      engine = TextToSpeech(context) { status ->
        context.runOnUiQueueThread initialize@{
          if (current != generation) return@initialize
          val tts = engine
          if (status != TextToSpeech.SUCCESS || tts == null) {
            pending?.reject("NO_ENGINE", "Install a text-to-speech engine on this device.")
            pending = null
            return@initialize
          }
          val languageStatus = tts.setLanguage(Locale.forLanguageTag(language))
          if (languageStatus == TextToSpeech.LANG_MISSING_DATA || languageStatus == TextToSpeech.LANG_NOT_SUPPORTED) {
            pending?.reject("NO_VOICE", "Install a voice for the selected language.")
            pending = null
            return@initialize
          }
          tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            override fun onDone(utteranceId: String?) { emit("VoiceSpeechFinished", utteranceId) }
            @Deprecated("Required by Android's abstract listener")
            override fun onError(utteranceId: String?) { emit("VoiceSpeechError", utteranceId) }
            override fun onError(utteranceId: String?, errorCode: Int) { emit("VoiceSpeechError", utteranceId) }
          })
          val result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id)
          if (result == TextToSpeech.ERROR) pending?.reject("SPEECH_FAILED", "Speech synthesis failed.")
          else pending?.resolve(id)
          pending = null
        }
      }
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    context.runOnUiQueueThread {
      generation++
      pending?.reject("CANCELLED", "Speech stopped.")
      pending = null
      engine?.stop()
      engine?.shutdown()
      engine = null
      promise.resolve(null)
    }
  }

  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Double) {}

  override fun invalidate() {
    generation++
    engine?.stop()
    engine?.shutdown()
    engine = null
    pending = null
    super.invalidate()
  }
}
