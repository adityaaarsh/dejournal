package io.dejournal.app.reminders

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import io.dejournal.app.MainActivity
import io.dejournal.app.R

object Notifications {
    const val CHANNEL_REMINDERS = "reminders"
    const val CHANNEL_GENERAL = "general"

    fun ensureChannels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_REMINDERS, ctx.getString(R.string.channel_reminders), NotificationManager.IMPORTANCE_HIGH).apply {
                description = ctx.getString(R.string.channel_reminders_desc)
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_GENERAL, ctx.getString(R.string.channel_general), NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = ctx.getString(R.string.channel_general_desc)
            },
        )
    }

    fun canPost(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled()
    }

    fun notificationId(key: String) = key.substringBeforeLast(':').hashCode()

    /** Opens the app at a route inside the UI. */
    fun openAppIntent(ctx: Context, path: String, requestCode: Int): PendingIntent {
        val intent = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(MainActivity.EXTRA_PATH, path)
            data = Uri.parse("dejournal://open/$requestCode")
        }
        return PendingIntent.getActivity(ctx, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun showReminder(ctx: Context, alarm: Alarm) {
        if (!canPost(ctx)) return
        ensureChannels(ctx)
        val id = notificationId(alarm.key)
        val actionIntent = { action: String ->
            val i = Intent(ctx, ReminderReceiver::class.java).apply {
                this.action = action
                data = Uri.parse("dejournal://action/$action/${Uri.encode(alarm.key)}")
                putExtra(ReminderReceiver.EXTRA_ALARM, alarm.toJson().toString())
            }
            PendingIntent.getBroadcast(ctx, id, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        val n = NotificationCompat.Builder(ctx, CHANNEL_REMINDERS)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(ctx, R.color.dj_accent))
            .setContentTitle(alarm.title)
            .setContentText(alarm.body.ifBlank { null })
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(openAppIntent(ctx, "/reminders?open=${Uri.encode(alarm.id)}", id))
            .addAction(0, ctx.getString(R.string.action_snooze), actionIntent(ReminderReceiver.ACTION_SNOOZE))
            .addAction(0, ctx.getString(R.string.action_done), actionIntent(ReminderReceiver.ACTION_DONE))
            .build()
        try {
            NotificationManagerCompat.from(ctx).notify(id, n)
        } catch (_: SecurityException) {
            // Permission revoked between the check and notify — nothing to do.
        }
    }

    fun showSimple(ctx: Context, title: String, body: String) {
        if (!canPost(ctx)) return
        ensureChannels(ctx)
        val n = NotificationCompat.Builder(ctx, CHANNEL_GENERAL)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(ctx, R.color.dj_accent))
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(openAppIntent(ctx, "/focus", 7001))
            .build()
        try {
            NotificationManagerCompat.from(ctx).notify(7001, n)
        } catch (_: SecurityException) {
        }
    }

    fun cancel(ctx: Context, key: String) {
        NotificationManagerCompat.from(ctx).cancel(notificationId(key))
    }
}
