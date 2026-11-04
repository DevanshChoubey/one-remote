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

| Section            | Answer                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------- |
| Privacy policy     | A public URL of `PRIVACY.md` (for example its page on GitHub once the repo is public). |
| App access         | All functions work without special access. Note for reviewers: needs a TV, AC or fan.  |
| Ads                | No ads.                                                                                |
| Content rating     | Category "Utility, productivity, communication or other"; answer no to everything.     |
| Target audience    | 18 and over.                                                                           |
| Data safety        | Collects no data; shares no data. Traffic stays on the local network.                  |
| Government app     | No.                                                                                    |
| Financial features | None.                                                                                  |
| Health             | None.                                                                                  |

Play re-signs the app with its own key, so the Play build and an APK installed with adb cannot
update each other. Uninstall one before installing the other.
