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
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
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

        // Cache Configuration
        if (isNetworkAvailable()) {
            settings.cacheMode = WebSettings.LOAD_DEFAULT
        } else {
            settings.cacheMode = WebSettings.LOAD_CACHE_ELSE_NETWORK
        }

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

        // WebChromeClient (Handles Fullscreen Videos, Progress, and Permissions)
        webView.webChromeClient = object : WebChromeClient() {

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

        // WebViewClient (Handles Navigation, Intents, and Error States)
        webView.webViewClient = object : WebViewClient() {

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                return handleUrlNavigation(url)
            }

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                if (url == null) return false
                return handleUrlNavigation(url)
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                isPageError = false
                view?.evaluateJavascript("document.documentElement.classList.add('is-app-env');", null)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                swipeRefreshLayout.isRefreshing = false
                pageProgressBar.visibility = View.GONE
                view?.evaluateJavascript("document.documentElement.classList.add('is-app-env');", null)

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

    private fun handleUrlNavigation(url: String): Boolean {
        val uri = Uri.parse(url)
        val host = uri.host?.lowercase() ?: ""

        // Handle internal app navigation (streamheaven.online)
        if (host.contains("streamheaven.online") || host.contains("firebaseapp.com")) {
            return false
        }

        // Handle External Protocols (mailto:, tel:, intent:, tg:, market:)
        return try {
            val intent = Intent(Intent.ACTION_VIEW, uri)
            startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
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
            webView.canScrollVertically(-1) || webView.scrollY > 0
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
}
