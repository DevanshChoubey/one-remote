# One Remote: market scan, validation and design notes so far

Carried over from the brainstorming session on 2026-10-30. This is the starting context for the
design spec (`docs/superpowers/specs/`), which does not exist yet.

## 1. Why this app

The idea started as "find popular Play Store apps with bad ratings, then build a better one of our
own" (not a copy: our own code, name and design). Scraping the Play Store (charts for India and the
US, about 9,000 apps, plus 637 hardware companion apps, then 300 recent Indian reviews each for 32
low-rated apps) showed:

- Paid apps are a dead end. The biggest low-rated app on the paid charts has about 500k installs.
- The real gap is apps for hardware the user already owns: vendor apps and remote-control apps
  that are bloated, full of ads, need an account, or just do not connect.
- IR remote apps for ACs and fans are the clearest opportunity:

| App                                      | Installs  | Rating                                                              | Main complaints                                                                         |
| ---------------------------------------- | --------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Mi Remote                                | 100M      | 3.57                                                                | Double key presses, missing remotes, forced login                                       |
| Universal AC Remote Control (TV Master)  | 10M       | 4.16 overall, but recent reviews split 165 five-star / 122 one-star | ₹1,100 charged while the AC "wasn't found", ads on every press, asks for a card upfront |
| AC Universal Remote Control (SensusTech) | 5M        | 3.71                                                                | Ad on every button, guessing the model, missing temperatures                            |
| Fan Remote Control                       | 1M        | 3.11                                                                | Three ads before setup ends, never says an IR blaster is needed                         |
| Remote for Lloyd AC (two apps)           | 100k each | 2.75 to 3.06                                                        | "Only ads here"                                                                         |

Vendor smart-home apps score even worse: Atomberg 2.39, Voltas Smart 2.58, Blue Star Smart AC 2.71,
Panasonic MirAIe 3.65, Wipro Next 2.84, Havells Smart 1.87. Their reviews are mostly about pairing,
devices vanishing and forced logins.

## 2. The product idea (from the user)

One simple app that replaces the bloated vendor apps (LG ThinQ, Atomberg, the AC remote apps).
Each device type gets the best possible layout. For the TV, copy the feel of Google's Android TV
remote (a big touchpad, few buttons), which the user calls "the best overall". For the AC, fans
and the rest, research what the best layout is. "Bloated" and "over the top" are the failure
modes to avoid.

Positioning (working idea): no ads, no account, no cloud, a one-time ₹99 to ₹149 purchase.

## 3. The user's test bench

| Device                              | How we would talk to it                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LG OLED C4 (webOS)                  | Home Wi-Fi, directly to the TV (LG's SSAP WebSocket, with a separate pointer socket for touchpad, clicks and buttons). One-time "allow" prompt on the TV, no LG account. |
| Panasonic AC with Matter            | Matter over Wi-Fi, local. Biggest single piece of work, on both platforms. Plan as a later phase.                                                                        |
| Panasonic AC, Wi-Fi via MirAIe only | MirAIe is a cloud service, so use IR instead (Panasonic AC protocol is in IRremoteESP8266).                                                                              |
| 2× Atomberg fans                    | IR (SmartIR has two Atomberg remotes; check them against the real fans).                                                                                                 |
| Urban Company Native water purifier | Cloud only, no local or standard interface. Out of v1, on the "later, maybe" list.                                                                                       |

Phones: iQOO Z10x 5G (IR blaster according to spec listings; confirm with
`adb shell pm list features | grep consumerir`), Samsung S21 FE (no IR), Realme X (no IR), iPhone (no
IR), plus an Android emulator.

## 4. Decisions so far

- Name: One Remote. Repo `DevanshChoubey/one-remote`, private at first, now public under the MIT licence (decided 2026-11-06).
- Android and iPhone from the start (the user's call). iPhone gets TV and Matter AC only, since iPhones
  have no IR.
- Suggested order (the assistant's call, the user can overrule it): TV first, then IR for the AC and
  fans, then the Matter AC.
- The purifier is out of v1.
- Build it the same way as Aer Remote and Home Inventory: same stack, engineering rules, spec → visual
  mockup → hardware spike → plan in lanes → PRs with green CI.

## 5. Technical findings

### IR

- Android exposes IR through `ConsumerIrManager` (carrier frequency plus on/off pulse timings) with
  the `TRANSMIT_IR` permission, which needs no prompt. An Expo native module for it is small (about 50
  lines of Kotlin).
- Declaring `android.hardware.consumerir` as required hides the app on phones without IR. Since TV
  control works on any phone, IR must be optional instead, and the IR screens hidden when the phone
  has no IR blaster.
- Phones receive no IR, so the app cannot learn codes from a remote. Capturing codes for missing
  brands needs an ESP32 with an IR receiver (about ₹400 to ₹500).
- About a quarter to a third of phones in use in India have IR (an estimate, not measured): Xiaomi,
  Redmi and Poco, many iQOO, Vivo T-series, Realme P-series and the OnePlus Nord CE do. Samsung and
  iPhones do not.
- Still to check: whether Vivo and iQOO phones expose their IR blaster through the standard API.

### IR code sources

| Source          | License                                                                             | Coverage                                                                                                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IRremoteESP8266 | LGPL-2.1                                                                            | About 80 AC protocols, including Voltas, Daikin, LG, Samsung, Panasonic, Hitachi, Carrier, Whirlpool, Haier, Midea, Gree, TCL and one Blue Star model. Porting it to TypeScript is a derivative work, so publish that module under LGPL. |
| SmartIR         | MIT (the name "SmartIR" must not be reused)                                         | 358 AC files, mostly brands from Europe and Israel; Voltas 1, Whirlpool 1, Haier 3, Atomberg fans 2.                                                                                                                                     |
| irdb            | Custom (notify the project, ship a notice, give up to three free copies on request) | Mostly TVs, with almost no AC codes. Skip it.                                                                                                                                                                                            |

Gaps: Lloyd, Godrej, Onida, most Blue Star models, and Indian fan brands (Crompton, Havells, Orient,
Usha, Polycab).

### LG webOS

- Control is local over the LAN: SSAP over WebSocket (port 3000, or 3001 for secure connections on
  newer firmware), paired with a TV prompt (`pairingType: PROMPT`), which returns a client key.
- Buttons, pointer moves and clicks go over a second socket from
  `ssap://com.webos.service.networkinput/getPointerInputSocket`. The C4 has a Magic Remote cursor, so a
  touchpad can drive both the D-pad and the cursor.
- Reference implementation: `lgtv2` on npm (MIT).

### iPhone

- No IR.
- Shows a local network permission prompt.
- LG TVs announce themselves with SSDP multicast, and iOS needs Apple's multicast entitlement
  for that. The workaround is to probe the TV port on the home subnet, with "enter the TV's IP" as a
  backup.

### Privacy rule (differs from Aer Remote)

Aer Remote strips the `INTERNET` permission from release builds. One Remote cannot, because Android
needs that permission for any socket, local ones included. The rule becomes "local network only":
all networking lives in one transport folder, connections go only to private addresses (RFC 1918
and link-local), there is no cloud or analytics, and a lint rule plus a test enforce it.

## 6. Google TV remote reference

The Google TV phone remote (in the Google Home app) defaults to a swipe pad, with a D-pad mode in the
three-dot menu. It also has a microphone for voice search, a keyboard for text input, and back, home
and power. It is deliberately bare-bones, and that is what the user likes about it.
