# Version Update Not Detected — Bugfix Design

## Overview

When a new Android release is built, the in-app update prompt never appears and the APK served
for browser download remains the old version. The root cause is a missing release process:
`storefront/public/version.json` and `storefront/public/StreamHeaven.apk` are never updated after
a new build. `AppUpdater.kt` is correct — it fetches `version.json` with a cache-busting timestamp
and compares `remoteVersionCode` against the installed `versionCode`. The defect is entirely on the
content/deployment side.

The fix introduces a PowerShell release script (`android-app/scripts/release.ps1`) that:
1. Reads `versionCode` and `versionName` from `android-app/app/build.gradle.kts`
2. Writes updated values into `storefront/public/version.json` (with a UTC timestamp)
3. Copies the freshly built APK to `storefront/public/StreamHeaven.apk`

An optional GitHub Actions workflow (`.github/workflows/release.yml`) can automate the same steps
on a tagged push.

---

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — `version.json` has a `versionCode`
  equal to or lower than the installed app's `versionCode` when a newer build exists.
- **Property (P)**: The desired behaviour when a newer build exists — `AppUpdater.checkForUpdate`
  detects `remoteVersionCode > currentVersionCode` (or `isNewerVersion` is true) and shows the
  update prompt.
- **Preservation**: All existing runtime behaviour of `AppUpdater.kt` that must remain unchanged
  — the update check logic, download flow, install flow, and all non-release-sync paths.
- **releaseSync**: The process of updating `version.json` and copying the APK after a new build.
  Currently this process does not exist; the script creates it.
- **versionCode**: Integer counter in `build.gradle.kts` (`defaultConfig.versionCode`). Must be
  incremented on every release.
- **versionName**: Human-readable semver string in `build.gradle.kts` (`defaultConfig.versionName`).
- **version.json**: Static JSON file hosted at `https://streamheaven.online/version.json`. Served
  with `Cache-Control: no-cache, no-store, must-revalidate` — no CDN caching issue exists.
- **StreamHeaven.apk**: Static APK at `https://streamheaven.online/StreamHeaven.apk`. Served with
  `Cache-Control: public, max-age=0, must-revalidate` — browsers re-validate on every request.

---

## Bug Details

### Bug Condition

The bug manifests when a developer increments `versionCode` / `versionName` in
`android-app/app/build.gradle.kts`, builds a new release APK, but does **not** update
`storefront/public/version.json` or replace `storefront/public/StreamHeaven.apk`. As a result,
`AppUpdater` fetches a `version.json` whose `versionCode` matches the installed build, so the
comparison `remoteVersionCode > currentVersionCode` is `false` and no prompt is shown.

**Formal Specification:**
```
FUNCTION isBugCondition(state)
  INPUT: state — object with fields:
           gradleVersionCode:   Int   (versionCode in build.gradle.kts)
           jsonVersionCode:     Int   (versionCode in storefront/public/version.json)
           installedVersionCode: Int  (versionCode of the APK currently installed on device)
  OUTPUT: boolean

  -- A newer build exists but version.json has not been updated
  RETURN gradleVersionCode > jsonVersionCode
         OR gradleVersionCode > installedVersionCode AND jsonVersionCode <= installedVersionCode
END FUNCTION
```

### Examples

| Scenario | gradleVersionCode | jsonVersionCode | installedVersionCode | isBugCondition? | Symptom |
|---|---|---|---|---|---|
| Release published, no sync | 10 | 9 | 9 | **true** | No update prompt; old APK downloaded |
| versionName bumped, code unchanged | 9 | 9 | 9 | **true** (isNewerVersion path) | No prompt even if name differs |
| Sync script ran correctly | 10 | 10 | 9 | false | Update prompt shown ✓ |
| Fresh install, up to date | 9 | 9 | 9 | false | No prompt (correct) ✓ |
| User already on latest | 10 | 10 | 10 | false | No prompt (correct) ✓ |

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `AppUpdater.checkForUpdate` network logic, JSON parsing, and comparison logic must not be modified.
- The update dialog, download progress dialog, and APK install flow must continue to work exactly
  as before.
- All existing `_headers` rules for `version.json` and `StreamHeaven.apk` must remain in place.
- The Android app build process (`gradlew assembleRelease`) is unchanged — the script runs after
  the build, not during.
- All other `storefront/public/` assets and the `storefront` build pipeline are unaffected.

**Scope:**
Any code path that does **not** involve the release synchronisation process (i.e., everything
except running the new `release.ps1` script) must be completely unaffected. This includes:
- Normal app usage with no update available
- Download and installation of updates once the prompt is shown
- The Cloudflare Pages build and deployment pipeline for the storefront

