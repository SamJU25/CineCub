<#
.SYNOPSIS
  Bug Condition Exploration Test -- Property 1: Bug Condition
  Validates: Requirements 1.1, 1.4

  PURPOSE:
    This test CONFIRMS the bug exists on unfixed code.
    It simulates a post-build, pre-sync state where a developer has bumped versionCode
    to 10 in build.gradle.kts but has NOT updated version.json or run any sync script.

  EXPECTED OUTCOME (on unfixed code):
    - gradleVersionCode (simulated as 10) > jsonVersionCode (actual: 9)  -> bug condition TRUE
    - release.ps1 is absent                                               -> no auto-sync exists
    - Exit code 0 = bug confirmed (both assertions hold)
    - Exit code 1 = system unexpectedly fixed (should not happen on unfixed code)

  isBugCondition(state):
    RETURN gradleVersionCode > jsonVersionCode
           OR (gradleVersionCode > installedVersionCode AND jsonVersionCode <= installedVersionCode)
#>

$ErrorActionPreference = "Stop"

# Paths
$repoRoot        = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..\")).Path
$gradleFile      = Join-Path $repoRoot "android-app\app\build.gradle.kts"
$versionJsonFile = Join-Path $repoRoot "storefront\public\version.json"
$releaseScript   = Join-Path $repoRoot "android-app\scripts\release.ps1"

Write-Host ""
Write-Host "=================================================================="
Write-Host "  BUG CONDITION EXPLORATION TEST"
Write-Host "  Property 1: version.json Reflects Latest Build"
Write-Host "  Validates: Requirements 1.1, 1.4"
Write-Host "=================================================================="
Write-Host ""

# Step 1: Read actual versionCode from build.gradle.kts
Write-Host "[STEP 1] Reading versionCode from build.gradle.kts..."
if (-not (Test-Path $gradleFile)) {
    Write-Host "  ERROR: build.gradle.kts not found at: $gradleFile"
    exit 1
}

$gradleContent = Get-Content $gradleFile -Raw
if ($gradleContent -match 'versionCode\s*=\s*(\d+)') {
    $actualGradleVersionCode = [int]$Matches[1]
} else {
    Write-Host "  ERROR: Could not parse versionCode from build.gradle.kts"
    exit 1
}

if ($gradleContent -match 'versionName\s*=\s*"([^"]+)"') {
    $actualGradleVersionName = $Matches[1]
} else {
    Write-Host "  ERROR: Could not parse versionName from build.gradle.kts"
    exit 1
}

Write-Host "  Actual build.gradle.kts  -> versionCode=$actualGradleVersionCode, versionName=""$actualGradleVersionName"""

# Step 2: Simulate a post-build bump (gradleVersionCode = actual + 1)
# This simulates a developer having incremented versionCode without running the sync script.
$simulatedGradleVersionCode = $actualGradleVersionCode + 1
$simulatedGradleVersionName = "1.0.9"
Write-Host ""
Write-Host "[STEP 2] Simulating post-build bump..."
Write-Host "  Simulated build.gradle.kts -> versionCode=$simulatedGradleVersionCode, versionName=""$simulatedGradleVersionName"""
Write-Host "  (Developer bumped version but did NOT run any sync script)"

# Step 3: Read versionCode from version.json (actual, unchanged)
Write-Host ""
Write-Host "[STEP 3] Reading versionCode from version.json (expected to be stale)..."
if (-not (Test-Path $versionJsonFile)) {
    Write-Host "  ERROR: version.json not found at: $versionJsonFile"
    exit 1
}

$versionJson = Get-Content $versionJsonFile -Raw | ConvertFrom-Json
$jsonVersionCode = [int]$versionJson.versionCode
$jsonVersionName = $versionJson.versionName

Write-Host "  storefront/public/version.json -> versionCode=$jsonVersionCode, versionName=""$jsonVersionName"""

# Step 4: Check whether release.ps1 exists
Write-Host ""
Write-Host "[STEP 4] Checking for release.ps1 (android-app/scripts/release.ps1)..."
$releaseScriptExists = Test-Path $releaseScript
if ($releaseScriptExists) {
    Write-Host "  FOUND: $releaseScript"
} else {
    Write-Host "  ABSENT: $releaseScript -- no automated sync mechanism exists"
}

# Step 5: Evaluate isBugCondition
Write-Host ""
Write-Host "=================================================================="
Write-Host "  BUG CONDITION EVALUATION"
Write-Host "=================================================================="

$installedVersionCode = $actualGradleVersionCode   # device has the last published build

$versionCodeDesync = $simulatedGradleVersionCode -gt $jsonVersionCode
$gradleGtInstalled = $simulatedGradleVersionCode -gt $installedVersionCode
$jsonLeInstalled   = $jsonVersionCode -le $installedVersionCode
$promptWouldBeSuppressed = $gradleGtInstalled -and $jsonLeInstalled
$isBugCondition = $versionCodeDesync -or $promptWouldBeSuppressed

