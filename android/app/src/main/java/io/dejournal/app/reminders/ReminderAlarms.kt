package io.dejournal.app.reminders

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build

/**
 * Schedules reminder notifications with AlarmManager so they fire even when
 * DeJournal is closed. Uses exact alarms when the user allowed "Alarms &
 * reminders"; otherwise falls back to Android's battery-friendly alarms,
 * which may arrive a few minutes late.
 */
object ReminderAlarms {
    private fun alarmManager(ctx: Context) = ctx.getSystemService(AlarmManager::class.java)

    fun canScheduleExact(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager(ctx).canScheduleExactAlarms()

    /** Replace the whole schedule (called whenever reminders change in the UI). */
    fun replaceAll(ctx: Context, alarms: List<Alarm>) {
        val old = ReminderStore.alarms(ctx)
        old.forEach { cancel(ctx, it) }
        val now = System.currentTimeMillis()
        val future = alarms.filter { it.at > now && !ReminderStore.wasFired(ctx, it.key) }
        // Keep snoozes scheduled from a notification that the UI hasn't seen yet.
        val pendingSnoozes = old.filter { it.key.contains(":snooze:") && it.at > now && future.none { f -> f.id == it.id && f.date == it.date } }
        val all = future + pendingSnoozes
        all.forEach { schedule(ctx, it) }
        ReminderStore.saveAlarms(ctx, all)
    }

    /** Re-arm the stored schedule (after reboot, app update, time change). */
    fun rescheduleStored(ctx: Context) {
        val now = System.currentTimeMillis()
        val alarms = ReminderStore.alarms(ctx).filter { it.at > now }
        alarms.forEach { schedule(ctx, it) }
        ReminderStore.saveAlarms(ctx, alarms)
    }

    fun add(ctx: Context, alarm: Alarm) {
        schedule(ctx, alarm)
        ReminderStore.saveAlarms(ctx, ReminderStore.alarms(ctx).filter { it.key != alarm.key } + alarm)
    }

    /** Remove every alarm for one reminder occurrence (after Done). */
    fun removeOccurrence(ctx: Context, id: String, date: String) {
        val (drop, keep) = ReminderStore.alarms(ctx).partition { it.id == id && it.date == date }
        drop.forEach { cancel(ctx, it) }
        ReminderStore.saveAlarms(ctx, keep)
    }

    private fun schedule(ctx: Context, alarm: Alarm) {
        val pi = pendingIntent(ctx, alarm, PendingIntent.FLAG_UPDATE_CURRENT) ?: return
        val am = alarmManager(ctx)
        try {
            if (canScheduleExact(ctx)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.at, pi)
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.at, pi)
        } catch (_: SecurityException) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.at, pi)
        }
    }

    private fun cancel(ctx: Context, alarm: Alarm) {
        pendingIntent(ctx, alarm, PendingIntent.FLAG_NO_CREATE)?.let {
            alarmManager(ctx).cancel(it)
            it.cancel()
        }
    }

    private fun pendingIntent(ctx: Context, alarm: Alarm, flag: Int): PendingIntent? {
        val intent = Intent(ctx, ReminderReceiver::class.java).apply {
            action = ReminderReceiver.ACTION_FIRE
            // A unique data URI keeps each alarm's PendingIntent distinct.
            data = Uri.parse("dejournal://alarm/${Uri.encode(alarm.key)}")
            putExtra(ReminderReceiver.EXTRA_ALARM, alarm.toJson().toString())
        }
        return PendingIntent.getBroadcast(ctx, 0, intent, flag or PendingIntent.FLAG_IMMUTABLE)
    }
}
