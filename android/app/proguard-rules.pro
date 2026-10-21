# Methods called from JavaScript must keep their names.
-keepclassmembers class io.dejournal.app.NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
