# One Remote: Design

_Date: 2026-10-30 · Status: approved by the author, 2026-10-30_

Background, market scan and technical findings: `docs/research/2026-10-30-market-and-validation.md`.
Screens and flows: `docs/design/one-remote-mockup-v4.html` (v3 is the approved main screens; v4 adds
every flow).

## 1. Intent and the why

Every device at home comes with its own app, and the apps are the problem: LG ThinQ, Atomberg's app,
Panasonic MirAIe and the ad-filled IR "AC remote" apps are bloated, want an account, show ads on every
press, or simply lose the device. The Play Store reviews for these apps say the same thing (see the
research notes, section 1).

**One Remote is a single, simple remote for the TV, the ACs and the fans.** It talks to each device
directly on the home network or by IR from the phone. It needs no account and no cloud, has no ads, and
feels as light as Google's Android TV phone remote, which the author calls "the best overall".

The author's words for success: _a single remote for all of them, easy to reach, and no disconnect
issues._

## 2. Users

- The author's household first, then anyone in India with these kinds of devices. Non-technical family
  members must be able to use it unaided.
- Test bench: LG OLED C4 (webOS), a Panasonic AC with Matter, a Panasonic AC with IR only (its Wi-Fi is
  MirAIe cloud), two Atomberg fans (IR).
- Phones: iQOO Z10x (IR blaster), Samsung S21 FE (no IR), Realme X (no IR), an iPhone (no IR), plus
  the Android emulator.

## 3. Goals

1. **One remote for everything on the bench.** The LG TV, both ACs and both fans work from this app,
   so the vendor apps can be uninstalled.
2. **One device, one card, one screen.** How the app reaches a device (Wi-Fi, Matter or IR) is the
   app's business. The user picks _what_ a device is (TV, AC, fan), never _how_ it connects. A
   device may have more than one link. IR is a quiet backup where the device and phone allow it. The
   link shows only in one small line on the remote screen and in the device sheet.
3. **No connection trouble.**
   - Opening a remote feels instant: the app connects (or reconnects) in the background and the
     controls are usable straight away.
   - If the TV's IP address changes, the app finds the TV again by itself.
   - When a link is down, the app says so in plain words with one thing to do, and falls back to IR
     where it can. It never shows a spinner that hangs.
4. **Screens (from the mockup):**
   - **Home:** devices grouped by room, a quick power toggle per card, + to add, a gear for
     settings. Empty state is the welcome screen.
   - **TV:** touchpad by default (swipe to move, tap to select), D-pad on choice (remembered per TV),
     volume rocker, Back, Home, Mute, Keyboard, Input, Play/Pause, Power. The phone's volume keys
     control the TV while its screen is open (a setting, on by default).
   - **AC:** dial with − and +, mode (Cool, Dry, Fan, Auto), fan speed, Swing, Sleep, Timer. If the
     link reports state (Matter), the screen shows the real state and the room temperature. On IR it
     shows what was last sent. Every IR press sends the full state. Buttons the AC lacks are hidden.
   - **Fan:** five tall speed bars, Boost, Sleep, timer chips, Light and LED only if the fan has them.
5. **Add a device** (mockup v4):
   - **TV:** brand (LG only in v1) → find it on Wi-Fi → "Press Allow on the TV" → name and room.
     Manual IP is the backup.
   - **AC and fan:** brand → if the brand sells Matter models, scan the Matter QR (or type the code)
     → else, or afterwards on IR phones as a backup, find the right IR remote by testing buttons one
     candidate at a time → name and room.
   - On a phone without IR, the IR step is replaced by a plain explanation, with "Add anyway (for
     another phone)".
   - Name and room is one shared last step. Rooms are created inline.
6. **Phones without IR** (Samsung, iPhone): devices that only take IR stay on Home, greyed out, with
   "Needs a phone with IR". A banner explains it once.
7. **Device sheet** (⋯ on a remote, or long-press a card): rename, room, reorder, "How it's
   connected" (re-pair, add or redo IR backup, TV address), remove.
8. **Settings:** theme (system, light, dark), volume keys, vibrate on press, rooms (rename, reorder),
   privacy, about and licences.
