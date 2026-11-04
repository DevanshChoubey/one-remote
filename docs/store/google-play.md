# Google Play release

How to build One Remote for Play and what to enter in Play Console.

## The upload key (once)

Make the key yourself and keep it, with its passwords, outside the repo (a password manager and
one offline backup). Losing it means asking Play to reset the upload key.

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore ~/keys/one-remote-upload.jks -alias one-remote-upload -keyalg RSA -keysize 4096 -validity 10000
```

Then add the four variables to `~/.gradle/gradle.properties` (not the repo's):

```properties
ONE_REMOTE_UPLOAD_STORE_FILE=/home/<you>/keys/one-remote-upload.jks
ONE_REMOTE_UPLOAD_STORE_PASSWORD=...
ONE_REMOTE_UPLOAD_KEY_ALIAS=one-remote-upload
ONE_REMOTE_UPLOAD_KEY_PASSWORD=...
```

`plugins/withReleaseSigning.js` signs release builds with this key when all four are set. Without
them a release build falls back to the debug key, which Play rejects.

## Build the bundle

1. Raise `expo.android.versionCode` in `app.json` for every upload; Play rejects a repeated one.
   1.0.0 is versionCode 1.
2. `bunx expo prebuild -p android`, then `cd android && ./gradlew bundleRelease`.
3. The file is `android/app/build/outputs/bundle/release/app-release.aab`. Check its signer:
   `keytool -printcert -jarfile android/app/build/outputs/bundle/release/app-release.aab` must not
   say `CN=Android Debug`.

## Play Console

1. Create the app: One Remote, package `com.devanshchoubey.oneremote` (fixed by the first upload),
   free, category House & Home.
2. Turn on Play App Signing when asked, and keep the upload key.
3. New personal accounts need a closed test first: at least 12 testers opted in for 14 days in a
   row before production access. Make a closed testing track, add the testers' Google accounts or
   a Google Group, upload the AAB, and share the opt-in link.

## App content

| Section            | Answer                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Privacy policy     | A public URL of `PRIVACY.md` (for example its page on GitHub once the repo is public).                                          |
| App access         | All functions work without special access. Note for reviewers: needs a TV, AC, fan or aer dispenser.                            |
| Ads                | No ads.                                                                                                                         |
| Content rating     | Category "Utility, productivity, communication or other"; answer no to everything.                                              |
| Target audience    | 18 and over.                                                                                                                    |
| Data safety        | Collects no data; shares no data. Traffic stays on the local network. Bluetooth stays in the room; no data collected or shared. |
| Government app     | No.                                                                                                                             |
| Financial features | None.                                                                                                                           |
| Health             | None.                                                                                                                           |

Play re-signs the app with its own key, so the Play build and an APK installed with adb cannot
update each other. Uninstall one before installing the other.

## Permissions

Every permission in the release manifest, and why it is there.

| Permission                                                               | Why                                                                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `INTERNET`, `ACCESS_NETWORK_STATE`                                       | Any network connection, including local ones. The app only connects to private addresses.              |
| `ACCESS_WIFI_STATE`, `CHANGE_WIFI_MULTICAST_STATE`                       | To find TVs and other devices on the home network (mDNS, SSDP).                                        |
| `CAMERA`                                                                 | Only while scanning a Matter QR code; read on the phone.                                               |
| `RECORD_AUDIO`                                                           | Only while the mic button is held, to type speech on a TV; recognised on the phone.                    |
| `TRANSMIT_IR`                                                            | To send IR codes to ACs and fans, on phones with an IR blaster.                                        |
| `VIBRATE`                                                                | A short tap of feedback on button presses.                                                             |
| `BLUETOOTH_SCAN` (`neverForLocation`), `BLUETOOTH_CONNECT`               | To find and control the aer air freshener in the room (Android 12 and newer). Never used for location. |
| `BLUETOOTH`, `BLUETOOTH_ADMIN`                                           | The same, on Android 11 and older (declared by the Bluetooth library for those versions).              |
| `POST_NOTIFICATIONS`                                                     | Refill, battery and check-in alerts, scheduled on the phone. No push messages.                         |
| `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`                                    | From expo-notifications: to bring scheduled local alerts back after a restart. No network use.         |
| `com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE` | Added by a library for the Play install referrer API; the app never calls it and sends nothing.        |
| Launcher badge permissions (`com.sec...`, `com.htc...` and similar)      | From expo-notifications' badge library: set the app icon's badge count on those launchers. No network. |

Absent on purpose: location, exact alarms, and everything for push (`c2dm`, Firebase messaging).

Google components that stay: ML Kit's QR scanner (model runs on the phone; its datatransport
backend is removed, so logging goes nowhere), `GoogleApiActivity` and the datatransport job
schedulers (declared so JobScheduler does not throw; with no backend they have nothing to send).
The Firebase component discovery service and init provider that expo-notifications pulls in are
removed by `plugins/withNoPush.js`. The `com.google.firebase.messaging.default_notification_color`
meta-data left behind is only a colour reference for notification icons, not a component.

## Release manifest check

Run before every upload, from a release APK built with `bunx expo prebuild -p android --clean`
and then, in `android/`, `ANDROID_HOME=$HOME/Android/Sdk ./gradlew :app:assembleRelease -q`:

```bash
$HOME/Android/Sdk/cmdline-tools/latest/bin/apkanalyzer manifest print android/app/build/outputs/apk/release/app-release.apk > /tmp/manifest.xml
grep -c 'BLUETOOTH_SCAN\|BLUETOOTH_CONNECT\|POST_NOTIFICATIONS' /tmp/manifest.xml   # present
grep -A1 BLUETOOTH_SCAN /tmp/manifest.xml                                           # usesPermissionFlags="0x10000" (neverForLocation)
grep -E 'ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION|SCHEDULE_EXACT_ALARM|USE_EXACT_ALARM|c2dm.permission.RECEIVE|FirebaseMessagingService|ExpoFirebaseMessagingService|FirebaseInstanceIdReceiver|TransportBackendDiscovery|com\.google\.firebase\.components\.ComponentDiscoveryService|com\.google\.firebase\.provider\.FirebaseInitProvider' /tmp/manifest.xml   # no output
grep -o 'android:name="com\.google[^"]*"' /tmp/manifest.xml | sort -u               # compare with the list above
```

Any new `com.google` service, receiver or provider is either removed by a plugin (with a test) or
written up above with why it cannot reach the network.
