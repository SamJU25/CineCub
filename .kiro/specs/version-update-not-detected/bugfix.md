# Bugfix Requirements Document

## Introduction

When a new version of the StreamHeaven Android app is built and released, two update mechanisms fail silently: the in-app update prompt never appears for users on older versions, and users who download the APK from the browser receive the previously published build. The root cause is that `storefront/public/version.json` and `storefront/public/StreamHeaven.apk` are not updated in sync with `android-app/app/build.gradle.kts` — this synchronisation step is entirely manual and has no enforcement, making it easy to omit during a release.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a developer bumps `versionCode` and `versionName` in `build.gradle.kts` and publishes a new APK build THEN the system leaves `version.json` unchanged, so `remoteVersionCode` equals the installed `versionCode` and no update dialog is shown to existing users.

1.2 WHEN a user with an older installed version opens the app after a new release THEN the system fetches a stale `version.json` whose `versionCode` matches the user's installed version, causing `AppUpdater` to silently skip the update prompt.

1.3 WHEN a user visits `https://streamheaven.online/StreamHeaven.apk` to download the app after a new release THEN the system serves the old APK binary because `storefront/public/StreamHeaven.apk` has not been replaced with the newly built file.

1.4 WHEN a developer completes a release THEN the system provides no automated or enforced mechanism to keep `version.json` and `StreamHeaven.apk` in sync with the values in `build.gradle.kts`, making the synchronisation step easy to forget.

### Expected Behavior (Correct)

2.1 WHEN a developer bumps `versionCode` and `versionName` in `build.gradle.kts` and publishes a new release THEN the system SHALL ensure `version.json` reflects the same `versionCode` and `versionName` so that `AppUpdater` correctly detects a newer remote version.

2.2 WHEN a user with an older installed version opens the app after a new release THEN the system SHALL show the update prompt because `remoteVersionCode` in `version.json` is greater than the user's installed `versionCode`.

2.3 WHEN a user visits `https://streamheaven.online/StreamHeaven.apk` after a new release THEN the system SHALL serve the newly built APK binary so that the downloaded file matches the version advertised in `version.json`.

2.4 WHEN a developer completes a release THEN the system SHALL enforce or automate the update of `version.json` and the replacement of `StreamHeaven.apk`, preventing a release where these artifacts are out of sync with `build.gradle.kts`.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user already has the latest version installed THEN the system SHALL CONTINUE TO suppress the update prompt so users are not prompted to install a version they already have.

3.2 WHEN `AppUpdater` fetches `version.json` THEN the system SHALL CONTINUE TO append a timestamp query parameter (`?t=`) and set `useCaches = false` to bypass HTTP caches on the device side.

3.3 WHEN the network is unavailable during an update check THEN the system SHALL CONTINUE TO silently ignore the error and not crash or disrupt normal app usage.

3.4 WHEN a user taps "Update Now" in the update dialog THEN the system SHALL CONTINUE TO download the APK from the `apkUrl` specified in `version.json` and prompt installation.

3.5 WHEN `version.json` is requested by any client THEN the system SHALL CONTINUE TO serve it with `Cache-Control: no-cache, no-store, must-revalidate` headers as currently configured in `_headers`.

3.6 WHEN `StreamHeaven.apk` is requested by any client THEN the system SHALL CONTINUE TO serve it with `Cache-Control: public, max-age=0, must-revalidate` headers as currently configured in `_headers`.
