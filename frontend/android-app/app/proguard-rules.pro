# Proguard rules for StreamHeaven
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class online.streamheaven.app.MainActivity$* {
    *;
}
-dontwarn android.webkit.**
