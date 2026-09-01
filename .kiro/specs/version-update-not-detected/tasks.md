# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - version.json Reflects Latest Build
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the desynchronisation between `build.gradle.kts` and `storefront/public/version.json`
  - **Scoped PBT Approach**: Scope the property to the concrete failing case: `gradleVersionCode=10`, `jsonVersionCode=9`, `installedVersionCode=9` (simulate a post-build, pre-sync state)
  - Test that after bumping `versionCode` to `10` in `build.gradle.kts` (or a temp fixture), `version.json` still reports `versionCode=9` — i.e., `isBugCondition(state)` returns `true`
  - Assert that `gradleVersionCode > jsonVersionCode` (the script `android-app/scripts/release.ps1` does NOT yet exist, so the desync is never corrected)
  - Assert that `android-app/scripts/release.ps1` does not exist (confirms absence of the automated sync mechanism)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS — confirms the bug condition holds and no sync mechanism exists
  - Document counterexamples found (e.g., "`version.json` reports `versionCode=9` while `build.gradle.kts` reports `versionCode=10`; `release.ps1` is absent")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Release-Sync Paths Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: `AppUpdater.kt` source file hash on unfixed code — record the SHA-256
  - Observe: `storefront/public/_headers` content — record the Cache-Control rules for `version.json` and `StreamHeaven.apk`
  - Observe: `storefront/public/version.json` field set (`appName`, `apkUrl`, `downloadUrl`, `minSupportedVersion`, `mandatory`, `releaseNotes`) — record all non-version fields
  - Write property-based test: for all valid `versionCode` / `versionName` pairs generated as input, after running `release.ps1`, all non-version fields in `version.json` must remain exactly as observed (field preservation invariant)
  - Write property-based test: for any state where `gradleVersionCode == jsonVersionCode` (bug condition is false), running `release.ps1` produces `version.json.versionCode == jsonVersionCode` — the script is authoritative and idempotent
  - Verify `AppUpdater.kt` hash is identical to the recorded value (source unchanged)
  - Verify `_headers` content is unchanged
  - Verify tests PASS on UNFIXED code (these properties hold regardless of whether the fix is applied, because they test invariants of the storefront and runtime files)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix: introduce release sync script for version-update-not-detected

  - [x] 3.1 Create `android-app/scripts/release.ps1`
    - Parse `versionCode` and `versionName` from `android-app/app/build.gradle.kts` using regex (`versionCode\s*=\s*(\d+)` and `versionName\s*=\s*"([^"]+)"`)
    - Exit with code 1 and a descriptive message if either value cannot be parsed
    - Assert `android-app/app/build/outputs/apk/release/app-release.apk` exists; if not, print guidance to run `./gradlew assembleRelease` first and exit with code 1
    - Read `storefront/public/version.json`, parse as JSON, overwrite only `versionCode`, `versionName`, and `updatedAt` (current UTC ISO-8601 timestamp), preserve all other fields (`appName`, `apkUrl`, `downloadUrl`, `minSupportedVersion`, `mandatory`, `releaseNotes`)
    - Write updated JSON back to `storefront/public/version.json` with 2-space indentation
    - Copy `android-app/app/build/outputs/apk/release/app-release.apk` → `storefront/public/StreamHeaven.apk` (overwrite)
    - Print success summary: new `versionCode`, `versionName`, APK size in MB, `updatedAt`, and reminder to commit/deploy `storefront/public/`
    - _Bug_Condition: isBugCondition(state) where gradleVersionCode > jsonVersionCode (or gradleVersionCode > installedVersionCode AND jsonVersionCode <= installedVersionCode)_
    - _Expected_Behavior: After script runs — version.json.versionCode == gradleVersionCode, version.json.versionName == gradleVersionName, version.json.updatedAt is valid UTC ISO-8601 within last 60s, SHA256(storefront/public/StreamHeaven.apk) == SHA256(app/build/outputs/apk/release/app-release.apk)_
    - _Preservation: AppUpdater.kt source unchanged; _headers rules unchanged; all non-version fields in version.json preserved; storefront build pipeline unaffected_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.2 (Optional) Create `.github/workflows/release.yml`
    - Trigger on `push` to tags matching `v*`
    - Check out repo, set up JDK and Gradle cache
    - Decode keystore secret and write `keystore.properties`
    - Run `./gradlew assembleRelease`
    - Run `pwsh android-app/scripts/release.ps1`
    - Commit and push updated `storefront/public/version.json` and `storefront/public/StreamHeaven.apk`
    - _Requirements: 2.4_

  - [x] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - version.json Reflects Latest Build
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior (script exists, version.json matches build.gradle.kts after script runs)
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES — confirms script exists and version sync works correctly
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Release-Sync Paths Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS — confirms no regressions in AppUpdater.kt, _headers, or non-version fields in version.json
    - Confirm all preservation invariants hold after the fix (no regressions)

- [x] 4. Checkpoint — Ensure all tests pass
  - Re-run the full test suite (exploration test from task 1, preservation tests from task 2)
  - Confirm exploration test PASSES (bug is fixed)
  - Confirm preservation tests PASS (no regressions)
  - Verify `storefront/public/version.json` has `versionCode` and `versionName` matching `build.gradle.kts`
  - Ensure all tests pass; ask the user if questions arise
