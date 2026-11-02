# TV hardware spike results

Filled in after the hardware runs (Task 5, steps 6 and 7).

## Run 1 (2026-10-30, Realme X, debug build over USB)

The pass bar was not reached: pairing failed before the TV showed a prompt. The phone and the C4
were on the same network (phone 192.168.0.147, TV 192.168.0.193).

## Runs 2 and 3 (2026-10-31 and 2026-11-01, Realme X, debug build over USB)

Sockets now go through the `lan-socket` native module (OkHttp), with the TV's certificate pinned
at pairing. Pairing, keys, text, inputs and Wake-on-LAN work on the C4.

- **The C4 refuses the signed manifest** that lgtv2 and most libraries send: `403 Pairing
rejected: blacklisted certificate detected`. The client retries with an unsigned manifest
  whose permissions include the signed block's (d725293); without that merge, keys and text get
  `401`. Home Assistant, ioBroker and lgtv2 2.0.2 do the same.
- **Input picker:** webOS 26 answers `500 Application error` to launching
  `com.webos.app.inputpicker`, and `Unknown method` to `com.webos.surfacemanager/showInputPicker`.
  The app now lists `tv/getExternalInputList` in its own sheet and switches with
  `tv/switchInput` (4735d25). The C4 lists HDMI 1-4; switching to HDMI 1 worked.
