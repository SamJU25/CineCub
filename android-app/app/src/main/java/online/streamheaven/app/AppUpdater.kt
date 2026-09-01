package online.streamheaven.app

import android.app.Activity
import android.app.Dialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.LayoutInflater
import android.view.Window
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.FileProvider
import com.google.android.material.button.MaterialButton
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.Executors

data class UpdateInfo(
    val versionCode: Int,
    val versionName: String,
    val apkUrl: String,
    val releaseNotes: String,
    val mandatory: Boolean
)

object AppUpdater {

    private const val VERSION_CHECK_URL = "https://streamheaven.online/version.json"
    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var downloadThread: Thread? = null

    fun checkForUpdate(activity: Activity) {
        executor.execute {
            try {
                val url = URL("$VERSION_CHECK_URL?t=${System.currentTimeMillis()}")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    connectTimeout = 10000
                    readTimeout = 10000
                    requestMethod = "GET"
                    setRequestProperty("User-Agent", "StreamHeavenApp")
                    setRequestProperty("Accept", "application/json")
                    useCaches = false
                }

                if (conn.responseCode == HttpURLConnection.HTTP_OK) {
                    val jsonStr = conn.inputStream.bufferedReader().use { it.readText() }
                    val json = JSONObject(jsonStr)

                    val remoteVersionCode = json.optInt("versionCode", 0)
                    val remoteVersionName = json.optString("versionName", "1.0.0")
                    val apkUrl = if (json.has("apkUrl")) json.getString("apkUrl") else json.optString("downloadUrl", "https://streamheaven.online/StreamHeaven.apk")
                    val releaseNotes = json.optString(
                        "releaseNotes",
                        "Bug fixes and performance enhancements."
                    )
                    val mandatory = json.optBoolean("mandatory", false)

                    val currentVersionCode = getCurrentVersionCode(activity)
                    val currentVersionName = getCurrentVersionName(activity)

                    if (remoteVersionCode > currentVersionCode || isNewerVersion(remoteVersionName, currentVersionName)) {
                        val updateInfo = UpdateInfo(
                            versionCode = remoteVersionCode,
                            versionName = remoteVersionName,
                            apkUrl = apkUrl,
                            releaseNotes = releaseNotes,
                            mandatory = mandatory
                        )

                        mainHandler.post {
                            if (!activity.isFinishing && !activity.isDestroyed) {
                                showUpdatePrompt(activity, updateInfo)
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                // Silently ignore network errors during automatic update check
            }
        }
    }

    private fun isNewerVersion(remote: String, current: String): Boolean {
        try {
            val rParts = remote.split(".").map { it.filter { c -> c.isDigit() }.toIntOrNull() ?: 0 }
            val cParts = current.split(".").map { it.filter { c -> c.isDigit() }.toIntOrNull() ?: 0 }
            val maxLen = maxOf(rParts.size, cParts.size)
            for (i in 0 until maxLen) {
                val r = if (i < rParts.size) rParts[i] else 0
                val c = if (i < cParts.size) cParts[i] else 0
                if (r > c) return true
                if (r < c) return false
            }
        } catch (_: Exception) {}
        return false
    }

    private fun getCurrentVersionName(context: Context): String {
        return try {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            packageInfo.versionName ?: "1.0.0"
        } catch (e: Exception) {
            "1.0.0"
        }
    }

    private fun getCurrentVersionCode(context: Context): Long {
        return try {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                packageInfo.longVersionCode
            } else {
                @Suppress("DEPRECATION")
                packageInfo.versionCode.toLong()
            }
        } catch (e: Exception) {
            1L
        }
    }

    private fun showUpdatePrompt(activity: Activity, updateInfo: UpdateInfo) {
        val dialog = Dialog(activity)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        dialog.window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))

        val view = LayoutInflater.from(activity).inflate(R.layout.dialog_update, null)
        dialog.setContentView(view)
        dialog.setCancelable(!updateInfo.mandatory)

        val tvUpdateVersion = view.findViewById<TextView>(R.id.tvUpdateVersion)
        val tvReleaseNotes = view.findViewById<TextView>(R.id.tvReleaseNotes)
        val btnUpdateNow = view.findViewById<MaterialButton>(R.id.btnUpdateNow)
        val btnUpdateLater = view.findViewById<MaterialButton>(R.id.btnUpdateLater)
        val layoutPermissionCaution = view.findViewById<android.view.View>(R.id.layoutPermissionCaution)

        tvUpdateVersion.text = "StreamHeaven v${updateInfo.versionName}"
        tvReleaseNotes.text = updateInfo.releaseNotes

        // Check if unknown app install permission is already granted; if granted, do not show caution
        val needsPermission = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.packageManager.canRequestPackageInstalls()
        layoutPermissionCaution.visibility = if (needsPermission) android.view.View.VISIBLE else android.view.View.GONE

        if (updateInfo.mandatory) {
            btnUpdateLater.visibility = android.view.View.GONE
        } else {
            btnUpdateLater.setOnClickListener {
                dialog.dismiss()
            }
        }

        btnUpdateNow.setOnClickListener {
            dialog.dismiss()
            showDownloadProgress(activity, updateInfo.apkUrl)
        }

        dialog.show()

        // Set explicit width (90% of screen, max 420dp) to prevent squishing
        dialog.window?.let { window ->
            window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            val displayMetrics = activity.resources.displayMetrics
            val screenWidth = displayMetrics.widthPixels
            val targetWidth = (screenWidth * 0.90).toInt().coerceAtMost((420 * displayMetrics.density).toInt())
            window.setLayout(targetWidth, android.view.ViewGroup.LayoutParams.WRAP_CONTENT)
            window.setGravity(android.view.Gravity.CENTER)
        }
    }

