package io.dejournal.app.reminders

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** One scheduled reminder notification (mirrors NativeAlarm in the web code). */
data class Alarm(
    val key: String,
    val id: String,
    val date: String,
    val title: String,
    val body: String,
    val at: Long,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("key", key).put("id", id).put("date", date)
        .put("title", title).put("body", body).put("at", at)

    companion object {
        fun fromJson(o: JSONObject) = Alarm(
            key = o.getString("key"),
            id = o.getString("id"),
            date = o.getString("date"),
            title = o.optString("title", "Reminder"),
            body = o.optString("body", ""),
            at = o.getLong("at"),
        )
    }
}

/**
 * Small persistent store (SharedPreferences) for:
 * - the current alarm schedule (so alarms survive reboots),
 * - keys already notified (so a re-sync never repeats a notification),
 * - Snooze / Done presses waiting to be applied by the UI.
 */
object ReminderStore {
    private const val PREFS = "reminders"
    private const val KEY_ALARMS = "alarms"
    private const val KEY_FIRED = "fired"
    private const val KEY_ACTIONS = "pending_actions"
    private const val MAX_FIRED = 300

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @Synchronized
    fun alarms(ctx: Context): List<Alarm> = parseAlarms(prefs(ctx).getString(KEY_ALARMS, "[]") ?: "[]")

    @Synchronized
    fun saveAlarms(ctx: Context, alarms: List<Alarm>) {
        val arr = JSONArray()
        alarms.forEach { arr.put(it.toJson()) }
        prefs(ctx).edit().putString(KEY_ALARMS, arr.toString()).apply()
    }

    fun parseAlarms(json: String): List<Alarm> {
        val arr = try { JSONArray(json) } catch (_: Exception) { return emptyList() }
        return (0 until arr.length()).mapNotNull { i ->
            try { Alarm.fromJson(arr.getJSONObject(i)) } catch (_: Exception) { null }
        }
    }

    @Synchronized
    fun wasFired(ctx: Context, key: String): Boolean = fired(ctx).contains(key)

    @Synchronized
    fun markFired(ctx: Context, key: String) {
        val list = fired(ctx).toMutableList()
        if (key in list) return
        list.add(key)
        val trimmed = list.takeLast(MAX_FIRED)
        prefs(ctx).edit().putString(KEY_FIRED, JSONArray(trimmed).toString()).apply()
    }

    private fun fired(ctx: Context): List<String> {
        val arr = try { JSONArray(prefs(ctx).getString(KEY_FIRED, "[]")) } catch (_: Exception) { JSONArray() }
        return (0 until arr.length()).map { arr.getString(it) }
    }

    @Synchronized
    fun addAction(ctx: Context, action: JSONObject) {
        val arr = try { JSONArray(prefs(ctx).getString(KEY_ACTIONS, "[]")) } catch (_: Exception) { JSONArray() }
        arr.put(action)
        prefs(ctx).edit().putString(KEY_ACTIONS, arr.toString()).apply()
    }

    /** Return and clear the queued actions. */
    @Synchronized
    fun takeActions(ctx: Context): String {
        val json = prefs(ctx).getString(KEY_ACTIONS, "[]") ?: "[]"
        prefs(ctx).edit().putString(KEY_ACTIONS, "[]").apply()
        return json
    }
}
