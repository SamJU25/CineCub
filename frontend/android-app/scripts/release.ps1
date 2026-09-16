<#
.SYNOPSIS
  Synchronises next-storefront/public/version.json and CineCub.apk with the latest Android build.

.DESCRIPTION
  After running `./gradlew assembleRelease` in the android-app directory, run this script to:
    1. Parse versionCode and versionName from android-app/app/build.gradle.kts
    2. Update frontend/next-storefront/public/version.json (versionCode, versionName, updatedAt)
       while preserving all other fields
    3. Copy the freshly built APK to frontend/next-storefront/public/CineCub.apk

  Usage (from repo root):
    pwsh frontend/android-app/scripts/release.ps1

  Usage (from android-app/scripts directory):
    pwsh release.ps1

  Requires PowerShell 7+ (pwsh) on Windows, macOS, or Linux.
#>

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Resolve paths relative to this script's location
# Script is at:  <repo>/frontend/android-app/scripts/release.ps1
# android-app :  $PSScriptRoot/..
# frontend root:  $PSScriptRoot/../..
# ---------------------------------------------------------------------------
$androidAppDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendRoot  = (Resolve-Path (Join-Path $androidAppDir "..")).Path
$gradleFile   = Join-Path $androidAppDir "app\build.gradle.kts"
$apkSrc       = Join-Path $androidAppDir "app\build\outputs\apk\release\app-release.apk"
$versionJson  = Join-Path $frontendRoot "next-storefront\public\version.json"
$apkDst       = Join-Path $frontendRoot "next-storefront\public\CineCub.apk"


Write-Host ""
Write-Host "=== CineCub Release Sync ===" -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------------------
# 1. Parse versionCode and versionName from build.gradle.kts
# ---------------------------------------------------------------------------
if (-not (Test-Path $gradleFile)) {
    Write-Host "ERROR: build.gradle.kts not found at:" -ForegroundColor Red
    Write-Host "  $gradleFile" -ForegroundColor Red
    exit 1
}

$gradleContent = Get-Content $gradleFile -Raw

$vcMatch = [regex]::Match($gradleContent, 'versionCode\s*=\s*(\d+)')
if (-not $vcMatch.Success) {
    Write-Host "ERROR: Could not parse versionCode from build.gradle.kts." -ForegroundColor Red
    Write-Host "  Expected pattern: versionCode = <integer>" -ForegroundColor Red
    exit 1
}
$newVersionCode = [int]$vcMatch.Groups[1].Value

$vnMatch = [regex]::Match($gradleContent, 'versionName\s*=\s*"([^"]+)"')
if (-not $vnMatch.Success) {
    Write-Host "ERROR: Could not parse versionName from build.gradle.kts." -ForegroundColor Red
    Write-Host '  Expected pattern: versionName = "<string>"' -ForegroundColor Red
    exit 1
}
$newVersionName = $vnMatch.Groups[1].Value

Write-Host "Parsed from build.gradle.kts:" -ForegroundColor White
Write-Host "  versionCode : $newVersionCode"
Write-Host "  versionName : $newVersionName"
Write-Host ""

# ---------------------------------------------------------------------------
# 2. Validate build artifact exists
# ---------------------------------------------------------------------------
if (-not (Test-Path $apkSrc)) {
    Write-Host "ERROR: Release APK not found at:" -ForegroundColor Red
    Write-Host "  $apkSrc" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please build the release APK first by running:" -ForegroundColor Yellow
    Write-Host "  cd android-app"
    Write-Host "  ./gradlew assembleRelease"
    Write-Host ""
    exit 1
}

# ---------------------------------------------------------------------------
# 3. Update storefront/public/version.json
# ---------------------------------------------------------------------------
if (-not (Test-Path $versionJson)) {
    Write-Host "ERROR: version.json not found at:" -ForegroundColor Red
    Write-Host "  $versionJson" -ForegroundColor Red
    exit 1
}

$existingJson = Get-Content $versionJson -Raw | ConvertFrom-Json

# Overwrite only the three release-specific fields; preserve everything else
$existingJson.versionCode = $newVersionCode
$existingJson.versionName = $newVersionName
$existingJson.updatedAt   = [System.DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")

# ConvertTo-Json uses 4-space indentation. Reformat to 2-space to match the
# existing file style by halving the leading spaces on each line.
$rawJson = $existingJson | ConvertTo-Json -Depth 10
$formattedLines = $rawJson -split "`n" | ForEach-Object {
    if ($_ -match '^( +)') {
        $leadingSpaces = $Matches[1].Length
        $twoSpaceIndent = [int]($leadingSpaces / 2)
        (' ' * $twoSpaceIndent) + $_.TrimStart()
    } else {
        $_
    }
}
$formattedJson = ($formattedLines -join "`n").TrimEnd() + "`n"

[System.IO.File]::WriteAllText($versionJson, $formattedJson, [System.Text.Encoding]::UTF8)

Write-Host "Updated version.json:" -ForegroundColor White
Write-Host "  $versionJson"
Write-Host ""

# ---------------------------------------------------------------------------
# 4. Copy APK to storefront
# ---------------------------------------------------------------------------
Copy-Item -Path $apkSrc -Destination $apkDst -Force

$apkSizeMB = [math]::Round((Get-Item $apkDst).Length / 1MB, 2)

Write-Host "Copied APK to storefront:" -ForegroundColor White
Write-Host "  $apkDst"
Write-Host ""

# ---------------------------------------------------------------------------
# 5. Success summary
# ---------------------------------------------------------------------------
Write-Host "=== Release Sync Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "  versionCode : $newVersionCode"
Write-Host "  versionName : $newVersionName"
Write-Host "  APK size    : $apkSizeMB MB"
Write-Host "  updatedAt   : $($existingJson.updatedAt)"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Review the changes:
       git diff frontend/next-storefront/public/
  2. Commit and push:
       git add frontend/next-storefront/public/version.json frontend/next-storefront/public/CineCub.apk
       git commit -m ``release: v$newVersionName (versionCode $newVersionCode)``
       git push
  3. Deploy frontend/next-storefront/ to Cloudflare."
Write-Host ""
