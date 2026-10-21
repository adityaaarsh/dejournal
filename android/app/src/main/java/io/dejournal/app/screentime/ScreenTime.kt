package io.dejournal.app.screentime

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import org.json.JSONObject
import java.time.LocalDate
import java.time.ZoneId

/**
 * Daily screen time from Android's usage events: the total time any app was in
 * the foreground, excluding the home-screen launcher, split at local midnight.
 * Requires the user to grant "Usage access" in system settings.
 */
object ScreenTime {
    fun hasAccess(ctx: Context): Boolean {
        val ops = ctx.getSystemService(AppOpsManager::class.java)
        @Suppress("DEPRECATION")
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
        } else {
            @Suppress("DEPRECATION")
            ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
        }
        return if (mode == AppOpsManager.MODE_DEFAULT) {
            ctx.checkCallingOrSelfPermission(android.Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED
        } else {
            mode == AppOpsManager.MODE_ALLOWED
        }
    }

    /** JSON object { "YYYY-MM-DD": minutes } for each date in [start, end]. */
    fun minutesPerDay(ctx: Context, start: String, end: String): String {
        val out = JSONObject()
        if (!hasAccess(ctx)) return out.toString()
        val zone = ZoneId.systemDefault()
        val startDate = LocalDate.parse(start)
        val endDate = LocalDate.parse(end)
        val rangeStart = startDate.atStartOfDay(zone).toInstant().toEpochMilli()
        val rangeEnd = minOf(endDate.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli(), System.currentTimeMillis())
        if (rangeEnd <= rangeStart) return out.toString()

        val launchers = homePackages(ctx)
        val usm = ctx.getSystemService(UsageStatsManager::class.java)
        // Look back a little so an app already open at the range start is counted.
        val events = usm.queryEvents(rangeStart - 6 * 3600_000L, rangeEnd)
        val perDay = HashMap<LocalDate, Long>()
        val openSince = HashMap<String, Long>() // "package/activity" -> foreground start

        fun add(from: Long, to: Long) {
            var a = maxOf(from, rangeStart)
            val b = minOf(to, rangeEnd)
            while (a < b) {
                val day = java.time.Instant.ofEpochMilli(a).atZone(zone).toLocalDate()
                val dayEnd = day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
                val segEnd = minOf(b, dayEnd)
                perDay[day] = (perDay[day] ?: 0L) + (segEnd - a)
                a = segEnd
            }
        }

        fun closeAll(at: Long) {
            openSince.values.forEach { add(it, at) }
            openSince.clear()
        }

        val e = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(e)
            val pkg = e.packageName ?: continue
            val key = pkg + "/" + (e.className ?: "")
            when (e.eventType) {
                UsageEvents.Event.ACTIVITY_RESUMED -> {
                    if (pkg in launchers) {
                        closeAll(e.timeStamp)
                    } else {
                        // Only one app is in front at a time; switching apps ends the previous one.
                        closeAll(e.timeStamp)
                        openSince[key] = e.timeStamp
                    }
                }
                UsageEvents.Event.ACTIVITY_PAUSED, UsageEvents.Event.ACTIVITY_STOPPED -> {
                    openSince.remove(key)?.let { add(it, e.timeStamp) }
                }
                UsageEvents.Event.SCREEN_NON_INTERACTIVE, UsageEvents.Event.DEVICE_SHUTDOWN -> closeAll(e.timeStamp)
            }
        }
        // Whatever is still open counts until now (or the end of the range).
        closeAll(rangeEnd)

        // Days with no events are left out: Android only keeps about a week of
        // detail, so "no data" must not be reported as zero screen time.
        val todayDate = LocalDate.now(zone)
        var d = startDate
        while (!d.isAfter(endDate)) {
            val ms = perDay[d]
            if (ms != null || d == todayDate) out.put(d.toString(), Math.round((ms ?: 0L) / 60000.0))
            d = d.plusDays(1)
        }
        return out.toString()
    }

    private fun homePackages(ctx: Context): Set<String> {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        val pm = ctx.packageManager
        val list = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_DEFAULT_ONLY.toLong()))
        } else {
            @Suppress("DEPRECATION")
            pm.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
        }
        return list.mapNotNull { it.activityInfo?.packageName }.toSet() + setOf("com.android.systemui")
    }
}
