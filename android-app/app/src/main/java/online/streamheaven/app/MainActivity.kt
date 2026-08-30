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
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.material.button.MaterialButton

class MainActivity : AppCompatActivity() {

    companion object {
        const val TARGET_URL = "https://streamheaven.online"
        private const val BACK_PRESS_INTERVAL = 2000L
    }

    private lateinit var webView: WebView
    private lateinit var swipeRefreshLayout: SwipeRefreshLayout
    private lateinit var customViewContainer: FrameLayout
    private lateinit var pageProgressBar: ProgressBar
    private lateinit var offlineLayout: LinearLayout
    private lateinit var btnRetry: MaterialButton

    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
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
        setupSwipeRefresh()
        setupBackNavigation()
        setupOfflineHandling()

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            loadInitialUrl()
        }

        // Check for App Updates in Background
        AppUpdater.checkForUpdate(this)
    }

    private fun initViews() {
        webView = findViewById(R.id.webView)
        swipeRefreshLayout = findViewById(R.id.swipeRefreshLayout)
        customViewContainer = findViewById(R.id.customViewContainer)
        pageProgressBar = findViewById(R.id.pageProgressBar)
        offlineLayout = findViewById(R.id.offlineLayout)
        btnRetry = findViewById(R.id.btnRetry)

        originalOrientation = requestedOrientation
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings = webView.settings

        // Enable Core Web Capabilities
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true

        // Viewport & Scaling
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.setSupportZoom(false)
        settings.builtInZoomControls = false
        settings.displayZoomControls = false

        // Media & Audio/Video Playback
        settings.mediaPlaybackRequiresUserGesture = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
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

        // Custom User Agent string
        val defaultUserAgent = settings.userAgentString
        settings.userAgentString = "$defaultUserAgent StreamHeavenApp/1.0.0 (Android)"

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
        webView.isLongClickable = false
        webView.setOnLongClickListener { true }
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

        // Javascript Interface for Native Features (Share Sheet, etc.)
        webView.addJavascriptInterface(WebAppInterface(this), "AndroidShare")

        // WebChromeClient (Handles Fullscreen Videos, Progress, and Permissions)
        webView.webChromeClient = object : WebChromeClient() {

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
                if (host.contains("streamheaven.online")) {
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
                if (host.contains("streamheaven.online")) {
                    return super.onJsConfirm(view, url, message, result)
                }
                // Suppress rogue confirms from third-party embed iframes
                result?.cancel()
                return true
            }

            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                super.onProgressChanged(view, newProgress)
                if (newProgress < 100) {
                    if (pageProgressBar.visibility != View.VISIBLE && !swipeRefreshLayout.isRefreshing) {
                        pageProgressBar.visibility = View.VISIBLE
                    }
                    pageProgressBar.progress = newProgress
                } else {
                    pageProgressBar.visibility = View.GONE
                    swipeRefreshLayout.isRefreshing = false
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

                // Hide WebView & SwipeRefresh, attach full-screen video
                swipeRefreshLayout.visibility = View.GONE
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
                swipeRefreshLayout.visibility = View.VISIBLE

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
                // Grant requested permissions (e.g. protected media, audio)
                request?.grant(request.resources)
            }
        }

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
                return handleUrlNavigation(url, false)
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                isPageError = false
                view?.evaluateJavascript("document.documentElement.classList.add('is-app-env');", null)
                view?.evaluateJavascript("try{window.onbeforeunload=null;Object.defineProperty(window,'onbeforeunload',{get:function(){return null;},set:function(){return false;},configurable:false});}catch(e){}", null)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                swipeRefreshLayout.isRefreshing = false
                pageProgressBar.visibility = View.GONE
                view?.evaluateJavascript("document.documentElement.classList.add('is-app-env');", null)
                view?.evaluateJavascript("try{window.onbeforeunload=null;Object.defineProperty(window,'onbeforeunload',{get:function(){return null;},set:function(){return false;},configurable:false});}catch(e){}", null)

                if (!isPageError) {
                    offlineLayout.visibility = View.GONE
                    swipeRefreshLayout.visibility = View.VISIBLE
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

        // 1. Internal App & Trusted Infrastructure Domains -> Allow inside WebView
        if (host.contains("streamheaven.online") ||
            host.contains("firebaseapp.com") ||
            host.contains("googleapis.com") ||
            host.contains("tmdb.org") ||
            host.contains("themoviedb.org") ||
            host.contains("cloudflareinsights.com") ||
            host.contains("jsdelivr.net") ||
            host.contains("cdnjs.cloudflare.com")
        ) {
            return false
        }

        // 2. Main Frame Navigation Guard: Never let an external URL take over the main app window!
        if (isForMainFrame) {
            return true
        }

        // 3. Video Player Embed Hosts -> Allow inside WebView subframe (iframe)
        val videoEmbedHosts = arrayOf(
            "vidlink.pro", "vidsrc.me", "vidsrc.to", "vidsrc.net", "vidsrc.in", "vidsrc.pm", "vidsrc.xyz",
            "autoembed.co", "autoembed.cc", "autoembed.to", "multiembed.mov", "cinesrc.st",
            "embed.su", "2embed.cc", "2embed.skin", "superembed.stream", "smashystream.com",
            "rive.stream", "videasy.net", "player.autoembed.cc", "cloudnestra.com", "2embed.org"
        )
        for (embedHost in videoEmbedHosts) {
            if (host.contains(embedHost)) {
                return false
            }
        }

        // 4. User-Initiated Social & External Contact (Telegram Community, Email, Phone)
        if (host.contains("t.me") || host.contains("telegram.me") || scheme == "mailto" || scheme == "tel") {
            return try {
                val intent = Intent(Intent.ACTION_VIEW, uri)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(intent)
                true
            } catch (e: Exception) {
                false
            }
        }

        // 5. Block all other unsolicited external redirects, intent popups, betting apps, and ad stores
        // Returning true prevents WebView from following or spawning external apps for the URL
        return true
    }

    private fun setupSwipeRefresh() {
        swipeRefreshLayout.setColorSchemeColors(
            Color.parseColor("#9D4EDD"),
            Color.parseColor("#C77DFF"),
            Color.parseColor("#06D6A0")
        )
        swipeRefreshLayout.setProgressBackgroundColorSchemeColor(Color.parseColor("#18142A"))

        // Prevent SwipeRefresh from intercepting normal vertical or horizontal scrolling
        swipeRefreshLayout.setOnChildScrollUpCallback { _, _ ->
            customView != null || webView.canScrollVertically(-1) || webView.scrollY > 0
        }

        swipeRefreshLayout.setOnRefreshListener {
            if (isNetworkAvailable()) {
                isPageError = false
                webView.reload()
            } else {
                swipeRefreshLayout.isRefreshing = false
                showOfflineView()
            }
        }
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Case 1: If in fullscreen video playback, exit fullscreen
                if (customView != null) {
                    webView.webChromeClient?.onHideCustomView()
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
                        "Press back again to exit StreamHeaven",
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
                swipeRefreshLayout.visibility = View.VISIBLE
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
        swipeRefreshLayout.isRefreshing = false
        pageProgressBar.visibility = View.GONE
        swipeRefreshLayout.visibility = View.GONE
        offlineLayout.visibility = View.VISIBLE
    }

    private fun loadInitialUrl() {
        if (isNetworkAvailable()) {
            offlineLayout.visibility = View.GONE
            swipeRefreshLayout.visibility = View.VISIBLE
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
        webView.restoreState(savedInstanceState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onDestroy() {
        if (customView != null) {
            webView.webChromeClient?.onHideCustomView()
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
        @JavascriptInterface
        fun share(title: String?, text: String?, url: String?) {
            activity.runOnUiThread {
                try {
                    val shareText = when {
                        !text.isNullOrBlank() && !url.isNullOrBlank() -> "$text\n$url"
                        !url.isNullOrBlank() -> url
                        else -> text ?: ""
                    }
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_SUBJECT, title ?: "StreamHeaven")
                        putExtra(Intent.EXTRA_TITLE, title ?: "StreamHeaven")
                        putExtra(Intent.EXTRA_TEXT, shareText)
                    }
                    val chooser = Intent.createChooser(intent, "Share " + (title ?: "StreamHeaven"))
                    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    activity.startActivity(chooser)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }

        @JavascriptInterface
        fun setSwipeRefreshEnabled(enabled: Boolean) {
            activity.runOnUiThread {
                activity.swipeRefreshLayout.isEnabled = enabled
            }
        }
    }
}
