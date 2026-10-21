package io.dejournal.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.addCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import io.dejournal.app.reminders.Notifications
import org.json.JSONObject

/**
 * The only screen: a WebView showing the bundled DeJournal UI, plus the
 * native glue it needs (permissions, camera, file picker, saving files,
 * system bars, back button, notification taps).
 */
class MainActivity : ComponentActivity() {

    companion object {
        const val EXTRA_PATH = "path"
        private const val TAG = "DeJournal"
        private const val PREFS = "app"
        private const val KEY_ASKED_NOTIFICATIONS = "asked_notifications"
    }

    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private lateinit var bridge: NativeBridge
    private lateinit var assetLoader: WebViewAssetLoader

    private var pageLoaded = false
    private var pendingPath: String? = null

    private var pendingWebPermission: PermissionRequest? = null
    private var pendingGeo: Pair<String, GeolocationPermissions.Callback>? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingSave: ByteArray? = null

    /* ---------------- Activity result launchers ---------------- */

    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_ASKED_NOTIFICATIONS, true).apply()
        bridge.emit(JSONObject().put("type", "notification-permission").put("state", notificationPermissionState()))
    }

    private val cameraPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        pendingWebPermission?.let { if (granted) it.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else it.deny() }
        pendingWebPermission = null
    }

    private val locationPermission = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        val ok = result.values.any { it }
        pendingGeo?.let { (origin, callback) -> callback.invoke(origin, ok, false) }
        pendingGeo = null
    }

    private val pickImage = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> deliverFile(uri) }
    private val pickFile = registerForActivityResult(ActivityResultContracts.GetContent()) { uri -> deliverFile(uri) }

    private val saveJson = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri -> finishSave(uri) }
    private val saveOther = registerForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri -> finishSave(uri) }

    /* ---------------- Lifecycle ---------------- */

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        Notifications.ensureChannels(this)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        assetLoader = WebAssets.loader(this)
        root = FrameLayout(this).apply { setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.dj_bg_dark)) }
        webView = WebView(this).apply {
            setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.dj_bg_dark))
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        }
        root.addView(webView)
        setContentView(root)

        // Keep the UI clear of the status bar, navigation bar, notch and keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime(),
            )
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(false)
            builtInZoomControls = false
            setGeolocationEnabled(true)
            userAgentString = "$userAgentString DeJournalAndroid/${BuildConfig.VERSION_NAME}"
        }

        bridge = NativeBridge(this, webView)
        webView.addJavascriptInterface(bridge, "DeJournalNative")
        webView.webViewClient = AppWebViewClient()
        webView.webChromeClient = AppChromeClient()

        onBackPressedDispatcher.addCallback(this) {
            // 1) let the UI close an open sheet/viewer, 2) go back in the UI, 3) leave the app.
            webView.evaluateJavascript("(window.__djHandleBack && window.__djHandleBack()) ? 'true' : 'false'") { result ->
                if (result == "\"true\"") return@evaluateJavascript
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                    isEnabled = true
                }
            }
        }

        val restored = savedInstanceState?.let { webView.restoreState(it) } != null
        if (!restored) webView.loadUrl(WebAssets.urlFor(intent.getStringExtra(EXTRA_PATH) ?: "/"))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(EXTRA_PATH)?.let { navigate(it) }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        if (pageLoaded) bridge.emit(JSONObject().put("type", "resume"))
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        bridge.detach()
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }

    /** Navigate inside the UI (used by notification taps). */
    private fun navigate(path: String) {
        if (!path.startsWith("/")) return
        if (pageLoaded) {
            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('dj-navigate',{detail:${JSONObject.quote(path)}}))", null)
        } else {
            pendingPath = path
        }
    }

    /* ---------------- Called by NativeBridge (main thread) ---------------- */

    fun notificationPermissionState(): String {
        if (Notifications.canPost(this)) return "granted"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            if (granted) return "denied" // permission granted but notifications switched off in settings
            val asked = getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(KEY_ASKED_NOTIFICATIONS, false)
            if (!asked || shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) return "default"
        }
        return "denied"
    }

    fun requestNotificationPermission() {
        val state = notificationPermissionState()
        if (state == "default" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            return
        }
        if (state == "denied") {
            // Android won't show the prompt again — send the user to the app's notification settings.
            val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
            safeStart(intent)
        }
        bridge.emit(JSONObject().put("type", "notification-permission").put("state", state))
    }

    fun openExactAlarmSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            safeStart(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName")))
        }
    }

    fun openUsageAccessSettings() {
        val direct = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:$packageName"))
        if (!safeStart(direct, quiet = true)) safeStart(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
    }

    fun startSaveFile(fileName: String, mime: String, bytes: ByteArray) {
        pendingSave = bytes
        try {
            if (mime == "application/json") saveJson.launch(fileName) else saveOther.launch(fileName)
        } catch (e: ActivityNotFoundException) {
            pendingSave = null
            bridge.emit(JSONObject().put("type", "file-saved").put("ok", false).put("error", "No app available to save files."))
        }
    }

    private fun finishSave(uri: Uri?) {
        val bytes = pendingSave
        pendingSave = null
        if (uri == null || bytes == null) {
            bridge.emit(JSONObject().put("type", "file-saved").put("ok", false))
            return
        }
        try {
            contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: error("Could not open the file")
            bridge.emit(JSONObject().put("type", "file-saved").put("ok", true))
        } catch (e: Exception) {
            Log.w(TAG, "Save failed", e)
            bridge.emit(JSONObject().put("type", "file-saved").put("ok", false).put("error", "Could not write the file."))
        }
    }

    fun applySystemBars(light: Boolean) {
        val bg = ContextCompat.getColor(this, if (light) R.color.dj_bg_light else R.color.dj_bg_dark)
        root.setBackgroundColor(bg)
        webView.setBackgroundColor(bg)
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = light
            isAppearanceLightNavigationBars = light
        }
    }

    fun openExternal(url: String) {
        val uri = Uri.parse(url)
        if (uri.scheme !in setOf("http", "https", "mailto")) return
        safeStart(Intent(Intent.ACTION_VIEW, uri))
    }

    private fun safeStart(intent: Intent, quiet: Boolean = false): Boolean = try {
        startActivity(intent)
        true
    } catch (e: ActivityNotFoundException) {
        if (!quiet) Toast.makeText(this, R.string.no_app_to_open, Toast.LENGTH_SHORT).show()
        false
    } catch (e: SecurityException) {
        false
    }

    private fun deliverFile(uri: Uri?) {
        fileCallback?.onReceiveValue(uri?.let { arrayOf(it) })
        fileCallback = null
    }

    private fun hasPermission(p: String) = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

    /* ---------------- WebView clients ---------------- */

    private inner class AppWebViewClient : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
            assetLoader.shouldInterceptRequest(request.url)

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (request.url.host == WebViewAssetLoader.DEFAULT_DOMAIN) return false
            // Never load other sites inside the app (keeps the native bridge private).
            openExternal(request.url.toString())
            return true
        }

        override fun onPageFinished(view: WebView, url: String) {
            pageLoaded = true
            pendingPath?.let {
                pendingPath = null
                navigate(it)
            }
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // The web renderer crashed or was killed to free memory — rebuild the screen.
            Log.w(TAG, "WebView renderer gone (crash=${detail.didCrash()})")
            recreate()
            return true
        }
    }

    private inner class AppChromeClient : WebChromeClient() {
        override fun onPermissionRequest(request: PermissionRequest) {
            runOnUiThread {
                val fromApp = request.origin.host == WebViewAssetLoader.DEFAULT_DOMAIN
                val wantsCamera = PermissionRequest.RESOURCE_VIDEO_CAPTURE in request.resources
                when {
                    !fromApp || !wantsCamera -> request.deny()
                    hasPermission(Manifest.permission.CAMERA) -> request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                    else -> {
                        pendingWebPermission?.deny()
                        pendingWebPermission = request
                        cameraPermission.launch(Manifest.permission.CAMERA)
                    }
                }
            }
        }

        override fun onPermissionRequestCanceled(request: PermissionRequest) {
            if (pendingWebPermission == request) pendingWebPermission = null
        }

        override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
            if (Uri.parse(origin).host != WebViewAssetLoader.DEFAULT_DOMAIN) {
                callback.invoke(origin, false, false)
                return
            }
            if (hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION) || hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)) {
                callback.invoke(origin, true, false)
            } else {
                pendingGeo = origin to callback
                locationPermission.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
            }
        }

        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
            val accept = params.acceptTypes.joinToString(",").lowercase()
            return try {
                if (accept.contains("image") && !accept.contains("json") && !accept.contains("calendar")) {
                    pickImage.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                } else {
                    pickFile.launch("*/*")
                }
                true
            } catch (e: ActivityNotFoundException) {
                fileCallback = null
                false
            }
        }

        override fun onConsoleMessage(message: ConsoleMessage): Boolean {
            if (BuildConfig.DEBUG) Log.d(TAG, "${message.messageLevel()}: ${message.message()} (${message.sourceId()}:${message.lineNumber()})")
            return true
        }
    }
}