---

## Hypothesized Root Cause

The release process has no automated step to keep `version.json` and `StreamHeaven.apk` in sync
with the Android build artifacts. Specific failure modes:

1. **Missing release script**: No script exists to extract `versionCode`/`versionName` from
   `build.gradle.kts` and write them into `version.json`. This is the primary cause.

2. **Manual copy step omitted**: The built APK (`app/build/outputs/apk/release/app-release.apk`)
   must be copied to `storefront/public/StreamHeaven.apk` manually. Without a script or CI step
   this is routinely forgotten.

3. **No CI automation**: There is no GitHub Actions workflow to enforce release synchronisation on
   a tagged push, so a developer working locally can ship without completing the sync.

4. **No validation gate**: Nothing checks that `jsonVersionCode >= gradleVersionCode` before the
   storefront is deployed, so a desynchronised state can go unnoticed until users report it.

---

## Correctness Properties

Property 1: Bug Condition — version.json Reflects Latest Build

_For any_ release state where the bug condition holds (`gradleVersionCode > jsonVersionCode`),
running the release script SHALL update `storefront/public/version.json` so that its
`versionCode` equals `gradleVersionCode` and its `versionName` equals the value from
`build.gradle.kts`, causing `AppUpdater.checkForUpdate` to show the update prompt to users on
older installed versions.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation — Non-Release-Sync Paths Unchanged

_For any_ execution path that does NOT involve running the release script (normal app usage,
existing storefront deployments, update download, APK install), the fixed codebase SHALL produce
exactly the same behaviour as the original codebase, preserving all runtime logic in
`AppUpdater.kt` and all storefront build/serve behaviour.

**Validates: Requirements 3.1, 3.2, 3.3**

---

## Fix Implementation

### Changes Required

**New File**: `android-app/scripts/release.ps1`

A PowerShell script (cross-platform via `pwsh`) that performs the full release sync:

1. **Parse version from build.gradle.kts**
   - Use regex to extract `versionCode = <int>` and `versionName = "<string>"` from
     `android-app/app/build.gradle.kts`.
   - Exit with an error if either value cannot be parsed.

2. **Validate build artifact exists**
   - Assert that `android-app/app/build/outputs/apk/release/app-release.apk` exists.
   - If not, print guidance to run `./gradlew assembleRelease` first and exit with code 1.

3. **Update storefront/public/version.json**
   - Read the existing JSON to preserve all fields (`appName`, `apkUrl`, `downloadUrl`,
     `minSupportedVersion`, `mandatory`, `releaseNotes`).
   - Overwrite `versionCode`, `versionName`, and `updatedAt` (current UTC ISO-8601 timestamp).
   - Write the result back to `storefront/public/version.json` with 2-space indentation.

4. **Copy APK to storefront**
   - Copy `android-app/app/build/outputs/apk/release/app-release.apk` →
     `storefront/public/StreamHeaven.apk`.
   - Overwrite any existing file.

5. **Print success summary**
   - Display the new `versionCode`, `versionName`, APK size in MB, and `updatedAt`.
   - Remind the developer to commit and deploy `storefront/public/`.

---

**Optional New File**: `.github/workflows/release.yml`

A GitHub Actions workflow triggered on `push` to tags matching `v*`:
- Checks out the repo.
- Sets up JDK and Gradle cache.
- Decodes the keystore secret and writes `keystore.properties`.
- Runs `./gradlew assembleRelease`.
- Runs `pwsh android-app/scripts/release.ps1`.
- Commits and pushes the updated `version.json` and `StreamHeaven.apk`.

---

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that confirm the
bug on the current (unfixed) state, then verify the release script produces the correct output and
that no existing runtime behaviour is affected.

---

### Exploratory Bug Condition Checking

**Goal**: Confirm that `version.json` does not auto-update when `build.gradle.kts` is changed, and
that `AppUpdater` consequently shows no prompt. Run these checks on the unfixed codebase.

**Test Plan**: Manually simulate a version bump and observe the delta between `build.gradle.kts`
and `version.json`. Then simulate the `AppUpdater` comparison in isolation.

**Test Cases**:
1. **Version mismatch check** (will demonstrate bug): Bump `versionCode` to `10` in
   `build.gradle.kts`. Read `version.json`. Assert `jsonVersionCode == 9` (stale) — this
   confirms `isBugCondition` is true and no prompt would appear. (Demonstrates bug on unfixed state)
