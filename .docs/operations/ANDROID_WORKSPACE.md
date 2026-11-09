# Android workspace APK

The Android version is a directly installable, signed APK. It is not submitted to Google Play. Source is in `native/Android`; it uses the same production account, permissions, chapter member identity and event APIs as the iPhone app and website.

## Install

Copy `artifacts/android/GDG-Workspace-1.0.0.apk` to the Android phone and open it. Android will ask the owner to allow installation from that file source. The app needs Android 9 or newer and an updated Android System WebView. Enable NFC on phones used for cards. Camera permission is requested when QR scanning starts. No storage, contacts, location or microphone permission is requested.

The app is called **GDG Workspace**, package `dev.gdggt.workspace`, version 1.0.0, build 1. No production password, provider key or access token is inside the APK. Enter the normal access code, email and password. The app has native Home, Events, Check-in, Members and More navigation, a native toolbar, notifications, account controls and the complete permission-filtered tool directory. Shared workflow screens run in an Android WebView; they are not separate native implementations of every editor. Native navigation keeps the existing website's draft safeguards.

Remember with biometrics encrypts the account credentials using a device-bound Android Keystore key. Every decryption requires a strong face or fingerprint biometric. Some Android face unlock implementations do not meet that strength; those devices can use a supported fingerprint or manual sign-in. Enrollment changes invalidate the saved key. Passwords never enter JavaScript or browser storage. Only ciphertext is saved to private preferences. Account data and the key are excluded from backup/device transfer. The app locks on background, checks server session/account status on unlock, and reauthenticates after biometric approval if the session has expired. Valid remembered sessions reopen their current page. File pickers and the share sheet preserve their in-progress action. Release builds protect private screens from screenshots and recent-app previews.

Sign out and forget account uses the server sign-out route and clears the saved biometric secret, web cookies/storage and private export files. A server failure leaves the account intact so sign-out can be retried. A changed password/access code needs manual sign-in. The app needs a live connection for member validation and mutations; it does not award points offline.

## Scanning and writing

- Physical cards: use the same unlocked, pre-NDEF-formatted NTAG215 PVC cards described in [the iPhone guide](IPHONE_SCANNER.md). Native Android reader mode reads the opaque chapter URL. Writing asks for confirmation, refuses existing data, verifies capacity/writability and reads back the exact NDEF message. The app does not erase, permanently lock, clone UIDs or format unsupported cards.
- QR: use the camera for the long-lived Apple or Google Wallet QR, a printed credential or the same physical card's QR. Detection freezes the frame, focuses the detected code and dims the surrounding image before the member lookup. Invalid QR codes keep the camera open. Duplicate detection, Stop, navigation, sign-out and background cancellation are handled. Reduced motion uses a brief static confirmation.
- Apple Wallet NFC: the Android APK has no Apple VAS reader. The iPhone implementation remains separately gated by Apple approval.
- Google Wallet NFC: ordinary Android reader mode is not a Smart Tap terminal. This APK does **not** claim to read Google Wallet NFC. See [Google Wallet and Smart Tap](GOOGLE_SAMSUNG_WALLET.md) for the certified-reader requirement and prepared pass-side configuration. QR works independently of Smart Tap.

No tap automatically grants event admission or points. The existing event connector checks registration; the officer confirms check-in. Point changes continue to require Super Admin permissions on the server.

Authorized HTTPS downloads and browser-generated CSV/JSON exports use the Android share sheet. Files remain in private app cache, bounded to 64 MiB, and are removed on relaunch/sign-out. Downloads reject redirects, unexpected types and oversized content. Blob exports use a bounded, origin-scoped chunk bridge, not arbitrary filesystem access. Uploads use Android's file picker. External links open outside the admin WebView.

## Build and updates

Use JDK 17, Android SDK platform/build-tools 35, and the checked-in Gradle 8.11.1 wrapper. The project uses Android Gradle Plugin 8.9.2. On this Mac the SDK is under `~/Library/Android/sdk`. Generated classes, reports and APK outputs live under `~/Library/Caches/GDG GT/Android` (or `GDG_ANDROID_BUILD_DIR`), outside the iCloud-synced Desktop, to avoid duplicate class files from sync conflict copies.

The release key is outside Git at `~/Library/Application Support/GDG GT/Android Signing/gdg-workspace.jks`; its private password file is beside it. Keep a private backup of both. Future APK updates must retain this key and package name and increment `versionCode`. Losing the signing key prevents in-place updates; replacing it requires uninstall/reinstall. Never publish either signing file or put it in a website environment variable.

```sh
python3 native/Android/build-release.py
```

The script reuses the existing key, runs release compilation/unit tests/lint, verifies the APK signature, rejects debuggable output and writes the APK/checksum under `artifacts/android`. It does not upload anywhere. Other machines can set `JAVA_HOME`, `ANDROID_HOME`, `GDG_ANDROID_KEYSTORE` and `GDG_ANDROID_PASSWORD_FILE` to their local paths.

```sh
JAVA_HOME=$(/usr/libexec/java_home -v 17) \
ANDROID_HOME="$HOME/Library/Android/sdk" \
native/Android/gradlew -p native/Android :app:testDebugUnitTest :app:lintDebug :app:connectedDebugAndroidTest
```

The connected test requires an emulator or Android test device. Current verification covers policy rejection, bounded export isolation, compilation/signature and an Android 15 emulator launch/form check. It does not establish real-device biometric, camera, NFC card or event-day acceptance. No production member fixtures or point awards were created by these checks.