    private fun showDownloadProgress(activity: Activity, apkUrl: String) {
        val dialog = Dialog(activity)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)

        val view = LayoutInflater.from(activity).inflate(R.layout.dialog_download_progress, null)
        dialog.setContentView(view)
        dialog.setCancelable(false)

        val progressBar = view.findViewById<ProgressBar>(R.id.downloadProgressBar)
        val tvPercent = view.findViewById<TextView>(R.id.tvDownloadPercent)
        val tvSize = view.findViewById<TextView>(R.id.tvDownloadSize)
        val btnCancel = view.findViewById<MaterialButton>(R.id.btnCancelDownload)

        var isCancelled = false

        btnCancel.setOnClickListener {
            isCancelled = true
            downloadThread?.interrupt()
            dialog.dismiss()
            Toast.makeText(activity, "Update download cancelled", Toast.LENGTH_SHORT).show()
        }

        dialog.show()

        // Set explicit width for download progress dialog
        dialog.window?.let { window ->
            window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            val displayMetrics = activity.resources.displayMetrics
            val screenWidth = displayMetrics.widthPixels
            val targetWidth = (screenWidth * 0.90).toInt().coerceAtMost((420 * displayMetrics.density).toInt())
            window.setLayout(targetWidth, android.view.ViewGroup.LayoutParams.WRAP_CONTENT)
            window.setGravity(android.view.Gravity.CENTER)
        }

        downloadThread = Thread {
            var inputStream: InputStream? = null
            var outputStream: FileOutputStream? = null
            var connection: HttpURLConnection? = null

            try {
                val downloadUrlStr = if (apkUrl.contains("?")) "$apkUrl&t=${System.currentTimeMillis()}" else "$apkUrl?t=${System.currentTimeMillis()}"
                val url = URL(downloadUrlStr)
                connection = (url.openConnection() as HttpURLConnection).apply {
                    connectTimeout = 20000
                    readTimeout = 20000
                    requestMethod = "GET"
                    setRequestProperty("User-Agent", "StreamHeavenApp")
                    useCaches = false
                }

                if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                    throw Exception("Server returned HTTP ${connection.responseCode}")
                }

                val fileLength = connection.contentLength
                inputStream = connection.inputStream

                val downloadDir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                    ?: activity.cacheDir
                val apkFile = File(downloadDir, "StreamHeaven-update.apk")
                if (apkFile.exists()) {
                    apkFile.delete()
                }

                outputStream = FileOutputStream(apkFile)

                val data = ByteArray(4096)
                var total: Long = 0
                var count: Int
                var lastUpdate = 0L

                while (inputStream.read(data).also { count = it } != -1) {
                    if (isCancelled || Thread.currentThread().isInterrupted) {
                        apkFile.delete()
                        return@Thread
                    }

                    total += count.toLong()
                    outputStream.write(data, 0, count)

                    val now = System.currentTimeMillis()
                    if (fileLength > 0 && now - lastUpdate > 80) {
                        lastUpdate = now
                        val percent = (total * 100 / fileLength).toInt()
                        val totalMB = fileLength.toDouble() / (1024 * 1024)
                        val downloadedMB = total.toDouble() / (1024 * 1024)

                        mainHandler.post {
                            if (dialog.isShowing) {
                                progressBar.progress = percent
                                tvPercent.text = "$percent%"
                                tvSize.text = String.format(
                                    Locale.US,
                                    "%.1f MB / %.1f MB",
                                    downloadedMB,
                                    totalMB
                                )
                            }
                        }
                    }
                }

                outputStream.flush()

                mainHandler.post {
                    if (dialog.isShowing) {
                        dialog.dismiss()
                    }
                    installApk(activity, apkFile)
                }

            } catch (e: Exception) {
                if (!isCancelled) {
                    mainHandler.post {
                        if (dialog.isShowing) {
                            dialog.dismiss()
                        }
                        Toast.makeText(
                            activity,
                            "Failed to download update: ${e.message}",
                            Toast.LENGTH_LONG
                        ).show()
                    }
                }
            } finally {
                try {
                    outputStream?.close()
                    inputStream?.close()
                    connection?.disconnect()
                } catch (_: Exception) {}
            }
        }.apply { start() }
    }

    private fun installApk(activity: Activity, apkFile: File) {
        if (!apkFile.exists()) {
            Toast.makeText(activity, "Downloaded update file not found", Toast.LENGTH_SHORT).show()
            return
        }

        // On Android 8.0+ (Oreo+), verify if app can request package installations
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!activity.packageManager.canRequestPackageInstalls()) {
                Toast.makeText(
                    activity,
                    "Please allow StreamHeaven to install updates",
                    Toast.LENGTH_LONG
                ).show()
                try {
                    val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                        data = Uri.parse("package:${activity.packageName}")
                    }
                    activity.startActivity(intent)
                } catch (e: Exception) {
                    val intent = Intent(Settings.ACTION_SECURITY_SETTINGS)
                    activity.startActivity(intent)
                }
                return
            }
        }

        try {
            val apkUri = FileProvider.getUriForFile(
                activity,
                "${activity.packageName}.fileprovider",
                apkFile
            )

            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            activity.startActivity(installIntent)
        } catch (e: Exception) {
            Toast.makeText(
                activity,
                "Unable to open installer: ${e.message}",
                Toast.LENGTH_LONG
            ).show()
        }
    }
}