2. **AppUpdater comparison simulation** (will demonstrate bug): Call `isNewerVersion("1.0.9", "1.0.8")`
   — returns `true`. But `version.json` still reports `"1.0.8"`, so the method would return `false`
   in practice. (Demonstrates bug on unfixed state)
3. **APK staleness check** (will demonstrate bug): After a new build, compare the SHA-256 of
   `app/build/outputs/apk/release/app-release.apk` with `storefront/public/StreamHeaven.apk`.
   They differ — users downloading the APK get the old build. (Demonstrates bug on unfixed state)
4. **Script absence check** (edge case): Assert that `android-app/scripts/release.ps1` does not
   exist — confirms there is no automated sync mechanism at all. (May demonstrate bug on unfixed state)

**Expected Counterexamples**:
- `version.json` `versionCode` is always stale after a `build.gradle.kts` bump.
- Possible causes: no script, no CI step, no build hook that writes `version.json`.

---

### Fix Checking

**Goal**: Verify that after running `release.ps1`, `version.json` matches `build.gradle.kts` and
the APK is replaced.

**Pseudocode:**
```
FOR ALL releaseState WHERE isBugCondition(releaseState) DO
  run release.ps1
  result := read(storefront/public/version.json)
  ASSERT result.versionCode  == releaseState.gradleVersionCode
  ASSERT result.versionName  == releaseState.gradleVersionName
  ASSERT result.updatedAt    is a valid ISO-8601 UTC timestamp within last 60s
  ASSERT sha256(storefront/public/StreamHeaven.apk)
         == sha256(app/build/outputs/apk/release/app-release.apk)
END FOR
```

---

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (i.e., `version.json`
is already in sync), running `release.ps1` produces an idempotent result and `AppUpdater` runtime
logic is completely unchanged.

**Pseudocode:**
```
FOR ALL releaseState WHERE NOT isBugCondition(releaseState) DO
  snapshot_before := read(storefront/public/version.json)
  run release.ps1
  snapshot_after := read(storefront/public/version.json)
  ASSERT snapshot_after.versionCode == snapshot_before.versionCode
  ASSERT snapshot_after.versionName == snapshot_before.versionName
  -- AppUpdater.kt source is unchanged
  ASSERT AppUpdater.kt hash is unchanged
END FOR
```

**Testing Approach**: Property-based testing is appropriate here because the script must behave
correctly for any valid combination of `versionCode` / `versionName` values, not just the current
`9` / `"1.0.8"` fixture. Generating random version pairs and asserting round-trip fidelity gives
strong coverage guarantees.

**Test Cases**:
1. **Idempotency**: Run `release.ps1` twice with the same build artifact; assert `version.json`
   content is identical on both runs (timestamps will differ by seconds — acceptable).
2. **Field preservation**: Assert that `appName`, `apkUrl`, `downloadUrl`, `minSupportedVersion`,
   `mandatory`, and `releaseNotes` in `version.json` are not changed by the script.
3. **AppUpdater.kt unchanged**: Assert that the source hash of `AppUpdater.kt` is the same before
   and after the fix is applied — the fix must not touch runtime code.

---

### Unit Tests

- Test the regex extraction logic: given a known `build.gradle.kts` content, assert the correct
  `versionCode` and `versionName` are returned.
- Test the JSON merge logic: given a known `version.json` and a new version pair, assert the output
  JSON contains the new values and preserves all other fields.
- Test error paths: missing `build.gradle.kts`, missing APK file, malformed version values — assert
  the script exits with code 1 and a descriptive message.

### Property-Based Tests

- Generate random valid `versionCode` integers (1–9999) and semver `versionName` strings; run the
  script with a mocked `build.gradle.kts`; assert `version.json` always reflects the generated
  values exactly.
- Generate random existing `version.json` payloads with arbitrary extra fields; assert all
  non-version fields survive the update untouched.
- For any `versionCode` where `gradleVersionCode <= jsonVersionCode`, assert the script still
  completes without error and `version.json` is updated to match (script is authoritative over
  `build.gradle.kts`, not the existing JSON).

### Integration Tests

- Full end-to-end: build a real debug APK with a specific `versionCode`, run `release.ps1` pointed
  at a temp directory, then assert that a simulated `AppUpdater` comparison on the new `version.json`
  triggers the update prompt path.
- Deployment smoke test: after committing the updated `version.json` and APK to a staging branch,
  fetch `https://staging.streamheaven.online/version.json` and assert `versionCode` matches
  `build.gradle.kts`.
- Cache-header test: send a `HEAD` request to `https://streamheaven.online/version.json` and assert
  `Cache-Control: no-cache, no-store, must-revalidate` is present (confirms `_headers` is effective).