- **Wake-on-LAN** failed at first: `react-native-udp` throws when an array message comes with an
  offset and length. Fixed in 1088c80; the TV then woke from off and the app reconnected about
  20 s after the tap (the TV's boot time, mostly).
- **Two routers:** the TV moved to 192.168.1.14 on the other router's Wi-Fi. The phone could
  ping it, but SSDP does not cross routers, so the app showed "off". Once the phone joined the
  TV's Wi-Fi, the app found the TV at its new address by itself. A way to enter the TV's address
  by hand would cover homes like this.
- **Touchpad:** up and down swipes were taken by the screen's scroll view; the TV screen no
  longer scrolls (80ae526). The phone's font has no ⏻ glyph; it is gone from the buttons.

## Devices

- Phones and OS versions: Realme X (RMX1901), Android 11 (API 30). Not one of the plan's phones;
  the iQOO and S21 FE runs are still to do.
- LG C4 firmware: webOS 26 (2026 update).

## Network

- Port that answered (3000 or 3001): both accept TCP from the phone's shell (`nc`), but port 3000
  closes a plain WebSocket handshake without replying. The app's `ws://...:3000` fails within
  about 0.1 s.
- React Native `WebSocket` accepted `wss://3001` (yes/no, error): no. It fails within about
  0.1 s with no error text. This fits the TV's self-signed certificate being rejected, but the
  certificate was not inspected directly.
- `react-native-udp` built under the new architecture (yes/no): yes (debug build, Android).
- `wss://3001` through `lan-socket` with the pinned certificate (runs 2, 3): yes.
- SSDP replied on Android (yes/no): yes. Discover found the C4 in 1.4 s; it reports
  `usn=uuid:2066574d-4a25-7efa-5ae0-9b6b5b0dc230`.
- C4 SSDP headers:
- `getinfo` MAC matched the TV's settings (yes/no): it reports 20:37:f0:69:a7:cc, the MAC the
  router shows for the TV and the one that wakes it. Not checked against the TV's own menu.

## Input

- Input picker opened (yes/no): no (see runs 2 and 3); the in-app input list works.
- `insertText` `replace:true` replaced the field (yes/no): yes, while a text field is open on the
  TV. With none open, the TV does not reply.
- `PAUSE` / `PLAY` worked (yes/no): sent without error; not yet checked with a video playing.

## Pass bar (per phone)

- Reconnect times: after Wake-on-LAN, about 20 s from the tap.
- Pair with the C4: failed in run 1 (see Network); works from run 2 on.
- 100 touchpad moves with no visible lag: 100 presses in 162 ms, none failed. Swipes in all four
  directions work.
- Lock and unlock 10 times, reconnect within 1 s: not run.
- TV IP change, recovered by itself: yes, once the phone was on the TV's Wi-Fi.
- Power on from off over Wake-on-LAN ("Turn on via Wi-Fi" on): yes, after 1088c80.
- Phone volume buttons change the TV volume: yes; one press was lost right after an app reload,
  not reproduced.

## Android TV spike (Airtel Xstream)

Status: code only. The spike buttons are in `app/dev/tv-spike.tsx` (block "Android TV spike").
The phone has not run them, and the box has not been checked. The hardware steps need the author
present, so they are pending. Run them with the controller.

- Pending: the box is on and on the same Wi-Fi as the phone (plan Task 1 step 3).
- Pending: "Android TV Remote Service" present on the box, and its version (v2 needs version 5 or
  later).
- Pending: ATV browse, ATV probe, ATV TLS 6467, ATV TLS 6466, ATV forget, logged on the phone
  (plan Task 1 step 5). Record each log line here, whether the 6466 and 6467 certificate SHA-256
  values match, and what an unpaired identity gets on 6466 (an error, or a close after N ms).
- Pending: laptop cross-check with `avahi-browse -rt _androidtvremote2._tcp` and `openssl s_client`
  on 6467, to record the certificate subject (plan Task 1 step 4).
- Go/no-go: pending.

## Android TV run 1 (Airtel Xstream)

Status: Android TV: untested on hardware. The lane was built and tested on the fake TV
(`src/androidtv/testing`); the spike (Task 1) and the pass bar (Task 10) need the phone and the box,
and were not run. Both are pending, to run with the author present.

Pending, per spec §7:

1. Pair: Add TV, Find my TV, the box shows "Google TV / Android TV · <ip>", type the code. Also try a
   wrong code first, and "Show a new code".
2. Keys and touchpad in four directions, OK, Back and Home. 100 touchpad moves with no visible lag.
3. Keyboard: type "news" into a search field on the box. With no field open, expect the error line.
4. Volume +/- and mute from the screen and the phone's volume keys. Does the box push its level?
5. Input: the button sends KEYCODE_TV_INPUT. Does the box show a picker?
6. Power off, then on. Which path worked: the power key in standby, IR, or none (the off panel then
   shows the Android TV line)?
7. IP change (DHCP reservation, or Wi-Fi off and on): the app finds the box again by pin.
8. Remove the device: the box asks to pair again on the next add.

Open questions the run must answer, because the fake guesses them:

- Does the certificate on 6466 equal the one on 6467? (The fake uses one certificate for both.)
- What does an unpaired identity get on 6466: an error code, or a close after N ms? (The fake fails
  `notSent` "handshake failed".)
- Does the certificate subject carry the MAC (`CN=atvremote/<model>/<mac>`)? Without it there is no
  `link.mac` and Wake on LAN is unavailable; power on then relies on the standby session or IR.
- Is the Remote Service version 5 or later?
- Does the box in standby accept a 6466 session and report `started: false`?

If the hardware differs from the fake, update `src/androidtv/testing/fakeAtv.ts` and fix the tests.

## Android TV run 2 (2026-11-01, Airtel Xstream, Realme X release build)

Status: pairing and keys pass. The rest of the pass bar is still pending.

Box: IP 192.168.1.11, certificate subject
`CN=atvremote/HY0001-Airtel/HY00A/XStream-Smart-Box-002/10:76:36:6C:B7:61`.

Answers to the open questions:

- Ports 6466 and 6467 serve the same certificate (SHA-256 64:3A:D1:…:54:9B).
- The subject carries the MAC, so `link.mac` and Wake on LAN are available.
- An unpaired identity completes TLS 1.3 on 6466 and then gets alert 46 "certificate unknown" about
  0.5 s later. With no client certificate, it gets alert 116 "certificate required".

Results:

- The first pairing attempt failed with "Couldn't reach the TV". The cause was a Keystore
  "Incompatible padding mode" error during TLS 1.3 client auth. Fixed in f9d06ae: the client key now
  allows PURPOSE_DECRYPT with ENCRYPTION_PADDING_NONE, and an older key is regenerated.
- 1. Pair: pass. The code was typed on the phone and the box was saved.
- 2. Keys: pass for Home, Right, Right, Down and Back. The box responded to each.
- 4. Volume: pass for +/-.
- Still pending: wrong code, touchpad, keyboard (3), mute, input (5), power off and on (6), IP
  change (7), and remove device (8).

## Samsung Tizen (lane/samsung): untested on hardware

Date: 2026-11-01.

No Samsung TV was available; the driver is proven against the fake TV only (spec §7, §9).

Model / year / firmware: (fill in)

Before the run, on the TV: Settings › General › Network › Expert Settings › Power on with mobile =
on. Run it with any Samsung Tizen TV (2016 or later) and a phone on the same Wi-Fi.

| #   | Item                                                                                                                                                                                                   | Result |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 1   | Find: the TV appears in the Add TV search with the "Samsung" word, and by typing its address.                                                                                                          |        |
| 2   | Pair: "Press Allow" shows (or not, if the TV allows all); after Allow the device is added with name, model and MAC from the info page. Remove and add again.                                           |        |
| 3   | Keys: up, down, left, right, OK, Back, Home on the touchpad (four directions) and the D-pad.                                                                                                           |        |
| 4   | Volume and mute: the buttons and the phone's volume keys.                                                                                                                                              |        |
| 5   | Input: the button opens the TV's own source picker (`KEY_SOURCE`).                                                                                                                                     |        |
| 6   | Keyboard: open a text field on the TV and type. Confirm whether `SendInputString` appends or replaces what is in the field, and whether non-ASCII works.                                               |        |
| 7   | Play/Pause: in a player, tap three times. Confirm the `KEY_PAUSE` / `KEY_PLAY` alternation (change the pick in `src/samsung/keys.ts` if the TV has a better single key).                               |        |
| 8   | Power off: `KEY_POWER` turns it off; Home shows it off within about 10 s.                                                                                                                              |        |
| 9   | Power on: the Turn on button wakes it by Wi-Fi (WoL). Confirm it also works for a TV on a cable, and what MAC the info page gives for it (`wifiMac` only?). If not, record the hint's wording problem. |        |
| 10  | Standby: with the TV in standby the app shows it off and opens no socket.                                                                                                                              |        |
| 11  | IP change: change the TV's address (reboot the router or a static IP); the app finds it again by MAC with no prompt.                                                                                   |        |
| 12  | Token revoked: delete the phone in the TV's device list; the app says "Pair the TV again" once and the TV shows no repeated prompts. Re-pair from the device sheet.                                    |        |
| 13  | Wrong network: phone on mobile data shows the "Can't reach it" panel, no hang.                                                                                                                         |        |
| 14  | Info page: confirm it is served on 8001 on this model (some firmware may need 8002). Record `GET http://<ip>:8001/api/v2/` output (without the MAC) so the parser can be adjusted.                     |        |

## Voice (lane/voice)

Date: 2026-11-02.

Items 1 and 2 passed on the Airtel box with the Realme X (release build). Items 3 to 5 are still
untested. Hold the mic button on the TV screen for each item.

| #   | Item                                                                                                                                         | Result |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | The Airtel box negotiates the voice bit (feature 8), so the mic button shows on its screen.                                                  | Pass   |
| 2   | The assistant answers phone audio: hold the mic, ask something, release. Check the 2 s wait for `remote_voice_begin` and the 8000 Hz format. | Pass   |
| 3   | Dictation on an Android 13+ phone: needs an installed on-device language. The mic shows on LG and Samsung only when it can run offline.      |        |
| 4   | Dictation on an iPhone: the text reaches an open TV search box. With no box open the line says to open one first.                            |        |
| 5   | The mic is hidden on the Android 11 test phone for LG (no on-device recognition there), and the rest of the screen is unchanged.             |        |

What it took on the Airtel box (Assistant opened at once, but heard nothing until all of these):

- **8000 Hz PCM16 mono.** 16 kHz made no difference, so the format stays at 8 kHz.
- **Whole 20480-byte messages.** Each 100 ms mic piece padded to 8192 bytes garbled the speech, and
  shorter messages gave an empty result (androidtvremote2 issue #49).
- **A gain on the phone mic.** The speech-recognition source on the Realme X peaks near 1300 of
  32767; the app lifts the loudest peak to about 16000 (at most 16x).
- **Do not close on release.** Closing at once cancels the search. After release the app sends
  silence every 1280 ms until the box sends its own `remote_voice_payload` (the end of speech),
  then closes 2 s later, or after 8 s at most.

Other findings from the run:

- When the box stops trusting the phone's pairing, the app says "TV is off", then "Can't reach it".
  It should say to pair again; "Pair again" in Device settings fixed it.
- "Turn on" (Wi-Fi wake) did nothing while the box was in deep standby.
