package io.dejournal.app.screentime

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
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
    /** JSON object { "YYYY-MM-DD": minutes } for each date in [start, end]. */
    fun minutesPerDay(ctx: Context, start: String, end: String): String {
        val out = JSONObject()
        usagePerDay(ctx, start, end)?.forEach { (day, perPkg) -> out.put(day.toString(), Math.round(perPkg.values.sum() / 60000.0)) }
        return out.toString()
    }

    /**
     * JSON object { "YYYY-MM-DD": { "total": minutes, "breakdown": { "Social": minutes, ... } } }.
     * Categories come from each app's declared Play category (plus a few
     * well-known apps that don't declare one).
     */
    fun detailPerDay(ctx: Context, start: String, end: String): String {
        val out = JSONObject()
        val usage = usagePerDay(ctx, start, end) ?: return out.toString()
        val categoryCache = HashMap<String, String>()
        usage.forEach { (day, perPkg) ->
            val perCat = HashMap<String, Long>()
            perPkg.forEach { (pkg, ms) ->
                val cat = categoryCache.getOrPut(pkg) { categoryOf(ctx, pkg) }
                perCat[cat] = (perCat[cat] ?: 0L) + ms
            }
            val breakdown = JSONObject()
            perCat.forEach { (cat, ms) -> val m = Math.round(ms / 60000.0); if (m > 0) breakdown.put(cat, m) }
            out.put(day.toString(), JSONObject().put("total", Math.round(perPkg.values.sum() / 60000.0)).put("breakdown", breakdown))
        }
        return out.toString()
    }

    /**
     * Foreground milliseconds per app for each local date in [start, end].
     * Days with no events are left out: Android only keeps about a week of
     * detail, so "no data" must not be reported as zero screen time (today is
     * always included). Returns null without usage access.
     */
    private fun usagePerDay(ctx: Context, start: String, end: String): Map<LocalDate, Map<String, Long>>? {
        if (!hasAccess(ctx)) return null
        val zone = ZoneId.systemDefault()
        val startDate = LocalDate.parse(start)
        val endDate = LocalDate.parse(end)
        val rangeStart = startDate.atStartOfDay(zone).toInstant().toEpochMilli()
        val rangeEnd = minOf(endDate.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli(), System.currentTimeMillis())
        if (rangeEnd <= rangeStart) return emptyMap()

        val launchers = homePackages(ctx)
        val usm = ctx.getSystemService(UsageStatsManager::class.java)
        // Look back a little so an app already open at the range start is counted.
        val events = usm.queryEvents(rangeStart - 6 * 3600_000L, rangeEnd)
        val perDay = HashMap<LocalDate, HashMap<String, Long>>()
        val openSince = HashMap<String, Pair<String, Long>>() // "package/activity" -> (package, foreground start)

        fun add(pkg: String, from: Long, to: Long) {
            var a = maxOf(from, rangeStart)
            val b = minOf(to, rangeEnd)
            while (a < b) {
                val day = java.time.Instant.ofEpochMilli(a).atZone(zone).toLocalDate()
                val dayEnd = day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
                val segEnd = minOf(b, dayEnd)
                val m = perDay.getOrPut(day) { HashMap() }
                m[pkg] = (m[pkg] ?: 0L) + (segEnd - a)
                a = segEnd
            }
        }

        // A single uninterrupted stretch longer than this is treated as stale
        // (e.g. the phone was off without a screen-off event) and capped.
        val maxSegment = 6 * 3600_000L

        fun closeAll(at: Long) {
            openSince.values.forEach { (pkg, since) -> add(pkg, since, minOf(at, since + maxSegment)) }
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
                        openSince[key] = pkg to e.timeStamp
                    }
                }
                UsageEvents.Event.ACTIVITY_PAUSED, UsageEvents.Event.ACTIVITY_STOPPED -> {
                    openSince.remove(key)?.let { (p, since) -> add(p, since, minOf(e.timeStamp, since + maxSegment)) }
                }
                UsageEvents.Event.SCREEN_NON_INTERACTIVE, UsageEvents.Event.DEVICE_SHUTDOWN -> closeAll(e.timeStamp)
                // After a restart we don't know when apps that were open actually closed: drop them.
                UsageEvents.Event.DEVICE_STARTUP -> openSince.clear()
            }
        }
        // Whatever is still open counts until now (or the end of the range).
        closeAll(rangeEnd)

        val todayDate = LocalDate.now(zone)
        val result = LinkedHashMap<LocalDate, Map<String, Long>>()
        var d = startDate
        while (!d.isAfter(endDate)) {
            val m = perDay[d]
            if (m != null) result[d] = m else if (d == todayDate) result[d] = emptyMap()
            d = d.plusDays(1)
        }
        return result
    }

    /** Well-known apps that often don't declare a Play category. */
    private val KNOWN = mapOf(
        "com.whatsapp" to "Social", "com.instagram.android" to "Social", "com.facebook.katana" to "Social",
        "com.facebook.orca" to "Social", "com.snapchat.android" to "Social", "com.twitter.android" to "Social",
        "org.telegram.messenger" to "Social", "com.reddit.frontpage" to "Social", "com.discord" to "Social",
        "com.linkedin.android" to "Social", "com.pinterest" to "Social", "com.google.android.apps.messaging" to "Social",
        "com.google.android.youtube" to "Video", "com.netflix.mediaclient" to "Video", "in.startv.hotstar" to "Video",
        "com.amazon.avod.thirdpartyclient" to "Video", "com.mxtech.videoplayer.ad" to "Video", "tv.twitch.android.app" to "Video",
        "com.google.android.apps.docs" to "Productivity", "com.google.android.gm" to "Productivity",
        "com.microsoft.office.outlook" to "Productivity", "com.notion.id" to "Productivity",
        "com.google.android.keep" to "Productivity", "com.google.android.calendar" to "Productivity",
    )

    private fun categoryOf(ctx: Context, pkg: String): String {
        KNOWN[pkg]?.let { return it }
        val info = try {
            ctx.packageManager.getApplicationInfo(pkg, 0)
        } catch (_: PackageManager.NameNotFoundException) {
            return "Other"
        }
        return when (info.category) {
            ApplicationInfo.CATEGORY_SOCIAL -> "Social"
            ApplicationInfo.CATEGORY_VIDEO -> "Video"
            ApplicationInfo.CATEGORY_GAME -> "Games"
            ApplicationInfo.CATEGORY_PRODUCTIVITY -> "Productivity"
            else -> "Other"
        }
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
