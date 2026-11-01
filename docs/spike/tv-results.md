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
