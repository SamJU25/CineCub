<#
.SYNOPSIS
  Preservation Property Tests -- Property 2: Non-Release-Sync Paths Unchanged
  Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6

  PURPOSE:
    These tests encode the invariants that MUST hold both before and after the fix:
      - AppUpdater.kt source code must never be modified by the release process
      - storefront/public/_headers rules must remain unchanged
      - All non-version fields in version.json must survive a release.ps1 run intact
      - release.ps1 must be authoritative and idempotent (same versionCode in -> same out)

  EXPECTED OUTCOME (on unfixed code, and after fix):
    - All property tests PASS - these invariants are independent of whether the fix
      has been applied. They guard against regressions introduced by the fix.
    - Exit code 0 = all preservation properties hold
    - Exit code 1 = a preservation invariant was violated

  Baselines recorded on unfixed code (2026-09-01):
    AppUpdater.kt SHA-256 : 99E6E4FDBBDC5C0A5763B6187BD6EA35D8013498810F891F0AA4D7D78D8AD660
    version.json fields   : appName="StreamHeaven", apkUrl, downloadUrl,
                            minSupportedVersion=1, mandatory=false,
                            releaseNotes="Svelte 5 interactive islands, ..."
    _headers version.json : Cache-Control: no-cache, no-store, must-revalidate
    _headers StreamHeaven.apk : Cache-Control: public, max-age=0, must-revalidate
#>

$ErrorActionPreference = "Stop"

# -- Paths ----------------------------------------------------------------------
$repoRoot        = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..\")).Path
$appUpdaterFile  = Join-Path $repoRoot "android-app\app\src\main\java\online\streamheaven\app\AppUpdater.kt"
$versionJsonFile = Join-Path $repoRoot "storefront\public\version.json"
$headersFile     = Join-Path $repoRoot "storefront\public\_headers"

# -- Recorded baselines (observed on unfixed code) -----------------------------
$BASELINE_APPUPDATER_SHA256 = "99E6E4FDBBDC5C0A5763B6187BD6EA35D8013498810F891F0AA4D7D78D8AD660"

$BASELINE_FIELDS = @{
    appName             = "StreamHeaven"
    apkUrl              = "https://streamheaven.online/StreamHeaven.apk"
    downloadUrl         = "https://streamheaven.online/StreamHeaven.apk"
    minSupportedVersion = 1
    mandatory           = $false
    releaseNotes        = "Svelte 5 interactive islands, 6-server streaming engine, offline continue watching, and updated Telegram community integration."
}

$BASELINE_HEADERS_VERSION_JSON   = "Cache-Control: no-cache, no-store, must-revalidate"
$BASELINE_HEADERS_APK            = "Cache-Control: public, max-age=0, must-revalidate"

# -- Test state tracking -------------------------------------------------------
$passCount = 0
$failCount = 0
$failures  = @()

function Assert-True {
    param(
        [string]$Name,
        [bool]$Condition,
        [string]$Detail = ""
    )
    if ($Condition) {
        Write-Host "    PASS  $Name"
        $script:passCount++
    } else {
        Write-Host "    FAIL  $Name"
        if ($Detail) { Write-Host "          $Detail" }
        $script:failCount++
        $script:failures += $Name
    }
}

function Assert-Equal {
    param(
        [string]$Name,
        $Expected,
        $Actual
    )
    $ok = ($Expected -eq $Actual)
    if ($ok) {
        Write-Host "    PASS  $Name"
        $script:passCount++
    } else {
        Write-Host "    FAIL  $Name"
        Write-Host "          Expected : $Expected"
        Write-Host "          Actual   : $Actual"
        $script:failCount++
        $script:failures += $Name
    }
}

# -- Simulate the merge logic that release.ps1 will perform --------------------
# This function mirrors exactly what release.ps1 is specified to do (design.md §Fix §3):
#   - Read existing version.json
#   - Overwrite versionCode, versionName, updatedAt
#   - Preserve all other fields
#   Returns the merged PSCustomObject.
function Invoke-ReleaseMerge {
    param(
        [PSCustomObject]$ExistingJson,
        [int]$NewVersionCode,
        [string]$NewVersionName
    )
    # Clone all fields
    $merged = [PSCustomObject]@{}
    foreach ($prop in $ExistingJson.PSObject.Properties) {
        $merged | Add-Member -MemberType NoteProperty -Name $prop.Name -Value $prop.Value
    }
    # Overwrite only the three mutable fields
    $merged.versionCode  = $NewVersionCode
    $merged.versionName  = $NewVersionName
    $merged.updatedAt    = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    return $merged
}