9. **Local network only.** No account, no cloud, no analytics, no ads.

## 4. Non-goals (v1)

- **Pricing and payments.** The app is free for now. Charging later (the earlier idea was ₹99 to ₹149
  one-time, never ads) is a separate decision.
- **Widgets, quick-settings tiles, lock-screen controls.** The author wants these looked at later. The
  architecture should allow them, since they need the same device layer without a screen.
- TV brands other than LG, other device types (purifier, lights, geysers), scenes and automations,
  voice assistants, Home Assistant.
- Learning IR codes from a physical remote (phones can't receive IR). New codes come from the code
  sources or a later ESP32 capture tool.
- Store release. Builds are installed directly for now, as with Aer Remote.
- Sharing devices between phones (each phone sets up its own list).

## 5. Anti-goals

- Anything that makes it feel like the apps it replaces: bloat, a login, ads, upsells, a "store" or a
  feed.
- Losing devices, or a remote screen that sits on "connecting…".
- Showing the user a choice of transport ("Matter or IR?") or the word "protocol".
- Any connection outside the home network.
- Letting someone pay or set up for a long time before finding out their AC or phone isn't supported.

## 6. Decisions

### Stack and engineering rules

Same as Aer Remote: **Expo (SDK 58) + TypeScript, Bun only**, with Aer Remote's `docs/ENGINEERING.md`
copied and adapted: layering, primitives, centralized theme tokens with dark mode, i18n strings, strict
TS, typed errors, TDD, Prettier and ESLint, lefthook, Conventional Commits, CI, 80% coverage on
domain code. Differences:

- **Domain modules** _(Claude's call)_:
  - `src/core`: device model, links, rooms, capability types.
  - `src/ir`: IR protocol encoders (AC and fan state → pulse timings) and the code catalogue.
  - `src/webos`: LG SSAP client and pointer socket (pairing, buttons, pointer, keyboard text, volume,
    power, inputs).
  - `src/matter`: a Matter controller interface (commission, read state, send commands, subscribe).
  - `src/device`: the device layer. It picks a link per command, falls back, reconnects, finds the TV
    again and holds per-device state.
  - `src/store`: local data.
  - `src/transport`: the only place with sockets, discovery and the native IR and Matter adapters.
- `src/core`, `src/ir`, `src/webos` and `src/device` are pure TypeScript (no React Native or Expo
  imports), enforced by ESLint. They are tested in plain Jest against fakes: a fake TV socket server,
  a fake IR emitter that records pulses, and a fake Matter controller.
- **Privacy rule, "local network only".** Android needs `INTERNET` for any socket, so it stays.
  Instead:
  - all networking lives in `src/transport`;
  - every outgoing unicast address must be "local", checked before connecting, with a typed error
    otherwise _(Claude's call)_. Local means:
    - IPv4 private (RFC 1918), link-local or loopback;
    - IPv6 ULA, link-local or loopback;
    - an address inside one of the phone's own on-link prefixes, which covers a router handing the
      Matter AC a global IPv6 address.
  - Broadcast is allowed only to the subnet broadcast (Wake-on-LAN). Multicast is allowed only to
    SSDP (239.255.255.250), mDNS (224.0.0.251, ff02::fb) and other link-local multicast scopes;
  - `fetch` and `XMLHttpRequest` are banned by ESLint everywhere, and a test enforces both rules;
  - no analytics, crash reporting or remote config.

  The "Brand missing?" link opens the phone's mail app with a draft. Nothing is sent by the app.

### Device model _(Claude's call)_

- A **device** has a kind (TV, AC, fan), name, room, order and one or more **links**, in priority order
  (for example a Matter AC: `[matter, ir]`; the bench TV: `[webos, ir]` where the phone has IR; the
  fans: `[ir]`).
- **Capabilities** come from the links (which modes, fan speeds and extras exist), and the screens show
  only those.
- A command goes to the first link that is usable now. On failure or timeout it falls back to the next
  link that supports the command, and the bottom line on the screen says so. While a better link is
  down, the device layer retries it with backoff and switches back when it answers.
- **State:** links that report (webOS, Matter) are the truth. IR-only devices keep the last state sent
  and show it as such.

### TV (LG webOS)

- Discovery: SSDP on Android, plus a port probe of the home subnet as a fallback (iOS without the
  multicast entitlement uses the probe only). Manual IP is the last resort.
- Pairing: SSAP over WebSocket (3000, or secure 3001 on newer firmware) with the TV's prompt. Store the
  client key and the TV's MAC address.
- Input: everything goes over the pointer input socket as button messages. The touchpad works like
  Google's: a swipe sends D-pad moves (a long swipe repeats), a tap sends OK. The Magic Remote cursor
  (pointer moves) is **not in v1** _(Claude's call)_, so the mockup's two-finger hint is dropped. Plain
  text from the keyboard sheet goes over SSAP text input.
- Live state: the TV screen and its Home card subscribe to the foreground app, volume and power while
  the app is open. AC and fan cards show live state only for links that report (Matter); IR cards
  show the last state sent _(Claude's call)_.
- Phone volume keys control the TV on **Android only**. iOS doesn't let apps capture the hardware
  volume keys, so the setting is hidden on iPhone _(Claude's call)_.
- "No disconnects": keep the socket open while the TV screen is open, with a heartbeat. Reconnect
  silently on loss. If the saved IP fails, rediscover by the stored MAC and update the address.
- Power-on: the TV leaves Wi-Fi when off. Milestone 2 uses Wake-on-LAN, which works when "Turn on via
  Wi-Fi" is enabled on the TV; the copy says how to turn it on. Milestone 3 adds IR power-on for phones
  with IR, using LG's standard NEC TV codes, which IRremoteESP8266 covers _(Claude's call)_.
- Reference: `lgtv2` (MIT) for message shapes. Write our own client.

### IR

- A small Expo native module for Android `ConsumerIrManager`: `hasIrEmitter()`, `transmit(freq,
  pattern)`. The `TRANSMIT_IR` permission is declared, and `android.hardware.consumerir` is declared
  **not required**. iOS reports no emitter.
- AC and fan codes: encoders ported from IRremoteESP8266 (Panasonic AC first, then the brands in the
  research table), kept in a separate LGPL-2.1 module, `src/ir/lgpl/`, with its own licence notice.
  Fan codes and missing remotes come from SmartIR (MIT, with attribution, never using the name
  "SmartIR"). _(Claude's call.)_
- The IR test step goes through a brand's known remotes one at a time. "Yes" is confirmed with a second
  button.
- **v1 brands** _(Claude's call)_:
  - Panasonic AC, Atomberg fan and LG TV power (the bench).
  - Other brands (Voltas, Daikin, LG AC, Samsung, Hitachi and the rest of the research table) come
    after v1, in small batches.
  - A brand appears in the add list only once its encoder is ported and unit-tested against
    IRremoteESP8266's reference timings.
  - The mockup's longer brand list shows where this is heading, not v1.
- The IR spike records the bench devices' remote model numbers. If the Panasonic variant or the SmartIR
  Atomberg codes don't match, capture the real codes with an ESP32 before going further.

### Matter

- Commission and control the Panasonic AC as a thermostat / room air conditioner cluster (on/off,
  mode, setpoint, fan control, local temperature).
- Android: commission with Google Play services' Matter commissioning API into the app's own fabric,
  then control through a native Matter controller.
- iPhone: Apple's Matter framework (`MatterSupport` for setup, `Matter.framework` for control). This
  needs the Matter entitlements.

  How this sits inside Expo is the big unknown; see §8.
- If the AC is already set up in another app (MirAIe, Google Home), the copy explains how to get a
  fresh pairing code from that app (Matter multi-admin).
- **Open, to confirm before the Matter spike** (asked, not yet answered):
  - Does the author have a paid Apple Developer account? iPhone Matter needs Apple's Matter
    entitlements. Until confirmed, the plan treats iPhone Matter as conditional: Android Matter first,
    and the iPhone gets TV only if the entitlement isn't available.
  - Is the bench Matter AC already set up in MirAIe or Google Home? The default is to add One Remote as
    a second controller (multi-admin) with a pairing code from that app. A factory reset needs the
    author's OK.

### Build order

1. Project skeleton (engineering rules, theme, i18n, primitives, store, fakes, CI).
2. TV.
3. IR (AC and fans).
4. Matter AC.

Each milestone ships usable builds. The home screen, the add flow shell and the device sheet are built
once, in milestone 2, and reused.

### Parallel build _(Claude's call; the author wants to build "using subagents in parallel, fast")_

After milestone 1, these lanes are independent, because they meet only at the `src/core` types and the
device layer's interfaces:

| Lane | Area |
| --- | --- |
| A | `src/webos` + the TV transport |
| B | `src/ir` encoders + catalogue |
| C | the IR native module |
| D | `src/matter` spike |
| E | UI screens against the fake devices |

Interfaces are frozen in milestone 1 so lanes don't collide. Every lane works on its own branch and
reaches `main` through a PR with green CI, as in Aer Remote.

### Local data

Devices, links (TV client key, MAC, last IP; IR remote id; Matter node id and fabric data), rooms,
order, last known state and UI preferences (D-pad vs touchpad per TV). Small, on device only. Secrets
such as the TV client key and the Matter fabric keys go in secure storage. The builder picks the rest.

### Visual design

Calm, modern, minimal, with big touch targets, following the mockups' layout. Visual direction (palette
and type) is not chosen yet. The builder starts from the mockup's neutral tokens in the central theme,
so a later direction is a token change. _(Claude's call.)_

### Distribution

`DevanshChoubey/one-remote`, private. The licence of the app as a whole is still open. The IR encoder
module is LGPL-2.1 either way (see the research notes).

## 7. Constraints

- Android and iPhone from the start. iPhone gets the TV and Matter only.
- Android 8+ for IR (`ConsumerIrManager` exists since 4.4). The minimum SDK is whatever Expo SDK 58
  requires.
- iOS local network permission (`NSLocalNetworkUsageDescription`, Bonjour services). The multicast
  entitlement is optional; discovery must work without it.
- Builds: written on Linux. Android is built locally. iPhone builds are made on the author's Mac with
  Xcode (`bunx expo run:ios`). Native modules mean a dev build, not Expo Go.
- The TV, the phones and the Matter AC must be on the same Wi-Fi.
- Confirm the iQOO's IR with `adb shell pm list features | grep consumerir`, and check that Vivo/iQOO
  expose it through the standard API.

## 8. Risks and spikes

1. **Matter inside Expo** (biggest). It needs a native controller on both platforms, Google Play
   services commissioning, Apple entitlements, and fabric storage.
   - **Spike:** commission the bench AC into the app's own fabric on Android and on iPhone, then read
     the room temperature and change the setpoint.
   - **Pass bar:** 5 of 5 setpoint changes reflected on the AC within 2 s on both platforms.
   - **If it fails on a platform:** ship TV + IR first and keep Matter behind a flag on that platform.
     Come back to the author only if neither platform can commission.
2. **LG pointer socket and reconnect behaviour** on the C4's firmware. TV spike, Android and iPhone:
   - pair;
   - 100 touchpad moves with no visible lag;
   - lock and unlock the phone 10 times and reconnect within 1 s each time;
   - change the TV's IP and recover by itself;
   - power on from off over IR and over Wake-on-LAN.
3. **IR on the iQOO** (vendor API quirks) and whether the Panasonic and Atomberg codes match the real
   devices.
   - **Spike:** native module + Panasonic AC full state + Atomberg speed and power.
   - **Pass bar:** 10 of 10 presses work from 3 m.
4. **Code coverage for Indian brands** (Lloyd, Godrej, Blue Star, Crompton, Havells…) is thin. It
   doesn't block v1, but it limits who else can use the app. An ESP32 capture tool is a later project.

## 9. Left to the builder

- State management, navigation, storage, WebSocket and component libraries.
- How the touchpad maps gestures to moves (thresholds, acceleration); tune on the C4.
- Exact timeouts, heartbeat, backoff and rediscovery intervals (tuned in the spikes).
- Copy, empty states, haptics, animation.
- The IR code catalogue format, and how candidates are ordered in the IR test.
- Which Matter controller library or SDK wraps the native side, decided by the spike.
