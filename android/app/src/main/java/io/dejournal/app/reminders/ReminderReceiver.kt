package io.dejournal.app.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import io.dejournal.app.NativeBridge
import org.json.JSONObject

/** Handles alarm fires and the Snooze / Done buttons on reminder notifications. */
class ReminderReceiver : BroadcastReceiver() {
    companion object {
        const val ACTION_FIRE = "io.dejournal.app.REMINDER_FIRE"
        const val ACTION_SNOOZE = "io.dejournal.app.REMINDER_SNOOZE"
        const val ACTION_DONE = "io.dejournal.app.REMINDER_DONE"
        const val EXTRA_ALARM = "alarm"
        private const val SNOOZE_MS = 10 * 60 * 1000L
    }

    override fun onReceive(context: Context, intent: Intent) {
        val alarm = intent.getStringExtra(EXTRA_ALARM)?.let {
            try { Alarm.fromJson(JSONObject(it)) } catch (_: Exception) { null }
        } ?: return

        when (intent.action) {
            ACTION_FIRE -> {
                if (ReminderStore.wasFired(context, alarm.key)) return
                ReminderStore.markFired(context, alarm.key)
                Notifications.showReminder(context, alarm)
            }
            ACTION_SNOOZE -> {
                Notifications.cancel(context, alarm.key)
                val until = System.currentTimeMillis() + SNOOZE_MS
                ReminderAlarms.add(context, alarm.copy(key = "${alarm.id}:${alarm.date}:snooze:$until", at = until))
                ReminderStore.addAction(
                    context,
                    JSONObject().put("action", "snooze").put("id", alarm.id).put("date", alarm.date).put("until", until),
                )
                NativeBridge.notifyPendingActions()
            }
            ACTION_DONE -> {
                Notifications.cancel(context, alarm.key)
                ReminderAlarms.removeOccurrence(context, alarm.id, alarm.date)
                ReminderStore.addAction(context, JSONObject().put("action", "done").put("id", alarm.id).put("date", alarm.date))
                NativeBridge.notifyPendingActions()
            }
        }
    }
}
