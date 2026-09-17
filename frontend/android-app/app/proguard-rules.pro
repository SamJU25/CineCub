# Proguard rules for StreamHeaven / CineCub

# Preserve annotations needed by Android WebView JavaScriptInterface
-keepattributes *Annotation*
-keepattributes JavascriptInterface
-keepattributes SourceFile,LineNumberTable

# Keep all JavascriptInterface methods
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep the WebAppInterface class and all its methods explicitly
-keep class online.streamheaven.app.MainActivity$WebAppInterface {
    public *;
    *;
}

# Keep any class with JavascriptInterface methods
-keep public class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep Google Sign-In and Play Services classes
-keep class com.google.android.gms.auth.api.signin.** { *; }
-keep class com.google.android.gms.common.api.** { *; }

-dontwarn android.webkit.**