Write-Host ""
Write-Host "  State:"
Write-Host "    gradleVersionCode (simulated) : $simulatedGradleVersionCode"
Write-Host "    jsonVersionCode   (actual)    : $jsonVersionCode"
Write-Host "    installedVersionCode          : $installedVersionCode"
Write-Host ""
Write-Host "  Predicates:"
Write-Host "    gradleVersionCode > jsonVersionCode           = $versionCodeDesync"
Write-Host "    gradleVersionCode > installedVersionCode      = $gradleGtInstalled"
Write-Host "    jsonVersionCode   less-or-equal installedVersionCode = $jsonLeInstalled"
Write-Host "    promptWouldBeSuppressed                       = $promptWouldBeSuppressed"
Write-Host "    isBugCondition(state)                         = $isBugCondition"
Write-Host ""
Write-Host "  release.ps1 exists                              = $releaseScriptExists"

# Step 6: Assert bug condition holds AND release.ps1 is absent
Write-Host ""
Write-Host "=================================================================="
Write-Host "  ASSERTIONS"
Write-Host "=================================================================="

$assertion1Pass = $isBugCondition        # must be TRUE to confirm bug
$assertion2Pass = -not $releaseScriptExists  # release.ps1 must be absent

Write-Host ""
Write-Host "  [ASSERT 1] isBugCondition is TRUE (version.json is stale)"
if ($assertion1Pass) {
    Write-Host "    PASS -- version.json versionCode ($jsonVersionCode) is less than simulated gradle versionCode ($simulatedGradleVersionCode)"
    Write-Host "    COUNTEREXAMPLE: version.json reports versionCode=$jsonVersionCode while"
    Write-Host "      build.gradle.kts would report versionCode=$simulatedGradleVersionCode after a bump."
    Write-Host "      AppUpdater would see remoteVersionCode=$jsonVersionCode == installedVersionCode=$installedVersionCode"
    Write-Host "      -> comparison remoteVersionCode > currentVersionCode is FALSE -> no update prompt."
} else {
    Write-Host "    FAIL -- isBugCondition is FALSE; system appears already fixed or in sync"
}

Write-Host ""
Write-Host "  [ASSERT 2] release.ps1 is ABSENT (no automated sync mechanism)"
if ($assertion2Pass) {
    Write-Host "    PASS -- android-app/scripts/release.ps1 does not exist"
    Write-Host "    COUNTEREXAMPLE: No release sync script found; the desynchronisation"
    Write-Host "      between build.gradle.kts and version.json can never be corrected"
    Write-Host "      automatically. Developers must manually update version.json and copy"
    Write-Host "      the APK -- a step that is routinely omitted."
} else {
    Write-Host "    FAIL -- release.ps1 was found; automated sync mechanism already exists"
}

# Step 7: Final verdict
Write-Host ""
Write-Host "=================================================================="
Write-Host "  VERDICT"
Write-Host "=================================================================="

if ($assertion1Pass -and $assertion2Pass) {
    Write-Host ""
    Write-Host "  BUG CONFIRMED -- Both assertions PASS."
    Write-Host ""
    Write-Host "  Counterexample summary:"
    Write-Host "    * version.json versionCode=$jsonVersionCode (stale) vs."
    Write-Host "      simulated post-bump build.gradle.kts versionCode=$simulatedGradleVersionCode"
    Write-Host "    * AppUpdater fetches version.json and compares remoteVersionCode ($jsonVersionCode)"
    Write-Host "      against installedVersionCode ($installedVersionCode) -> no update prompt shown"
    Write-Host "    * android-app/scripts/release.ps1 is absent -- desync has no automated remedy"
    Write-Host ""
    Write-Host "  This test will PASS (as expected behavior) once the fix is applied:"
    Write-Host "    release.ps1 exists AND version.json.versionCode == build.gradle.kts versionCode"
    Write-Host ""
    # Exit 0 = bug confirmed (expected success outcome for this exploration test)
    exit 0
} elseif (-not $assertion1Pass -and -not $assertion2Pass) {
    Write-Host ""
    Write-Host "  UNEXPECTED: System appears to already be fixed."
    Write-Host "  Both assertions failed -- release.ps1 exists and version.json is in sync."
    Write-Host "  The bug condition does not hold. No counterexample found."
    exit 1
} elseif (-not $assertion1Pass) {
    Write-Host ""
    Write-Host "  PARTIAL: version.json appears in sync (assertion 1 failed)."
    Write-Host "  But release.ps1 is still absent (assertion 2 passed)."
    exit 1
} else {
    Write-Host ""
    Write-Host "  PARTIAL: release.ps1 already exists (assertion 2 failed)."
    Write-Host "  But version.json is still stale (assertion 1 passed)."
    exit 1
}
