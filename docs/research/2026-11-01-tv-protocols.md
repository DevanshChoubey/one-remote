# Local-network TV protocols for a multi-brand phone remote (research, 2026-11-01)

Method: primary sources read directly (GitHub source/docs fetched, Home Assistant manifests/docs, vendor docs). "UNCONFIRMED" = not verified from a primary source. Library licences are the GitHub-reported SPDX id at fetch time. Reverse-engineered protocols have no vendor licence; the library licence covers only the code, not any right to use the protocol.

---

## 1. Android TV / Google TV "Remote Service v2"

**Discovery**: mDNS `_androidtvremote2._tcp.local.` (HA manifest: https://github.com/home-assistant/core/blob/dev/homeassistant/components/androidtv_remote/manifest.json). Pairing service port 6467, remote port 6466 (defaults `pair_port`/`api_port` in androidtvremote2 `androidtv_remote.py`).

**Transport**: raw TCP + TLS (not WebSocket, not HTTP). Messages are protobuf, length-prefixed (varint). Same client SSL context for both ports. Server cert is self-signed per TV; androidtvremote2 turns hostname check and server verification OFF.

**Client certificate**: YES, required. The phone generates its OWN self-signed cert (androidtvremote2 `certificate_generator.py`: RSA-2048, e=65537, CN=client name, SAN DNS=name, BasicConstraints CA=true pathlen 0, serial 1000, SHA-256, 10 years). The TV remembers it after pairing. Store: client cert + private key (PEM). Losing it = re-pair. (If the TV's Android TV Remote Service data is cleared, re-pair too.)

**Pairing handshake** (port 6467, `pairing.py`; every msg has protocol_version=2, status=STATUS_OK):

1. C->TV `pairing_request{client_name, service_name="atvremote"}`; TV `pairing_request_ack`.
2. C->TV `options{preferred_role=INPUT, input_encodings=[HEXADECIMAL, symbol_length=6]}`; TV replies `options`.
3. C->TV `configuration{client_role=INPUT, encoding=HEXADECIMAL, symbol_length=6}`; TV `configuration_ack`. TV now displays the 6 hex-char code.
4. User types code. Client computes SHA-256 over, in order, ASCII bytes of: `hex(client_modulus)` (uppercase, no pad), `"0"+hex(client_exponent)`, `hex(server_modulus)`, `"0"+hex(server_exponent)`, then raw bytes `bytes.fromhex(code[2:])` (last 4 hex digits = 2 bytes). Moduli/exponents come from the client cert and the TV's TLS peer cert (DER). Client-side check: digest[0] must equal `int(code[0:2],16)` (first 2 hex digits); else wrong code. Client sends `secret{32-byte digest}`; TV replies `secret_ack`. Per-step timeout 10 s.
   (Official reference: AOSP `external/google-tv-pairing-protocol`, https://android.googlesource.com/platform/external/google-tv-pairing-protocol/+/refs/heads/master - linked from the androidtvremote2 README.)

**Protobuf schema**: `remotemessage.proto` (proto3, package `remote`) in androidtvremote2 - itself copied from louis49/androidtv-remote; `RemoteKeyCode` comments from Android keycodes.h. Also `pairing.proto` (404 at the path I tried; schema reconstructed from pairing.py - UNCONFIRMED exact file path). Source: https://github.com/tronikos/androidtvremote2/tree/main/src/androidtvremote2

**Remote session (port 6466)**: TV sends `remote_configure{code1=feature bitmask, device_info}`; client answers with its own `remote_configure` (features subset: PING=1, KEY, IME=4, POWER=32, VOLUME=64, APP_LINK, VOICE) and `remote_set_active`; TV sends `remote_start{started}` = power state and `remote_set_volume_level`. **Keepalive**: TV sends `remote_ping_request{val1}` every ~5 s when idle; client must echo `remote_ping_response{val1}`. Server drops after ~3 unanswered pings; androidtvremote2 closes if silent for 16 s and reconnects with backoff 0.1 -> 30 s.

**Capabilities**:

- Keys/D-pad: `remote_key_inject{key_code, direction}` with any Android KeyEvent code (DPAD__, HOME, BACK, MENU, VOLUME_UP/DOWN/MUTE, POWER, MEDIA__, SEARCH...). direction: SHORT=3, START_LONG=1, END_LONG=2.
- Text: IME. TV pushes `remote_ime_key_inject` (app_info, text_field_status) and `remote_ime_batch_edit{ime_counter, field_counter}`; client replies batch_edit with `RemoteEditInfo{insert=1, text_field_status{start,end,value}}` using the counters last received. Fragile if TV's own on-screen keyboard is open; HA says disable IME on TVs showing "use keyboard on mobile device" (https://www.home-assistant.io/integrations/androidtv_remote/).
- Volume: step via VOLUME_UP/DOWN keys; read level/max/muted from `remote_set_volume_level` pushes (`RemoteSetVolumeLevel{volume_max, volume_level, volume_muted, player_model}`). An absolute-set message exists in the schema, practical use UNCONFIRMED.
- Power: KEYCODE_POWER (toggle); `remote_start.started` = on/off pushed live.
- Launch app: `remote_app_link_launch_request{app_link}` - deep link/URL (e.g. `https://www.youtube.com`, `netflix://`). Bare package id is prefixed `market://launch?id=` and often fails (HA doc). Netflix needs `?source=30` for titles.
- Current app: via IME messages, `app_info.app_package` (only when IME feature enabled). Live push.
- Input/source list & switching: NOT in protocol (UNCONFIRMED any message). Workaround: KEYCODE_TV_INPUT / TV_INPUT_HDMI_1..4 key codes (exist in the keycode enum) - may not work on all TVs.
- Playback state: not reported (HA: "assumed").
- Voice: 16-bit mono PCM 8 kHz supported (not needed).

**Standby / power on**: No WoL in the protocol. Behaviour is vendor-specific (HA doc): Xiaomi becomes unavailable when off and can't be turned on; TCL unavailable unless "Screenless service" enabled; Nvidia Shield needs "simplified wake buttons" off. Ethernet-connected TVs that keep the Remote Service reachable in standby accept KEYCODE_POWER/WAKEUP; otherwise WoL (needs MAC; androidtvremote2 can read name+MAC from TV's pairing-port cert subject, `async_get_name_and_mac`) - effectiveness per model UNCONFIRMED.

**Coverage**: Any device with the "Android TV Remote Service" (pre-installed on most; service version >= 5 for v2 per drosocode/atvremote notes, https://pkg.go.dev/github.com/drosocode/atvremote). Works with the Google TV mobile app, i.e. Sony/TCL/Xiaomi(PatchWall)/OnePlus/Hisense Google/Android TVs, Chromecast with Google TV, Shield. HA doc says it only works if the Google TV / Google Home app can drive the device. NOT Fire TV (HA states unsupported). Specific confirmation NOT found for: Airtel Xstream box (Android 9 Android TV; has its own Airtel Smart Remote app), Jio STB, Tata Play Binge+ (Android TV based) - UNCONFIRMED. Xiaomi: one HA forum thread of a Mi Box 4 (MiTV-AFKR0) repeatedly failing to pair (https://community.home-assistant.io/t/android-tv-remote-mibox-4/764357); Xiaomi PatchWall TVs UNCONFIRMED. Sony Google TVs: protocol expected to work (Google TV app supports them), no primary-source confirmation retrieved.

**Reference implementations**:

- tronikos/androidtvremote2 - Python - Apache-2.0 - active (pushed 2026-10-05), used by HA core (quality scale platinum). https://github.com/tronikos/androidtvremote2
- louis49/androidtv-remote - JavaScript (Node) - MIT - last push 2023-07-06 (stale). https://github.com/louis49/androidtv-remote (README: save cert from `getCertificate()` and reuse; events secret/powered/volume/current_app)
- The proto file in androidtvremote2 carries no licence header (attribution to louis49 = MIT). Google's AOSP pairing-protocol code is Apache-2.0 (UNCONFIRMED, not opened).

**React Native feasibility (react-native-tcp-socket)**: https://github.com/Rapsssito/react-native-tcp-socket - MIT, v6.4.3 released 2026-09-10, last push 2026-09-10, ~397 stars, 36 open issues, not archived. Supports Android, iOS, macOS. `TcpSocket.connectTLS(options)` options: `ca`, `key`, `cert` (PEM, `<import>`(require'd asset) or string), `androidKeyStore`, `certAlias`, `keyAlias`. Client cert supported on both platforms (Android builds a KeyStore from cert+key PEM; iOS builds a SecIdentity and stores cert/key in Keychain). Server trust: Android uses a "BlindTrustManager" (accepts any server cert) when custom cert/key supplied, so no pinning needed for the TV's self-signed cert (read: `src` android `SSLCertificateHelper.java`). iOS code path for server trust not fully read - UNCONFIRMED it ignores the self-signed server cert. `socket.getPeerCertificate()` exists on both and returns `modulus` (uppercase hex), `exponent` ("0x"+hex), `bits` (Android confirmed in source; iOS returns a dict from `certificateToDict:detailed:YES` - fields UNCONFIRMED) - exactly what the pairing hash needs. Caveats: (a) native module -> needs Expo dev build/prebuild, not Expo Go; (b) package declares peer `react-native >=0.60`, old-style bridge module, no codegen found, so New Architecture needs the interop layer - UNCONFIRMED on Expo SDK 58; (c) the cert/key must be generated in JS (e.g. node-forge / react-native-quick-crypto / WebCrypto polyfill) since RN has no X.509 generator, then passed as PEM strings; PEM key format Android expects (PKCS8?) - check `getPrivateKeyFromPEM` - UNCONFIRMED; (d) protobuf encode/decode in JS (protobufjs or hand-rolled; schema is small). Store the key in secure storage.

---

## 2. Samsung Tizen (2016+)

**Discovery**: SSDP (HA manifest ST values: `urn:samsung.com:device:RemoteControlReceiver:1`, `urn:samsung.com:service:MainTVAgent2:1`, `urn:schemas-upnp-org:service:RenderingControl:1`); DHCP hostname `tizen*`; mDNS `_airplay._tcp` with manufacturer samsung* (https://github.com/home-assistant/core/blob/dev/homeassistant/components/samsungtv/manifest.json). REST info: `GET http://<ip>:8001/api/v2/` (or https 8002) returns device info (model, PowerState, WifiMac, etc.).

**Transport/ports**: WebSocket `ws://<ip>:8001/api/v2/channels/samsung.remote.control?name=<base64 name>` and `wss://<ip>:8002/...&token=<token>`. Library treats port 8002 as SSL with `cert_reqs=CERT_NONE` (self-signed, no client cert). Newer models effectively require 8002 + token.

**Pairing**: First connect shows an Allow/Deny popup on the TV; response event `ms.channel.connect` contains `data.token`. Store the token (string) per TV, send it as `&token=` on later connections. HA: newer TVs may ask each time unless Settings > Device connection manager > Access notification = "First time only". Source: samsungtvws `connection.py`, https://github.com/xchwarze/samsung-tv-ws-api

**Message format**: JSON. Key: `{"method":"ms.remote.control","params":{"Cmd":"Click","DataOfCmd":"KEY_HOME","Option":"false","TypeOfRemote":"SendRemoteKey"}}` (class RemoteControlCommand in `remote.py`). Text: `TypeOfRemote:"SendInputString"` (`remote.py` line ~236) and REST `GET /api/v2/remoteControl/imeInput/<text>?token=` (rest.py). Apps: `ms.channel.emit` with `ed.installedApp.get` (list), `ed.apps.launch` with `{action_type: DEEP_LINK|NATIVE_LAUNCH, appId, metaTag}`; REST `GET/POST/DELETE /api/v2/applications/<id>`.

**Keys** (COMMANDS.md): `KEY_UP/DOWN/LEFT/RIGHT/ENTER/RETURN`, `KEY_HOME`, `KEY_MENU`, `KEY_VOLUP/VOLDOWN/MUTE`, `KEY_SOURCE`, `KEY_HDMI`, `KEY_AV1..3`, `KEY_COMPONENT1..2`, `KEY_POWER`, `KEY_POWEROFF`, `KEY_POWERON`. Some keys vary by model/firmware.

**Input/source**: `KEY_SOURCE` opens the source menu, `KEY_HDMI` cycles; HA exposes TV/HDMI switching. No clean "set input = HDMI2" over the WS (UNCONFIRMED).

**State**: WS itself gives little. HA gets state via REST `/api/v2/` (PowerState) and UPnP (DMR: RenderingControl volume/mute on port 9197 - port UNCONFIRMED, not opened) for volume and source; polling for legacy. Current app: REST `applications/<id>` returns running/visible per app.

**Power**: Off: KEY_POWER (toggle). On: Wake-on-LAN (needs "Power on with Mobile" / WoL enabled and MAC, from REST `WifiMac`/`wiredMac`) - HA: "If discovery provided the MAC the integration uses WoL." Network stays up in standby on most Tizen TVs; unreliable on Wi-Fi-only models (UNCONFIRMED per model).

**Subnet**: WS refuses cross-subnet/VLAN clients (README).

**Coverage**: Tizen 2016+ (K series onwards). 2014-2015: H series and part of J are Orsay, encrypted v1 API.

**2014-2015 encrypted protocol**: samsungtvws `encrypted/` package: default port 8080 for the PIN/"CloudPINPage" authenticator, port 8000 for the remote session; AES (ECB session, CBC handshake with SHA-1 of the PIN) - complex, needs a hard-coded WB_KEY from the TV's app. Verdict: NOT worth it for 2026 (>=10-year-old sets, small India share), UNCONFIRMED share data.

**Reference**: xchwarze/samsung-tv-ws-api (`samsungtvws`) - Python - LGPL-3.0 (copyleft; porting the code in a closed app is a derivative-work question, but implementing from the documented message format is fine) - active (2026-09-11), used by HA. https://github.com/xchwarze/samsung-tv-ws-api . Alternatives: tavicu/homebridge-samsung-tizen - TypeScript - MIT - pushed 2026-10-27 (https://github.com/tavicu/homebridge-samsung-tizen, best licence for a JS port; protocol code not reviewed); Ape/samsungctl - Python - MIT - archived.

---

## 3. Amazon Fire TV

**There IS a non-ADB local protocol** - the one the official Fire TV app (`com.amazon.storm.lightning.client.aosp`) uses. Best (single, hobby-level) source: https://github.com/AustrianCanvasSociety/firehose-remote (Kotlin, MIT, 1 star, pushed 2026-10-05) `docs/protocol.md` - captured from the official app v4.7.0 logcat and live tests on real Fire TV Stick/TV hardware. NOT independently corroborated and not an Amazon-documented/supported API (could change; ToS risk) - treat as UNCONFIRMED beyond that source.

- **Transport**: HTTPS on `https://<ip>:8080` (JSON, self-signed cert, no client cert). Static header `X-Api-Key: 0987654321` (constant on all devices) + per-pairing header `X-Client-Token`.
- **Discovery**: SSDP M-SEARCH `ST: urn:dial-multiscreen-org:service:dial:1` (multicast 239.255.255.250:1900); the response includes a `WAKEUP` header with the TV's MAC (used for WoL). mDNS name also exists.
- **Wake**: `http://<ip>:8009/apps/FireTVRemote` (plain HTTP DIAL, works while asleep). API on 8080 answers only when awake (accepts TCP + TLS, then hangs when sleeping).
- **Pairing**: `POST /v1/FireTV/pin/display {"friendlyName":"..."}` (TV shows 4-digit PIN, valid 5 min), then `POST /v1/FireTV/pin/verify {"pin":"NNNN"}`; token is returned in the `description` field (literal "OK" means "not yet", retry up to 3x/1 s). Durable token - store it.
- **Commands**: `POST /v1/FireTV?action=` home, back, menu, select, dpad_up/down/left/right (select and dpad need keyDown then keyUp ~220 ms apart, body `{"keyActionType":"keyDown|keyUp"}`), `volume_up/mute/power` (device-dependent; `GET /v1/FireTV` returns capability flags e.g. `isVolumeControlsSupported`, `powerCapabilityLevelOfSupport`), `sleep`; `POST /v1/media?action=play|scan` etc. Voice (Alexa): `wss://<ip>:9090`, raw PCM (not needed).
- Not found/UNCONFIRMED: text input, app launch, input switching, reading current app/volume over 8080. `GET /v1/FireTV/status` is an awake-check only.
- **ADB alternative** (Amazon doc https://developer.amazon.com/docs/fire-tv/connecting-adb-to-device.html): Settings > My Fire TV > Developer options > ADB debugging ON (plus Apps from unknown sources); developer options hidden until tapping Build/"About" 7 times; port 5555 (5555-5585); first connect shows "Allow USB debugging?" with RSA-key fingerprint on TV, tick "Always allow". Needs a user-held RSA key stored on phone and an ADB protocol implementation in JS (adb-shell Python is what HA uses; https://www.home-assistant.io/integrations/androidtv/). HA state via polling; some Fire TVs go off the network when off. Difficulty: user setup high (4-5 steps + prompt), JS implementation moderate (ADB CNXN/AUTH/OPEN over raw TCP; AUTH needs RSA-2048 signing). Use as fallback only; probable Amazon sign-in requirement on some OEM Fire TVs (HA notes Insignia F30).
- Fire TV does not have the Android TV Remote Service (HA: not supported).
- India: Fire TV Stick plus Fire TV Edition TVs (Redmi, Acer, Toshiba etc.), share UNCONFIRMED.

---

## 4. Hisense / Toshiba (VIDAA) - MQTT 36669

**Transport**: MQTT over TLS 1.2 mutual-TLS on TV port 36669 (TV hosts the broker). Server cert self-signed (CERT_NONE like official app). **Client certificate required AND it is Hisense's own**: the integrations tell users to extract the vendor keystore (`res/El.p12` in APK `com.universal.remote.multi`, or `client_mobile_android.p12`) with a keystore password published in their docs; 2024+ firmware checks the cert subject (`CN=VidaaAppAndroidV01`), older 2018 certs get rc 5 Not Authorized. So the app cannot generate its own cert; it would have to ship/extract Hisense's private key = legal and redistribution blocker (UNCONFIRMED licence status; I would not assume it is permitted). Source: https://github.com/stevene1919/hisense_vidaa `docs/certificates.md`.
**Auth**: MQTT username/password derived from timestamp + MAC with hard-coded XOR constant and md5 pattern reverse-engineered from proprietary `libmqttcrypt.so` (3 generations: modern/middle/legacy; fixed fallback creds `hisenseservice`/`multimqttservice`). PIN pairing: publish `/remoteapp/tv/ui_service/<client_id>/actions/vidaa_app_connect`, TV shows 4-digit PIN, then `platform_service/.../data/gettoken` -> access token (48 h, used as MQTT password) + refresh token (30 days). Store tokens; auto-refresh. On regional-energy-standby TVs tokens are lost on power cycle (rc 4/134).
**Topics**: `/remoteapp/tv/remote_service/<id>/actions/sendkey` (KEY_*), `ui_service/<id>/actions/changesource {"sourceid":"HDMI1"}`, `ui_service/<id>/actions/launchapp {"appId","name"}`, `platform_service/<id>/actions/changevolume`, subscribe `.../data/sourcelist`, `.../data/applist`, broadcast `volumechange`, `tvsleep`, `ui_service/state` (live state: power, volume, source, app). Text input service exists (`send_text_input`).
**Extra**: unauthenticated UPnP/DLNA on 38400 (or 18400): RenderingControl GetVolume/SetVolume/GetMute - works without certs.
**Power on**: Wake-on-LAN (subnet-directed, try wired+Wi-Fi MAC); depends on Fast Power On / standby settings.
**Coverage**: Hisense VIDAA models 2018+ (U4G..U8K, A6/A7/E7 etc.); OEM VIDAA (Toshiba, Loewe, Schneider, Akai, Beko...) "pre-release" in that repo. Hisense Google TV models use Android TV Remote instead.
**Reference libs**: stevene1919/hisense_vidaa - Python - MIT (pushed 2026-10-28); sehaas/ha_hisense_tv - Python - MIT (older, pushed 2023-09-22, https://github.com/sehaas/ha_hisense_tv). Licence of the protocol/cert itself: none; derived from proprietary lib.

---

## 5. Roku ECP (brief)

HTTP port 8060, no auth, no pairing. Discovery SSDP `ST: roku:ecp` (and mDNS). `POST /keypress/<KEY>`, `/keydown/`, `/keyup/`, `/launch/<id>[?contentId=&MediaType=]`, `GET /query/apps`, `/query/active-app`, `/query/device-info` (`power-mode`), `/query/media-player`. Text: `keypress/Lit_<char>` when keyboard is up. Settings > System > Advanced > Control by mobile apps must be Enabled/Permissive. Power: PowerOn/PowerOff keys on Roku TV; WoL via network standby setting. Source: https://developer.roku.com/docs/developer-program/dev-tools/external-control-api.md . Reference: ctalkington/python-rokuecp - Python - MIT (pushed 2026-10-28). Marginal in India (UNCONFIRMED).

## 6. Sony Bravia

- Official: https://pro-bravia.sony.net/develop/integrate/ip-control/index.html - REST (JSON-RPC over HTTP), IRCC-IP (SOAP over HTTP, sends IR codes), Simple IP Control (TCP).
- HA (https://www.home-assistant.io/integrations/braviatv/): "almost all Bravia from 2013+"; enable Settings > Network > Remote device settings > "Control remotely"; auth either PIN (TV shows code, cookie/token) or PSK (Settings > Network > Home Network Setup > IP Control > Authentication "Normal and Pre-Shared Key"/"Pre-Shared Key", user sets key, header `X-Auth-PSK`). SSDP `urn:schemas-sony-com:service:ScalarWebAPI:1`. REST also works on Sony Google/Android TVs but gives no app/media details; WebApiCore sometimes needs a TV reboot.
- Newer Sony Google TVs: also have the Android TV Remote Service (Google TV app drives them) - expected to work with v2, no primary-source confirmation found; REST/IRCC remain available too.
- Library: Drafteed/pybravia - Python - MIT (pushed 2026-10-30).

## 7. Philips, Panasonic, Xiaomi

- Philips JointSPACE: v1 (port 1925 http), v5, v6 (https 1926; Android TV models): v6 needs PIN pairing (pairRequest -> PIN -> pairGrant -> username/password, digest auth). mDNS `_philipstv_s_rpc._tcp`/`_philipstv_rpc._tcp`. Power on: v6 Android only if TV "always on"; v1 WoL. Android-based Philips TVs also have the Android TV Remote Service (v2). Lib elupus/ha-philipsjs (haphilipsjs) - Python - MIT. Source: https://www.home-assistant.io/integrations/philips_js/
- Panasonic Viera: port 55000, PIN pairing on newer (encrypted) models, power-on via WoL or "Powered On By Apps" setting, 44 listed models incl. older (not 2024 Android sets); lib florianholzapfel/panasonic-viera - Python - MIT. Newer Panasonic Android/Fire TVs: use Android TV Remote or Fire (UNCONFIRMED). Source: https://www.home-assistant.io/integrations/panasonic_viera/
- Xiaomi/Redmi (PatchWall on Android TV): Remote Service present (HA lists Xiaomi quirks: unavailable when off, cannot be turned on); v2 compatibility UNCONFIRMED beyond the Mi Box 4 forum report; Xiaomi/Redmi Fire TV models use Fire protocol.

---

## 8. IR fallback

**Hardware reality**: iPhones have no IR emitter; few Android phones still have an IR blaster (Android `ConsumerIrManager`). UNCONFIRMED current share. So IR fallback realistically only works on a subset of Android phones, or via an external Wi-Fi IR blaster (breaks "no extra hardware").

**Databases**:

- Lucaslhm/Flipper-IRDB - CC0-1.0 (repo LICENSE) - BUT README says CC0 only applies to commits after 2319685; earlier commits "are not covered" (so ~unlicensed). Format `.ir` text (name, type parsed/raw, protocol, address, command). Pushed 2026-04-12, ~4.4k stars. TVs/ has 118 brand folders; **no Onida, Videocon, Micromax, Vu, Kodak, Mi-branded** folders; Xiaomi: 1 file (no parsed protocol), Android: 1 file (NEC), Haier: 1 (NEC), Hisense 14, TCL 12, Samsung 57, LG 37, Sony 26, Panasonic 21, Philips 20, Toshiba 11. https://github.com/Lucaslhm/Flipper-IRDB
- probonopd/irdb - GitHub shows NOASSERTION; custom LICENSE.md: may include in apps (commercial or not) only if you (1) open an issue to inform the project, (2) include a notice ("Contains/accesses irdb by Simon Peter and contributors, used under permission..."), (3) give up to 3 free product units on request. Not an OSI licence; the "three free copies" clause is awkward for a free app but not impossible. https://github.com/probonopd/irdb/blob/master/LICENSE.md
- LIRC remotes database (lirc-remotes at SourceForge; mirrors e.g. probonopd/lirc-remotes - GitHub reports no licence): per-file licensing unclear - UNCONFIRMED; avoid.
- Code libs: Arduino-IRremote (licence NOASSERTION: it is MIT-style per file headers, UNCONFIRMED), crankyoldgit/IRremoteESP8266 - LGPL-2.1 (protocol encoders/decoders for reference only; protocols themselves are facts).
- Safest legal path: generate codes from the protocol definitions (NEC, Samsung32, SIRC, RC5/6, Kaseikyo) plus a small hand-built per-brand address/command table; do not bundle either database without the licence handling above.

**Protocol coverage from Flipper-IRDB TV files (count of parsed signal entries; my tally on the 2026-04-11 checkout)**:

- Samsung: Samsung32 (1589) - almost all; LG: NEC (1049) + NECext 30; Sony: SIRC 12-bit (499), SIRC15 (253), SIRC20 (6); Hisense: NECext 287, NEC 122; TCL: RCA (141) and NECext (98) (Roku-TCL uses NEC-ish ext); Panasonic: Kaseikyo (546); Philips: RC6 (388), RC5 (88); Toshiba: NEC (170), RC5 (29); Sharp: NEC; Haier: NEC; Android generic: NEC; Vizio: NEC; Hitachi: RC5/NEC.
- So NEC family (NEC/NECext) + Samsung32 + SIRC cover the bulk of Indian TV brands (LG, Samsung, Sony, Hisense, Xiaomi-class Chinese sets, Videocon/Onida/Micromax are typically NEC - UNCONFIRMED, they are not in the DB), with RC5/RC6 for Philips and Kaseikyo for Panasonic. Carrier ~38 kHz (SIRC 40 kHz, RC5/6 36 kHz, Kaseikyo 37 kHz).

---

## 9. India TV market share (what could be sourced)

- IDC via India TV (2025-05-15): India smart TV 2024: 12.1 M units (+8.6% YoY). Share: Samsung 16.1%, LG 15.1%, Xiaomi 11.7% (14.2% in 2023), TCL 8.4%, Sony 8.2% (top-5 = 59.5%; rest ~40.5% by my arithmetic). https://www.indiatvnews.com/technology/news/smart-tv-shipments-in-india-jumped-8-6-per-cent-in-2024-samsung-lg-lead-the-market-2025-05-15-990408
- Omdia H1 2025 (total TV shipments, via Aju Press 2025-09-01): Samsung 23.8% (9th straight year top), LG 16.5% (LG leads value, 27.5% per GfK), Xiaomi 7.9%. https://www.ajupress.com/view/20250901141047741 (search snippet; page not opened - treat as secondary)
- OS split: Mordor Intelligence says Android TV ~67.4% of India smart TV + OTT in 2025, with "Proprietary Linux", Fire OS, IndOS as other segments (https://www.mordorintelligence.com/industry-reports/india-smart-tv-and-ott-market) - low-quality aggregator, no Tizen/webOS/VIDAA/Fire percentages, no Google TV vs Android TV split. **Real OS shares for Tizen, webOS, Fire TV, VIDAA: UNCONFIRMED (no credible public source found).**
- Brand -> OS mapping (my inference from product knowledge, UNCONFIRMED by a cited source): Samsung = Tizen; LG = webOS; Sony, TCL, Hisense (many), OnePlus, Xiaomi/Redmi (Android TV + PatchWall; some Fire TV), Acer, Vu, Kodak, Thomson, Motorola, Panasonic (Android) = Android/Google TV; Hisense/Toshiba(OEM) entry sets = VIDAA; Redmi/Toshiba/Acerpure Fire TV Edition = Fire OS. Implication: Tizen + webOS cover roughly the Samsung+LG brand shares (~31% of 2024 smart TV units, ~40% of H1 2025 total TV); Android/Google TV covers most of the rest.

## Priority recommendation (for the design)

1. Android TV Remote v2 (largest coverage, self-generated cert, Apache-2.0 reference, RN lib supports client certs) 2. Samsung Tizen WS (token only, wss self-signed) 3. Roku/Sony REST/Philips/Fire (HTTP-ish, cheap) 4. Fire TV via 8080 (undocumented, single source) / ADB 5. VIDAA (blocked by vendor client cert) 6. IR only on Android phones with blaster.