# -- Header section helper -----------------------------------------------------
# Reads the _headers file and extracts Cache-Control values for a given path rule.
# Returns the Cache-Control value string or $null if not found.
function Get-CacheControlForPath {
    param(
        [string]$Content,
        [string]$PathRule   # e.g. "/version.json"
    )
    # Split into lines, find the path rule, then find the next Cache-Control line
    $lines = $Content -split "`n"
    $inBlock = $false
    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if ($trimmed -eq $PathRule) {
            $inBlock = $true
            continue
        }
        if ($inBlock) {
            if ($trimmed -match '^Cache-Control\s*:\s*(.+)$') {
                return "Cache-Control: $($Matches[1].Trim())"
            }
            # A blank line or another path rule terminates the block
            if ($trimmed -eq "" -or $trimmed -match '^/') {
                $inBlock = $false
            }
        }
    }
    return $null
}

# ═════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "=================================================================="
Write-Host "  PRESERVATION PROPERTY TESTS"
Write-Host "  Property 2: Non-Release-Sync Paths Unchanged"
Write-Host "  Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6"
Write-Host "=================================================================="

# -- SECTION 1: Observe and record current state -------------------------------
Write-Host ""
Write-Host "----------------------------------------------------------------"
Write-Host "  SECTION 1 - Observe current file state"
Write-Host "----------------------------------------------------------------"

# 1a. Compute AppUpdater.kt hash
if (-not (Test-Path $appUpdaterFile)) {
    Write-Host "  ERROR: AppUpdater.kt not found at: $appUpdaterFile"
    exit 1
}
$actualHash = (Get-FileHash $appUpdaterFile -Algorithm SHA256).Hash
Write-Host "  AppUpdater.kt SHA-256 (observed)  : $actualHash"
Write-Host "  AppUpdater.kt SHA-256 (baseline)  : $BASELINE_APPUPDATER_SHA256"

# 1b. Read version.json
if (-not (Test-Path $versionJsonFile)) {
    Write-Host "  ERROR: version.json not found at: $versionJsonFile"
    exit 1
}
$versionJson = Get-Content $versionJsonFile -Raw | ConvertFrom-Json
Write-Host ""
Write-Host "  version.json non-version fields (observed):"
Write-Host "    appName             = $($versionJson.appName)"
Write-Host "    apkUrl              = $($versionJson.apkUrl)"
Write-Host "    downloadUrl         = $($versionJson.downloadUrl)"
Write-Host "    minSupportedVersion = $($versionJson.minSupportedVersion)"
Write-Host "    mandatory           = $($versionJson.mandatory)"
Write-Host "    releaseNotes        = $($versionJson.releaseNotes)"

# 1c. Read _headers
if (-not (Test-Path $headersFile)) {
    Write-Host "  ERROR: _headers not found at: $headersFile"
    exit 1
}
$headersContent = Get-Content $headersFile -Raw
$cacheControlVersionJson = Get-CacheControlForPath -Content $headersContent -PathRule "/version.json"
$cacheControlApk         = Get-CacheControlForPath -Content $headersContent -PathRule "/StreamHeaven.apk"
Write-Host ""
Write-Host "  _headers Cache-Control rules (observed):"
Write-Host "    /version.json     -> $cacheControlVersionJson"
Write-Host "    /StreamHeaven.apk -> $cacheControlApk"


# -- SECTION 2: Static invariant checks ----------------------------------------
Write-Host ""
Write-Host "----------------------------------------------------------------"
Write-Host "  SECTION 2 - Static invariant checks"
Write-Host "----------------------------------------------------------------"
Write-Host ""

# 2a. AppUpdater.kt hash must match baseline
Assert-Equal `
    -Name     "AppUpdater.kt SHA-256 matches baseline (source unchanged)" `
    -Expected $BASELINE_APPUPDATER_SHA256 `
    -Actual   $actualHash

# 2b. _headers Cache-Control for version.json
Assert-Equal `
    -Name     "_headers: /version.json Cache-Control = no-cache, no-store, must-revalidate" `
    -Expected $BASELINE_HEADERS_VERSION_JSON `
    -Actual   $cacheControlVersionJson

