# CineCub Native Android App

A production-grade native Android WebView wrapper built with Kotlin, tailored specifically for [CineCub](https://cinecub.stream).

---

## 📱 Project Specifications

- **Application Name**: `CineCub`
- **Application ID / Package**: `online.cinecub.app`
- **Minimum SDK**: `API 24` (Android 7.0 Nougat)
- **Target SDK**: `API 34` (Android 14)
- **Build System**: Gradle Kotlin DSL (`build.gradle.kts`)
- **Language**: Kotlin 1.9+

---

## ✨ Features & Architecture

### 1. Robust HTML5 Fullscreen Video
- Implements `WebChromeClient.onShowCustomView()` and `WebChromeClient.onHideCustomView()`.
- Smoothly moves video elements into a dedicated `FrameLayout` (`customViewContainer`).
- Enables immersive system UI hiding with `WindowInsetsControllerCompat`.
- Keeps screen alive with `FLAG_KEEP_SCREEN_ON` during video playback.

### 2. Modern Back Navigation
- Uses AndroidX `onBackPressedDispatcher` with `OnBackPressedCallback`.
- Seamless 3-tier hierarchy:
  1. **Fullscreen Video Active**: Exits fullscreen and returns to web layout.
  2. **WebView History Available**: Navigates back via `webView.goBack()`.
  3. **Root Page**: Prompts double-tap to exit to prevent accidental app closes.

### 3. Smart Pull-to-Refresh
- Integrated `SwipeRefreshLayout` with CineCub brand gradient colors (`#9D4EDD`, `#C77DFF`, `#06D6A0`).
- Reloads the page on swipe down and automatically dismisses the spinner upon completion.

### 4. Resilient Offline & Error Handling
- Automatic network connectivity checks with `ConnectivityManager` & `NetworkCapabilities`.
- Clean, themed offline view with retry button whenever network is unavailable.
- Offline cache fallback (`LOAD_CACHE_ELSE_NETWORK`).

### 5. High-Performance Web Settings
- JavaScript, DOM Storage, and Database Storage enabled.
- Mixed Content mode allowed (`MIXED_CONTENT_ALWAYS_ALLOW`) for streaming sources.
- Autoplay enabled without requiring user gesture (`mediaPlaybackRequiresUserGesture = false`).
- Hardware acceleration enabled throughout the app.

---

## 🛠️ How to Build

### Using Android Studio
1. Open Android Studio.
2. Select **Open** and choose the `android-app` folder.
3. Wait for Gradle sync to complete.
4. Click **Run** (`Shift + F10`) or **Build > Build Bundle(s) / APK(s) > Build APK(s)**.

### Using Command Line
```bash
cd android-app
./gradlew assembleDebug
```
The resulting debug APK will be located at:
`app/build/outputs/apk/debug/app-debug.apk`

To build the release APK:
```bash
./gradlew assembleRelease
```

### Release Signing (Production)
By default, release builds fall back to the debug keystore when no release keystore is configured. For production APKs:

1. Generate a release keystore:
   ```bash
   keytool -genkey -v -keystore release.keystore -alias cinecub -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Copy `keystore.properties.example` to `keystore.properties` and fill in your credentials.
3. Place `release.keystore` in the `android-app/` directory.
4. Rebuild with `./gradlew assembleRelease` — the release signing config is picked up automatically.

Never commit `keystore.properties` or `*.keystore` files to version control.
