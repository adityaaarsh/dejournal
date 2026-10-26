package io.dejournal.app

import android.os.Build
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import io.dejournal.app.reminders.Notifications
import io.dejournal.app.reminders.ReminderAlarms
import io.dejournal.app.reminders.ReminderStore
import io.dejournal.app.screentime.ScreenTime
import org.json.JSONObject

/**
 * `window.DeJournalNative` inside the web UI (see src/platform/native.ts in the
 * web project). Methods run on a WebView binder thread; anything touching the
 * UI hops to the main thread. Results of slow operations come back as
 * `dj-native` events via [emit].
 *
 * Only DeJournal's own bundled pages can reach this object: the WebView never
 * navigates to other sites (links open in the browser instead).
 */
class NativeBridge(private val activity: MainActivity, private val webView: WebView) {
    private val ctx = activity.applicationContext

    companion object {
        @Volatile
        private var active: NativeBridge? = null

        /** Tell a running UI that notification buttons were pressed. */
        fun notifyPendingActions() {
            active?.emit(JSONObject().put("type", "pending-actions"))
        }

        private val DATE = Regex("""\d{4}-\d{2}-\d{2}""")
    }

    init {
        active = this
    }

    fun detach() {
        if (active === this) active = null
    }

    fun emit(event: JSONObject) {
        webView.post {
            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('dj-native',{detail:$event}))", null)
        }
    }

    @JavascriptInterface
    fun getInfo(): String = JSONObject()
        .put("platform", "android")
        .put("appVersion", BuildConfig.VERSION_NAME)
        .put("sdkInt", Build.VERSION.SDK_INT)
        .toString()

    /* -------- Notifications & reminders -------- */

    @JavascriptInterface
    fun notificationPermission(): String = activity.notificationPermissionState()

    @JavascriptInterface
    fun requestNotificationPermission() {
        activity.runOnUiThread { activity.requestNotificationPermission() }
    }

    @JavascriptInterface
    fun canScheduleExactAlarms(): Boolean = ReminderAlarms.canScheduleExact(ctx)

    @JavascriptInterface
    fun openExactAlarmSettings() {
        activity.runOnUiThread { activity.openExactAlarmSettings() }
    }

    @JavascriptInterface
    fun scheduleReminders(json: String) {
        ReminderAlarms.replaceAll(ctx, ReminderStore.parseAlarms(json))
    }

    @JavascriptInterface
    fun takePendingActions(): String = ReminderStore.takeActions(ctx)

    @JavascriptInterface
    fun showNotification(title: String, body: String) {
        Notifications.showSimple(ctx, title.take(120), body.take(400))
    }

    /* -------- Screen time -------- */

    @JavascriptInterface
    fun usageAccessGranted(): Boolean = ScreenTime.hasAccess(ctx)

    @JavascriptInterface
    fun openUsageAccessSettings() {
        activity.runOnUiThread { activity.openUsageAccessSettings() }
    }

    @JavascriptInterface
    fun getScreenTime(startDate: String, endDate: String): String {
        if (!DATE.matches(startDate) || !DATE.matches(endDate)) return "{}"
        return try {
            ScreenTime.minutesPerDay(ctx, startDate, endDate)
        } catch (e: Exception) {
            "{}"
        }
    }

    /** Per-day total plus minutes per app category (for the Today pie chart). */
    @JavascriptInterface
    fun getScreenTimeDetail(startDate: String, endDate: String): String {
        if (!DATE.matches(startDate) || !DATE.matches(endDate)) return "{}"
        return try {
            ScreenTime.detailPerDay(ctx, startDate, endDate)
        } catch (e: Exception) {
            "{}"
        }
    }

    /* -------- Files, system UI, links -------- */

    @JavascriptInterface
    fun saveFile(fileName: String, mime: String, base64: String) {
        val bytes = try {
            Base64.decode(base64, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            emit(JSONObject().put("type", "file-saved").put("ok", false).put("error", "Could not prepare the file."))
            return
        }
        val safeName = fileName.replace(Regex("""[\\/:*?"<>|]"""), "_").take(120)
        activity.runOnUiThread { activity.startSaveFile(safeName, mime, bytes) }
    }

    @JavascriptInterface
    fun setSystemBars(theme: String) {
        activity.runOnUiThread { activity.applySystemBars(light = theme == "light") }
    }

    @JavascriptInterface
    fun openExternal(url: String) {
        activity.runOnUiThread { activity.openExternal(url) }
    }
}