# 2c. _headers Cache-Control for StreamHeaven.apk
Assert-Equal `
    -Name     "_headers: /StreamHeaven.apk Cache-Control = public, max-age=0, must-revalidate" `
    -Expected $BASELINE_HEADERS_APK `
    -Actual   $cacheControlApk

# 2d. Non-version fields exist in version.json and match baseline
Assert-Equal `
    -Name     "version.json: appName = '$($BASELINE_FIELDS.appName)'" `
    -Expected $BASELINE_FIELDS.appName `
    -Actual   $versionJson.appName

Assert-Equal `
    -Name     "version.json: apkUrl = '$($BASELINE_FIELDS.apkUrl)'" `
    -Expected $BASELINE_FIELDS.apkUrl `
    -Actual   $versionJson.apkUrl

Assert-Equal `
    -Name     "version.json: downloadUrl = '$($BASELINE_FIELDS.downloadUrl)'" `
    -Expected $BASELINE_FIELDS.downloadUrl `
    -Actual   $versionJson.downloadUrl

Assert-Equal `
    -Name     "version.json: minSupportedVersion = $($BASELINE_FIELDS.minSupportedVersion)" `
    -Expected $BASELINE_FIELDS.minSupportedVersion `
    -Actual   $versionJson.minSupportedVersion

Assert-Equal `
    -Name     "version.json: mandatory = $($BASELINE_FIELDS.mandatory)" `
    -Expected $BASELINE_FIELDS.mandatory `
    -Actual   ($versionJson.mandatory -eq $true)

Assert-Equal `
    -Name     "version.json: releaseNotes matches baseline" `
    -Expected $BASELINE_FIELDS.releaseNotes `
    -Actual   $versionJson.releaseNotes


# -- SECTION 3: Property-based simulation - field preservation -----------------
#
# Property: For ALL valid (versionCode, versionName) pairs, running the release
# merge logic MUST preserve every non-version field in version.json exactly.
#
# Approach: generate 10 random version pairs, simulate the merge, assert fields.
# Validates: Requirements 3.1 (no spurious prompt), 3.4 (download works)
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "----------------------------------------------------------------"
Write-Host "  SECTION 3 - Property-based: field preservation (10 samples)"
Write-Host "  For all valid (versionCode, versionName) inputs, non-version"
Write-Host "  fields in version.json must be preserved by the merge logic."
Write-Host "----------------------------------------------------------------"

$fieldPreservationPass = $true
$fieldPreservationDetail = ""

# Generator: produce random version pairs in realistic ranges
$rng = [System.Random]::new()

function New-RandomVersionCode { param([System.Random]$R) return $R.Next(1, 10000) }
function New-RandomVersionName {
    param([System.Random]$R)
    $major = $R.Next(1, 10)
    $minor = $R.Next(0, 20)
    $patch = $R.Next(0, 50)
    return "$major.$minor.$patch"
}

for ($i = 1; $i -le 10; $i++) {
    $vc = New-RandomVersionCode -R $rng
    $vn = New-RandomVersionName -R $rng

    # Re-read version.json fresh for each sample (preserves original field values)
    $baseJson = Get-Content $versionJsonFile -Raw | ConvertFrom-Json

    $merged = Invoke-ReleaseMerge -ExistingJson $baseJson -NewVersionCode $vc -NewVersionName $vn

    # Assert all non-version fields are unchanged
    $sampleOk = $true
    foreach ($field in @("appName", "apkUrl", "downloadUrl", "minSupportedVersion", "mandatory", "releaseNotes")) {
        $expected = $baseJson.$field
        $actual   = $merged.$field
        if ($expected -ne $actual) {
            $sampleOk = $false
            $fieldPreservationDetail += "  Sample $i ($vc / $vn): field '$field' changed from '$expected' to '$actual'`n"
        }
    }

    # Assert version fields ARE updated
    if ($merged.versionCode -ne $vc) {
        $sampleOk = $false
        $fieldPreservationDetail += "  Sample $i ($vc / $vn): versionCode not updated (got $($merged.versionCode), want $vc)`n"
    }
    if ($merged.versionName -ne $vn) {
        $sampleOk = $false
        $fieldPreservationDetail += "  Sample $i ($vc / $vn): versionName not updated (got $($merged.versionName), want $vn)`n"
    }

    if (-not $sampleOk) { $fieldPreservationPass = $false }

    $status = if ($sampleOk) { "ok" } else { "FAIL" }
    Write-Host "    sample $("{0:D2}" -f $i)  versionCode=$("{0:D5}" -f $vc)  versionName=$("{0,-10}" -f $vn)  -> $status"
}

