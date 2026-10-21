package io.dejournal.app

import android.content.Context
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.IOException
import java.io.InputStream

/**
 * Serves the bundled DeJournal UI (assets/www) from
 * https://appassets.androidplatform.net/ — a secure origin, so IndexedDB,
 * camera access and other modern web APIs work, and nothing touches the network.
 *
 * Any path that isn't a real file (e.g. /calendar, /notes/123) gets index.html,
 * because the UI uses client-side routing.
 */
object WebAssets {
    const val ORIGIN = "https://${WebViewAssetLoader.DEFAULT_DOMAIN}"
    private const val ROOT = "www"

    fun loader(context: Context): WebViewAssetLoader =
        WebViewAssetLoader.Builder()
            .addPathHandler("/", SpaPathHandler(context.applicationContext))
            .build()

    fun urlFor(path: String): String {
        val clean = if (path.startsWith("/")) path else "/$path"
        return ORIGIN + clean
    }

    private class SpaPathHandler(private val context: Context) : WebViewAssetLoader.PathHandler {
        override fun handle(path: String): WebResourceResponse? {
            val p = path.trimStart('/').substringBefore('?').substringBefore('#')
            val isFile = p.isNotEmpty() && p.substringAfterLast('/').contains('.')
            if (isFile) {
                open("$ROOT/$p")?.let { return response(p, it) }
                return WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), null)
            }
            // Client-side route → the app shell.
            return open("$ROOT/index.html")?.let { response("index.html", it, noCache = true) }
        }

        private fun open(assetPath: String): InputStream? =
            try {
                context.assets.open(assetPath)
            } catch (_: IOException) {
                null
            }

        private fun response(name: String, data: InputStream, noCache: Boolean = false): WebResourceResponse {
            val mime = mimeType(name)
            val encoding = if (mime.startsWith("text/") || mime.endsWith("json") || mime.endsWith("javascript") || mime.endsWith("xml")) "utf-8" else null
            val headers = buildMap {
                // Hashed assets never change; index.html must always be fresh after an app update.
                put("Cache-Control", if (noCache) "no-cache" else "max-age=31536000, immutable")
            }
            return WebResourceResponse(mime, encoding, 200, "OK", headers, data)
        }
    }

    fun mimeType(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
        "html" -> "text/html"
        "js", "mjs" -> "text/javascript"
        "css" -> "text/css"
        "json" -> "application/json"
        "webmanifest" -> "application/manifest+json"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "gif" -> "image/gif"
        "webp" -> "image/webp"
        "ico" -> "image/x-icon"
        "woff2" -> "font/woff2"
        "woff" -> "font/woff"
        "ttf" -> "font/ttf"
        "txt" -> "text/plain"
        else -> "application/octet-stream"
    }
}
