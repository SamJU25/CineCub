package online.streamheaven.app

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Message
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import java.io.ByteArrayInputStream
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.JsResult
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.RequiresApi
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.android.material.button.MaterialButton
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    companion object {
        const val TARGET_URL = "https://cinecub.stream"
        const val GOOGLE_WEB_CLIENT_ID = "307176410598-7mlt6jtv723i2ki6eri6iu9cjqtp1r1v.apps.googleusercontent.com"
        private const val BACK_PRESS_INTERVAL = 2000L
    }

    private lateinit var webView: WebView
    private lateinit var webViewContainer: FrameLayout
    private lateinit var customViewContainer: FrameLayout
    private lateinit var pageProgressBar: ProgressBar
    private lateinit var offlineLayout: LinearLayout
    private lateinit var btnRetry: MaterialButton

    private lateinit var googleSignInClient: GoogleSignInClient

    private val googleSignInLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
            try {
                val account: GoogleSignInAccount = task.getResult(ApiException::class.java)
                val idToken = account.idToken
                if (!idToken.isNullOrBlank()) {
                    val quotedToken = JSONObject.quote(idToken)
                    webView.evaluateJavascript(
                        "try { if (window.handleNativeGoogleSignInSuccess) { window.handleNativeGoogleSignInSuccess($quotedToken); } } catch(e){}",
                        null
                    )
                } else {
                    launchGoogleCustomTab()
                }
            } catch (e: ApiException) {
                val statusCode = e.statusCode
                if (statusCode == 12501) {
                    // User canceled
                    webView.evaluateJavascript(
                        "try { if (window.handleNativeGoogleSignInError) { window.handleNativeGoogleSignInError('Cancelled'); } } catch(e){}",
                        null
                    )
                } else {
                    // Developer error (10) or missing SHA-1 on device -> fallback to Chrome Custom Tab!
                    launchGoogleCustomTab()
                }
            } catch (e: Exception) {
                launchGoogleCustomTab()
            }
        }

    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
    private var chromeClient: WebChromeClient? = null
    private var originalOrientation: Int = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED

    private var isPageError = false
    private var backPressedTime: Long = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep status bar and navigation dark
        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.statusBarColor = Color.parseColor("#07050A")
        window.navigationBarColor = Color.parseColor("#07050A")

        setContentView(R.layout.activity_main)

        initViews()
        setupWebView()
        setupBackNavigation()
        setupOfflineHandling()
        setupGoogleSignIn()
        handleAuthIntent(intent)

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            loadInitialUrl()
        }

        // Check for App Updates in Background
        AppUpdater.checkForUpdate(this)
    }

    private fun setupGoogleSignIn() {
        try {
            val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(GOOGLE_WEB_CLIENT_ID)
                .requestEmail()
                .requestProfile()
                .build()
            googleSignInClient = GoogleSignIn.getClient(this, gso)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleAuthIntent(intent)
    }

    private fun handleAuthIntent(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme == "cinecub" && data.host == "auth") {
            val token = data.getQueryParameter("token")
                ?: data.getQueryParameter("id_token")
                ?: data.getQueryParameter("access_token")
            if (!token.isNullOrBlank()) {
                val quoted = JSONObject.quote(token)
                webView.evaluateJavascript(
                    "try { if (window.handleNativeGoogleSignInSuccess) { window.handleNativeGoogleSignInSuccess($quoted); } } catch(e){}",
                    null
                )
            }
        }
    }

    fun launchGoogleCustomTab() {
        runOnUiThread {
            try {
                val authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" +
                        "client_id=" + Uri.encode(GOOGLE_WEB_CLIENT_ID) +
                        "&redirect_uri=" + Uri.encode("https://cinecub.stream/auth/google/callback") +
                        "&response_type=token" +
                        "&scope=" + Uri.encode("email profile openid")

                val customTabsIntent = CustomTabsIntent.Builder()
                    .setShowTitle(true)
                    .build()
                customTabsIntent.launchUrl(this, Uri.parse(authUrl))
            } catch (e: Exception) {
                try {
                    val authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" +
                            "client_id=" + Uri.encode(GOOGLE_WEB_CLIENT_ID) +
                            "&redirect_uri=" + Uri.encode("https://cinecub.stream/auth/google/callback") +
                            "&response_type=token" +
                            "&scope=" + Uri.encode("email profile openid")
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(authUrl))
                    startActivity(intent)
                } catch (_: Exception) {}
            }
        }
    }

    private fun initViews() {
        webView = findViewById(R.id.webView)
        webViewContainer = findViewById(R.id.webViewContainer)
        customViewContainer = findViewById(R.id.customViewContainer)
        pageProgressBar = findViewById(R.id.pageProgressBar)
        offlineLayout = findViewById(R.id.offlineLayout)
        btnRetry = findViewById(R.id.btnRetry)

        originalOrientation = requestedOrientation
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings = webView.settings

        // Enable Core Web Capabilities (Strict Sandbox)
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false

        // Viewport & Scaling
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.setSupportZoom(false)
        settings.builtInZoomControls = false
        settings.displayZoomControls = false

        // Media & Audio/Video Playback
        settings.mediaPlaybackRequiresUserGesture = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }

        // Cache & Rendering Optimization
        if (isNetworkAvailable()) {
            settings.cacheMode = WebSettings.LOAD_DEFAULT
        } else {
            settings.cacheMode = WebSettings.LOAD_CACHE_ELSE_NETWORK
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.offscreenPreRaster = true
        }
        settings.setGeolocationEnabled(false)
        @Suppress("DEPRECATION")
        settings.setRenderPriority(WebSettings.RenderPriority.HIGH)

        // Anti-Popup Controls: Prevent iframes from opening unwanted popup windows
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.setSupportMultipleWindows(false)

        // Use standard system Chrome User Agent so Cloudflare Bot Fight Mode never flags the app
        val defaultUserAgent = settings.userAgentString
        settings.userAgentString = defaultUserAgent

        // Cookies
        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(webView, true)
        }

        // Enable Hardware Acceleration & Responsive Touch Focus
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        webView.overScrollMode = View.OVER_SCROLL_NEVER
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false
        webView.isFocusable = true
        webView.isFocusableInTouchMode = true
        webView.isHapticFeedbackEnabled = true

        // Instantly request focus on touch down so soft keyboard launches immediately
        webView.setOnTouchListener { v, event ->
            if (event.action == MotionEvent.ACTION_DOWN) {
                if (!v.hasFocus()) {
                    v.requestFocus()
                }
            }
            false
        }

        // Javascript Interface for Native Features (Share Sheet, Environment, etc.)
        val bridge = WebAppInterface(this)
        webView.addJavascriptInterface(bridge, "AndroidShare")
        webView.addJavascriptInterface(bridge, "CineCubAndroid")
        webView.addJavascriptInterface(bridge, "CineCubNativeApp")
        webView.addJavascriptInterface(bridge, "StreamHeavenAndroid")
        webView.addJavascriptInterface(bridge, "StreamHeavenNativeApp")

        // WebChromeClient (Handles Fullscreen Videos, Progress, and Permissions)
        val client = object : WebChromeClient() {

            override fun onCreateWindow(
                view: WebView?,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: Message?
            ): Boolean {
                // Reject all popup window creation requests from embedded iframes
                return false
            }

            override fun onJsBeforeUnload(
                view: WebView?,
                url: String?,
                message: String?,
                result: JsResult?
            ): Boolean {
                // Automatically suppress "Confirm Navigation" popups from third-party players
                result?.cancel()
                return true
            }

            override fun onJsAlert(
                view: WebView?,
                url: String?,
                message: String?,
                result: JsResult?
            ): Boolean {
                val host = Uri.parse(url ?: "").host?.lowercase() ?: ""
                if (isTrustedStreamHeavenHost(host)) {
                    return super.onJsAlert(view, url, message, result)
                }
                // Suppress rogue alerts from third-party embed iframes
                result?.cancel()
                return true
            }

            override fun onJsConfirm(
                view: WebView?,
                url: String?,
                message: String?,
                result: JsResult?
            ): Boolean {
                val host = Uri.parse(url ?: "").host?.lowercase() ?: ""
                if (isTrustedStreamHeavenHost(host)) {
                    return super.onJsConfirm(view, url, message, result)
                }
                // Suppress rogue confirms from third-party embed iframes
                result?.cancel()
                return true
            }

            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                super.onProgressChanged(view, newProgress)
                if (newProgress < 100) {
                    if (pageProgressBar.visibility != View.VISIBLE) {
                        pageProgressBar.visibility = View.VISIBLE
                    }
                    pageProgressBar.progress = newProgress
                } else {
                    pageProgressBar.visibility = View.GONE
                }
            }

            override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                if (customView != null) {
                    callback?.onCustomViewHidden()
                    return
                }

                customView = view
                customViewCallback = callback
                originalOrientation = requestedOrientation

                // Hide WebView container, attach full-screen video
                webViewContainer.visibility = View.GONE
                customViewContainer.addView(
                    customView,
                    FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                )
                customViewContainer.visibility = View.VISIBLE

                // Hide System UI (Full Immersion)
                setFullscreenImmersive(true)

                // Keep screen on during video playback
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }

            override fun onHideCustomView() {
                if (customView == null) return

                // Remove video view and restore normal UI
                customViewContainer.removeView(customView)
                customViewContainer.visibility = View.GONE
                webViewContainer.visibility = View.VISIBLE

                // Restore System UI
                setFullscreenImmersive(false)

                // Restore screen lock & orientation
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                requestedOrientation = originalOrientation

                customViewCallback?.onCustomViewHidden()
                customView = null
                customViewCallback = null
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                // Only auto-grant permissions required for DRM/media playback
                // (protected media). Deny everything else (camera, mic, etc.).
                val resources = request?.resources ?: return
                val granted = resources.filter {
                    it == PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID
                }
                if (granted.size == resources.size && granted.isNotEmpty()) {
                    request.grant(granted.toTypedArray())
                } else {
                    request.deny()
                }
            }
        }
        chromeClient = client
        webView.webChromeClient = client

        // WebViewClient (Handles Navigation, Ad Interception, Intents, and Error States)
        webView.webViewClient = object : WebViewClient() {

            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url?.toString()?.lowercase() ?: return super.shouldInterceptRequest(view, request)
                if (isAdResource(url)) {
                    // Drop unwanted ad network and tracker requests immediately
                    return WebResourceResponse(
                        "text/plain",
                        "UTF-8",
                        ByteArrayInputStream(ByteArray(0))
                    )
                }
                return super.shouldInterceptRequest(view, request)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                val isForMainFrame = request.isForMainFrame
                return handleUrlNavigation(url, isForMainFrame)
            }

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                if (url == null) return false
                // Old API only: treat a navigation targeting the current top-level URL as main frame.
                return handleUrlNavigation(url, url == view?.url || url == webView.url)
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                isPageError = false
                view?.evaluateJavascript("document.documentElement.classList.add('is-app-env'); document.documentElement.classList.remove('is-web-env'); try{localStorage.setItem('is_app_env','1');}catch(e){}", null)
                view?.evaluateJavascript("try{window.onbeforeunload=null;Object.defineProperty(window,'onbeforeunload',{get:function(){return null;},set:function(){return false;},configurable:false});}catch(e){}", null)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                pageProgressBar.visibility = View.GONE
                view?.evaluateJavascript("document.documentElement.classList.add('is-app-env'); document.documentElement.classList.remove('is-web-env'); try{localStorage.setItem('is_app_env','1');}catch(e){}", null)
                view?.evaluateJavascript("try{window.onbeforeunload=null;Object.defineProperty(window,'onbeforeunload',{get:function(){return null;},set:function(){return false;},configurable:false});}catch(e){}", null)

                if (!isPageError) {
                    offlineLayout.visibility = View.GONE
                    webViewContainer.visibility = View.VISIBLE
                }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    isPageError = true
                    showOfflineView()
                }
            }

            @Deprecated("Deprecated in Java")
            override fun onReceivedError(
                view: WebView?,
                errorCode: Int,
                description: String?,
                failingUrl: String?
            ) {
                super.onReceivedError(view, errorCode, description, failingUrl)
                if (failingUrl == webView.url || failingUrl == TARGET_URL) {
                    isPageError = true
                    showOfflineView()
                }
            }

            override fun onRenderProcessGone(
                view: WebView?,
                detail: RenderProcessGoneDetail?
            ): Boolean {
                if (view != null) {
                    (view.parent as? ViewGroup)?.removeView(view)
                    try {
                        view.destroy()
                    } catch (_: Exception) {}
                }
                setupWebView()
                loadInitialUrl()
                return true
            }
        }
    }

    /**
     * Checks if a network request URL belongs to known video player ad networks, popunders, or trackers.
     */
    private fun isAdResource(url: String): Boolean {
        val adKeywords = arrayOf(
            "popcash", "popads", "monetag", "adsterra", "exoclick", "propellerads",
            "juicyads", "trafficjunky", "adsco.re", "onclick", "syndication",
            "adkeeper", "admaven", "clickadu", "hilltopads", "richpush", "evadav",
            "ezmob", "bet365", "1xbet", "parimatch", "mostbet", "melbet", "linebet",
            "dafabet", "stake.com", "pin-up", "adservice", "adtrue", "adnxs",
            "cpmstar", "a-ads", "yllix", "bidvertiser", "ad-maven", "trafficstars",
            "zeroredirect", "clicksor", "adcash", "inpagepush", "adnium", "vulkan",
            "doubleclick.net", "googleads.g.doubleclick.net", "trafficfactory",
            "tsyndicate", "creative.ad", "trackjs", "adnxs.com"
        )
        for (keyword in adKeywords) {
            if (url.contains(keyword)) {
                return true
            }
        }
        return false
    }

    /**
     * Navigation and intent router. Prevents iframe players from hijacking the parent window,
     * opening external browser popups, or launching external betting apps.
     */
    private fun handleUrlNavigation(url: String, isForMainFrame: Boolean = false): Boolean {
        val uri = Uri.parse(url)
        val scheme = uri.scheme?.lowercase() ?: ""
        val host = uri.host?.lowercase() ?: ""

        // 2. User-Initiated Social & External Contact (Telegram Community, Email, Phone, Socials)
        if (host == "t.me" || host == "telegram.me" || scheme == "mailto" || scheme == "tel" ||
            host == "facebook.com" || host == "x.com" || host == "twitter.com" || host == "instagram.com"
        ) {
            return try {
                val intent = Intent(Intent.ACTION_VIEW, uri)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(intent)
                true
            } catch (e: Exception) {
                false
            }
        }

        // Deep link handler for internal auth scheme
        if (scheme == "cinecub" && host == "auth") {
            handleAuthIntent(Intent(Intent.ACTION_VIEW, uri))
            return true
        }

        // Only http/https links are allowed to navigate inside the WebView.
        if (scheme != "http" && scheme != "https") {
            return true
        }

        // 1. Internal App & Trusted Infrastructure Domains -> Allow inside WebView
        if (isTrustedStreamHeavenHost(host) ||
            isSuffixHost(host, "firebaseapp.com") ||
            isSuffixHost(host, "googleapis.com") ||
            isSuffixHost(host, "tmdb.org") ||
            isSuffixHost(host, "themoviedb.org") ||
            isSuffixHost(host, "cloudflareinsights.com") ||
            isSuffixHost(host, "jsdelivr.net")
        ) {
            return false
        }

        // 3. Main Frame Navigation Guard: Never let an external ad/betting URL take over the main app window!
        if (isForMainFrame) {
            return true
        }

        // 4. Video Player Embed & Subtitle Hosts -> Allow inside WebView subframe (iframe)
        val videoEmbedHosts = arrayOf(
            "vidlink.pro", "vidsrc.me", "vidsrc.to", "vidsrc.net", "vidsrc.in", "vidsrc.pm", "vidsrc.xyz",
            "vidsrc.cc", "vidsrc.stream", "vidsrc.vip", "vidsrc.su", "hexa.su", "vidsrcme.ru", "vidsrc.sbs", "streamvid.net", "vidcore.org",
            "autoembed.co", "autoembed.cc", "autoembed.to", "multiembed.mov", "streamingnow.mov", "cinesrc.st",
            "embed.su", "2embed.cc", "2embed.skin", "superembed.stream", "smashystream.com", "smashystream.xyz",
            "anyembed.xyz", "videm.xyz", "streamsrcs.2embed.cc", "vsembed.ru", "cloudorchestranova.com",
            "rive.stream", "videasy.net", "player.autoembed.cc", "player.autoembed.co", "cloudnestra.com", "2embed.org",
            "opensubtitles.org", "opensubtitles.com", "subdl.com"
        )
        for (embedHost in videoEmbedHosts) {
            if (isSuffixHost(host, embedHost)) {
                return false
            }
        }

        // 5. Block all other unsolicited external redirects, intent popups, betting apps, and ad stores
        // Returning true prevents WebView from following or spawning external apps for the URL
        return true
    }

    /** Exact or suffix host match (no substring matching) to prevent malicious redirection. */
    private fun isTrustedStreamHeavenHost(host: String): Boolean {
        return host == "cinecub.stream" || host.endsWith(".cinecub.stream") ||
               host == "streamheaven.online" || host.endsWith(".streamheaven.online")
    }

    private fun isSuffixHost(host: String, base: String): Boolean {
        return host == base || host.endsWith(".$base")
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Case 1: If in fullscreen video playback, exit fullscreen
                if (customView != null) {
                    hideCustomView()
                    return
                }

                // Case 2: If WebView can go back, navigate to previous page
                if (webView.canGoBack()) {
                    webView.goBack()
                    return
                }

                // Case 3: At root page, prompt double-tap to exit
                if (System.currentTimeMillis() - backPressedTime < BACK_PRESS_INTERVAL) {
                    isEnabled = false
                    finish()
                } else {
                    backPressedTime = System.currentTimeMillis()
                    Toast.makeText(
                        this@MainActivity,
                        "Press back again to exit CineCub",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        })
    }

    private fun setupOfflineHandling() {
        btnRetry.setOnClickListener {
            if (isNetworkAvailable()) {
                offlineLayout.visibility = View.GONE
                webViewContainer.visibility = View.VISIBLE
                isPageError = false
                if (webView.url.isNullOrEmpty() || webView.url == "about:blank") {
                    loadInitialUrl()
                } else {
                    webView.reload()
                }
            } else {
                Toast.makeText(
                    this,
                    "No internet connection detected. Please check your network.",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    private fun showOfflineView() {
        pageProgressBar.visibility = View.GONE
        webViewContainer.visibility = View.GONE
        offlineLayout.visibility = View.VISIBLE
    }

    private fun loadInitialUrl() {
        if (isNetworkAvailable()) {
            offlineLayout.visibility = View.GONE
            webViewContainer.visibility = View.VISIBLE
            webView.loadUrl(TARGET_URL)
        } else {
            showOfflineView()
        }
    }

    private fun isNetworkAvailable(): Boolean {
        val connectivityManager =
            getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val network = connectivityManager.activeNetwork ?: return false
            val capabilities =
                connectivityManager.getNetworkCapabilities(network) ?: return false
            return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                    capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } else {
            @Suppress("DEPRECATION")
            val networkInfo = connectivityManager.activeNetworkInfo ?: return false
            @Suppress("DEPRECATION")
            return networkInfo.isConnected
        }
    }

    private fun setFullscreenImmersive(fullscreen: Boolean) {
        val insetsController = WindowCompat.getInsetsController(window, window.decorView)
        if (fullscreen) {
            insetsController.hide(WindowInsetsCompat.Type.systemBars())
            insetsController.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } else {
            insetsController.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        // State is already restored in onCreate via webView.restoreState();
        // calling it again here would double-restore the WebView.
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (customView != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val params = android.app.PictureInPictureParams.Builder().build()
                enterPictureInPictureMode(params)
            } catch (_: Exception) {}
        }
    }

    private fun hideCustomView() {
        chromeClient?.onHideCustomView()
    }

    @RequiresApi(Build.VERSION_CODES.O)
    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: android.content.res.Configuration
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        if (isInPictureInPictureMode) {
            setFullscreenImmersive(true)
        } else if (customView == null) {
            setFullscreenImmersive(false)
        }
    }

    override fun onDestroy() {
        if (customView != null) {
            hideCustomView()
        }
        webView.stopLoading()
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }

    /**
     * Native Android Interface exposed to WebView JavaScript.
     * Enables rich Android Share Sheet chooser, clipboard bridge, etc.
     */
    inner class WebAppInterface(private val activity: MainActivity) {
        /**
         * Bridge is only honored while the top-level page is our own app, so a rogue
         * third-party iframe cannot invoke native actions while embedded in the shell.
         */
        private fun isTrustedPageContext(): Boolean {
            val url = activity.webView.url ?: return false
            return runCatching {
                isTrustedStreamHeavenHost(Uri.parse(url).host?.lowercase() ?: "")
            }.getOrDefault(false)
        }

        @JavascriptInterface
        fun share(title: String?, text: String?, url: String?) {
            if (!isTrustedPageContext()) return
            activity.runOnUiThread {
                try {
                    val shareText = when {
                        !text.isNullOrBlank() && !url.isNullOrBlank() -> "$text\n$url"
                        !url.isNullOrBlank() -> url
                        else -> text ?: ""
                    }
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_SUBJECT, title ?: "CineCub")
                        putExtra(Intent.EXTRA_TITLE, title ?: "CineCub")
                        putExtra(Intent.EXTRA_TEXT, shareText)
                    }
                    val chooser = Intent.createChooser(intent, "Share " + (title ?: "CineCub"))
                    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    activity.startActivity(chooser)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }

        @JavascriptInterface
        fun setSwipeRefreshEnabled(enabled: Boolean) {
            // No-op: pull-to-refresh was removed (v1.3.0) because the SwipeRefreshLayout
            // intercepted scroll gestures and made the app feel unresponsive.
            if (!isTrustedPageContext()) return
        }

        @JavascriptInterface
        fun signInWithGoogle() {
            if (!isTrustedPageContext()) return
            activity.runOnUiThread {
                try {
                    activity.googleSignInClient.signOut().addOnCompleteListener {
                        val signInIntent = activity.googleSignInClient.signInIntent
                        activity.googleSignInLauncher.launch(signInIntent)
                    }
                } catch (e: Exception) {
                    activity.launchGoogleCustomTab()
                }
            }
        }
    }
}
