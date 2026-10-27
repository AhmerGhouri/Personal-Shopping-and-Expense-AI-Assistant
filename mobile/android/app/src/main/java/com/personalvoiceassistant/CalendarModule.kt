package com.personalvoiceassistant

import android.content.Intent
import android.provider.CalendarContract
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

/**
 * Opens the phone's calendar app with a pre-filled event. The user reviews and saves it there,
 * so the app needs no calendar permission and never writes events silently.
 */
class CalendarModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "TripCalendar"

  @ReactMethod
  fun addEvent(event: ReadableMap, promise: Promise) {
    val intent = Intent(Intent.ACTION_INSERT)
      .setData(CalendarContract.Events.CONTENT_URI)
      .putExtra(CalendarContract.Events.TITLE, event.getString("title"))
      .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, event.getDouble("begin").toLong())
      .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, event.getDouble("end").toLong())
      .putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, event.hasKey("allDay") && event.getBoolean("allDay"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (event.hasKey("location")) intent.putExtra(CalendarContract.Events.EVENT_LOCATION, event.getString("location"))
    if (event.hasKey("description")) intent.putExtra(CalendarContract.Events.DESCRIPTION, event.getString("description"))
    try {
      (context.currentActivity ?: context).startActivity(intent)
      promise.resolve(true)
    } catch (_: Exception) {
      promise.reject("NO_CALENDAR", "No calendar app found. Install Google Calendar to add events.")
    }
  }
}