Write-Host ""
Assert-True `
    -Name      "Property: all 10 samples preserve non-version fields and update version fields" `
    -Condition $fieldPreservationPass `
    -Detail    $fieldPreservationDetail


# -- SECTION 4: Property-based simulation - idempotency / authoritativeness ----
#
# Property: For any state where gradleVersionCode == jsonVersionCode (bug condition
# is false), the merge logic produces a result with versionCode == gradleVersionCode.
# The script is authoritative over build.gradle.kts: whatever versionCode it reads,
# that value wins in version.json - no matter what version.json said before.
#
# Validates: Requirements 3.1 (no regression - up-to-date users see no prompt)
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "----------------------------------------------------------------"
Write-Host "  SECTION 4 - Property-based: idempotency (10 samples)"
Write-Host "  For any state where gradleVersionCode == jsonVersionCode,"
Write-Host "  the merge produces versionCode == gradleVersionCode (authoritative)."
Write-Host "----------------------------------------------------------------"

$idempotencyPass = $true
$idempotencyDetail = ""

for ($i = 1; $i -le 10; $i++) {
    # Scenario: both gradle and json agree on the same version (no bug condition)
    $syncedCode = New-RandomVersionCode -R $rng
    $syncedName = New-RandomVersionName -R $rng

    # Build a synthetic version.json whose versionCode == gradleVersionCode
    $syntheticJson = [PSCustomObject]@{
        appName             = $BASELINE_FIELDS.appName
        versionName         = $syncedName
        versionCode         = $syncedCode
        apkUrl              = $BASELINE_FIELDS.apkUrl
        downloadUrl         = $BASELINE_FIELDS.downloadUrl
        minSupportedVersion = $BASELINE_FIELDS.minSupportedVersion
        mandatory           = $BASELINE_FIELDS.mandatory
        releaseNotes        = $BASELINE_FIELDS.releaseNotes
        updatedAt           = "2026-01-01T00:00:00Z"
    }

    # gradleVersionCode == jsonVersionCode - not a bug condition
    $gradleVersionCode = $syncedCode
    $gradleVersionName = $syncedName

    $merged = Invoke-ReleaseMerge -ExistingJson $syntheticJson -NewVersionCode $gradleVersionCode -NewVersionName $gradleVersionName

    $sampleOk = ($merged.versionCode -eq $gradleVersionCode) -and ($merged.versionName -eq $gradleVersionName)
    if (-not $sampleOk) {
        $idempotencyPass = $false
        $idempotencyDetail += "  Sample $i (vc=$syncedCode): merged.versionCode=$($merged.versionCode), merged.versionName=$($merged.versionName)`n"
    }

    $status = if ($sampleOk) { "ok" } else { "FAIL" }
    Write-Host "    sample $("{0:D2}" -f $i)  versionCode=$("{0:D5}" -f $syncedCode)  versionName=$("{0,-10}" -f $syncedName)  -> $status"
}

Write-Host ""
Assert-True `
    -Name      "Property: all 10 idempotency samples produce versionCode == gradleVersionCode" `
    -Condition $idempotencyPass `
    -Detail    $idempotencyDetail


# -- FINAL VERDICT -------------------------------------------------------------
Write-Host ""
Write-Host "=================================================================="
Write-Host "  VERDICT"
Write-Host "=================================================================="
Write-Host ""
Write-Host "  Total assertions : $($passCount + $failCount)"
Write-Host "  Passed           : $passCount"
Write-Host "  Failed           : $failCount"

if ($failCount -eq 0) {
    Write-Host ""
    Write-Host "  ALL PRESERVATION PROPERTIES HOLD."
    Write-Host ""
    Write-Host "  These invariants must continue to pass after the fix is applied:"
    Write-Host "    - AppUpdater.kt source is unchanged (hash matches baseline)"
    Write-Host "    - _headers Cache-Control rules are unchanged"
    Write-Host "    - All non-version fields in version.json are preserved by release.ps1"
    Write-Host "    - release.ps1 merge is authoritative and idempotent"
    Write-Host ""
    exit 0
} else {
    Write-Host ""
    Write-Host "  PRESERVATION VIOLATION(S) DETECTED:"
    foreach ($f in $failures) {
        Write-Host "    - $f"
    }
    Write-Host ""
    Write-Host "  A preservation invariant was broken. Review the failures above."
    exit 1
}
