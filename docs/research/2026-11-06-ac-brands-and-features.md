# AC brands and features: research and proposed plan (2026-11-06)

Four research passes (web and source reading, nothing tested on hardware except where noted):
Panasonic feature gap, IR AC brands for India, Wi-Fi ACs with local control, and a MirAIe
no-cloud workaround. The full reports follow the plan.

Verified on the bench the same day: the Panasonic AC answers the `dke` IR encoder (power on Cool 24,
power off), sent from the iQOO Z10x.

## Proposed plan (awaiting the user's OK)

1. **Panasonic features over IR (DKE first).** Powerful and Quiet; vertical swing positions 1-5 + auto
   and horizontal swing (DKE, RKR); five fan speeds; nanoe (ion, DKE). Then on/off timers with clock.
   AcState gains optional fields; the old `swing` boolean migrates to vertical auto. Each new field is
   gated by capabilities per model. Mock first (one central mock), then code, then a bench test.
2. **IR harness for more brands.** `encode()` may return several frames, and the driver tracks assumed
   state for toggle-style protocols. Port IRremoteESP8266 encoders (LGPL, in `src/ir/lgpl/`) with their
   test vectors, in order: Samsung, LG (LG2), Daikin, Hitachi, Carrier, Whirlpool, Haier, Mitsubishi
   Heavy; then the OEM group (Coolix, Midea, Gree) as guesses for Voltas, Blue Star, Lloyd and Godrej,
   which need a real remote to confirm.
3. **Wi-Fi without cloud.** Gree local UDP (clean-room, the references are GPL) first; Daikin older
   adapters second, after a real Indian unit confirms the adapter. Midea v3 and Tuya only with a pasted
   key (no cloud call in the app). Panasonic Matter: test the existing driver on a real Matter unit.
4. **Out of scope:** MirAIe cloud (no verified local path; keep IR). LG ThinQ, Samsung SmartThings,
   Haier hOn, Hitachi airCloud and other cloud-only Wi-Fi: use IR.

---

## Panasonic AC (India): feature gap vs One Remote

Today: power, mode (cool/dry/fan/auto), setpoint 16-30 int, fan auto/1/2/3, swing bool (V auto vs V middle; H fixed middle), sleep=false.

Sources

- IRremoteESP8266 header: https://raw.githubusercontent.com/crankyoldgit/IRremoteESP8266/master/src/ir_Panasonic.h
- IRremoteESP8266 impl: https://raw.githubusercontent.com/crankyoldgit/IRremoteESP8266/master/src/ir_Panasonic.cpp
- Panasonic India 2025 range / MirAIe features: https://www.fonearena.com/blog/448047/panasonic-matter-enabled-ac-2025-price-india.html
- Search overview (MirAIe, 7-in-1, AI mode, proximity): https://store.in.panasonic.com/air-conditioners/split-ac/ (model pages 404'd via fetch)
- Matter FanControl types: https://cdn.jsdelivr.net/npm/@matter/types@0.17.0/src/clusters/fan-control.d.ts
- Matter device listing (Panasonic, FanControl + Thermostat): https://www.matteralpha.com/panasonic/aiseg3-p4089
- HA thread on Thermostat+FanControl: https://community.home-assistant.io/t/matter-thermostat-fan-control/627888

Caveat: IR byte/bit positions below come from the library's code summary (byte 21 = quiet/powerful, byte 16 = fan hi nibble / swingV lo nibble, byte 17 lo nibble = swingH, bytes 18-20 timers, 24-25 clock, byte 13 = power/mode/timer-enable flags). Exact bit masks for quiet/powerful/ion must be read from the header consts (kPanasonicAc*Offset) at implementation time; not verified here. No Panasonic India model-specific PICS file found, so Matter column is spec-level, not confirmed on a real Panasonic unit (no source states which attributes the Panasonic Matter ACs implement).

## Table

| Feature                                                                                                     | In Panasonic remote / MirAIe                                 | IR (DKE) support + field                                                                                                                            | Matter support + attribute                                                                                  | Effort                                                                                    |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Heat mode                                                                                                   | Not on India cooling-only splits; lib has kPanasonicAcHeat=4 | Yes, mode nibble byte 13 = 4. Don't expose for cooling-only caps                                                                                    | Thermostat SystemMode=Heat(4) only if device supports                                                       | S, but skip                                                                               |
| Powerful (turbo)                                                                                            | Yes (Powerful mode)                                          | Yes, setPowerful, byte 21; mutually exclusive with Quiet                                                                                            | None standard (no cluster). Maybe vendor ext.                                                               | S                                                                                         |
| Quiet                                                                                                       | Remote button on most models                                 | Yes, setQuiet, byte 21                                                                                                                              | None standard (FanMode Low is closest)                                                                      | S                                                                                         |
| nanoe / nanoe-X / ion                                                                                       | Yes (nanoe air purification)                                 | setIon works ONLY on DKE (byte 21/22 area, per lib "Ion bit for DKE"). Likely the nanoe key. Needs on-device test                                   | None standard                                                                                               | S (test needed)                                                                           |
| Econavi / eco / AI mode                                                                                     | AI mode in app (adjusts temp/mode/fan; sleep profiles)       | No econavi setter in lib. AI mode is cloud/app logic, not an IR field                                                                               | None                                                                                                        | Not feasible via IR; could emulate (see sleep profile)                                    |
| Fan 5 speeds                                                                                                | Remote shows auto + levels                                   | Lib: fan nibble 0..4 (Min,Low,Med,High,Max)+Auto(7), written +3 delta. We use only 1..3. Add 0 (Min) and 4 (Max)                                    | FanControl FanMode (Low/Med/High/Auto), PercentSetting 0-100, SpeedSetting + SpeedMax if MultiSpeed feature | S IR / M Matter                                                                           |
| Vertical swing positions                                                                                    | Yes (positions + auto)                                       | Yes, byte 16 low nibble: 1 highest,2 high,3 mid,4 low,5 lowest, 0xF auto                                                                            | Not in FanControl RockSetting (only RockLeftRight/UpDown/Round bitmap = on/off, no angle)                   | S                                                                                         |
| Horizontal swing                                                                                            | Yes on DKE models (left/right/auto)                          | Yes on DKE and RKR only: byte 17 low nibble: 0x9 full left, 0xA left, 0x6 mid, 0xB right, 0xC full right, 0xD auto. Not JKE/CKP; NKE/LKE forced mid | FanControl RockSupport/RockSetting bit RockLeftRight (on/off)                                               | S                                                                                         |
| Half-degree temp                                                                                            | Some remotes (0.5 steps)                                     | NOT in lib (setTemp integer, 5 bits at byte 14 bits 1..5; bit 0 of byte 14 unused by lib). Unverified; would need capture                           | Thermostat setpoints are 0.01 C units, so 0.5 representable if device accepts                               | Matter S, IR needs capture                                                                |
| Timers on/off                                                                                               | Remote has on/off timers; MirAIe schedules                   | Yes: setOnTimer/OffTimer, 10-min steps, enable flags byte 13, times bytes 18-20, needs setClock (bytes 24-25)                                       | No timer in Thermostat. Thermostat Schedules (1.3 optional) unlikely supported                              | M IR (clock sync). Phone-side scheduling alternative                                      |
| Clock                                                                                                       | Remote clock                                                 | setClock, minutes since midnight, bytes 24-25. Needed for IR timers                                                                                 | n/a                                                                                                         | S                                                                                         |
| Sleep                                                                                                       | Sleep profiles in app (temp ramp)                            | No sleep bit in lib; our caps sleep=false is right                                                                                                  | None                                                                                                        | Emulate: phone-side temp schedule only works with phone running; skip or send timer-based |
| 7-in-1 convertible / Converti7 capacity (45%-100%+)                                                         | Yes, app/remote select                                       | NOT in lib; likely a separate remote key/message. Needs IR capture from real remote                                                                 | None standard                                                                                               | L (capture)                                                                               |
| Auto-clean / Crystal Clean, filter alerts, diagnosis, usage tracking, warranty, proximity (geofence), voice | MirAIe cloud features                                        | No                                                                                                                                                  | No                                                                                                          | Out of scope (cloud)                                                                      |
| Display/LED light, buzzer                                                                                   | Some remotes                                                 | Not in lib                                                                                                                                          | None                                                                                                        | Skip                                                                                      |
| Room temp readback                                                                                          | App shows                                                    | n/a (IR one-way)                                                                                                                                    | Thermostat LocalTemperature (already used as roomTemp)                                                      | Done                                                                                      |
| Fan-only mode                                                                                               | Yes                                                          | Done (mode 6)                                                                                                                                       | SystemMode FanOnly(7)                                                                                       | Done                                                                                      |
| Dry                                                                                                         | Yes                                                          | Done                                                                                                                                                | SystemMode Dry(8)                                                                                           | Done                                                                                      |
| Sleep mode via Matter                                                                                       | -                                                            | -                                                                                                                                                   | Thermostat has no sleep; SystemMode Sleep(9) exists in enum, device-dependent                               | skip                                                                                      |

## Matter reachability summary

Reachable: SystemMode (Off/Auto/Cool/Heat/FanOnly/Dry), OccupiedCoolingSetpoint (0.01 C), LocalTemperature (read), FanControl FanMode / PercentSetting / SpeedSetting, RockSetting on/off per axis (if RockSupport advertised).
Not reachable (no standard attribute): Powerful, Quiet, nanoe, econavi, AI mode, swing position, converti7 capacity, timers, display. MirAIe cloud keeps these; a local-only app cannot reach them via Matter. IR is the path for all of them (DKE).
Note: Matter AC models are newer (2025 range); IR-only is what DKE users have.

## Recommended additions (priority)

1. Powerful + Quiet (IR byte 21; mutually exclusive). Highest value, very small, matches physical remote.
2. Vertical swing positions (1-5 + auto) and horizontal swing (DKE: left/mid/right/full/auto). Replace bool swing with two enums.
3. Fan Min/Max (levels 0 and 4) -> 5 speeds + auto; test on the real AC that 0/4 do something distinct.
4. nanoe/ion toggle (DKE-only in lib). Test; if the key doesn't map to nanoe, drop.
5. Timers (on/off in 10-min steps) + clock sync on every send. Medium; expose after 1-4.
6. Defer: half-degree (capture needed), 7-in-1 capacity (capture needed), sleep, heat.

## New AcState fields (all optional so old saved state loads)

- `powerful?: boolean`, `quiet?: boolean` (enforce exclusivity in core reducer)
- `ion?: boolean`
- `swingV?: 'auto'|1|2|3|4|5` and `swingH?: 'auto'|'fullLeft'|'left'|'mid'|'right'|'fullRight'` (migrate `swing` bool: true -> swingV auto)
- `fan` widen to `'auto'|1|2|3|4|5` (or 0..4 mapped to lib Min..Max)
- `onTimerMin?: number|null`, `offTimerMin?: number|null` (minutes since midnight, 10-min step)
  Capabilities additions: `acPowerful`, `acQuiet`, `acIon`, `acSwingV: values[]`, `acSwingH: values[]`, `acTimers`. Per-model flags: horizontal swing only dke/rkr; ion only dke. For Matter driver: map swing bool->RockSetting bits, hide the IR-only fields.

---

## IR AC brands for India: research (2026-11-06)

Read-only research. Method: IRremoteESP8266 master headers (`src/ir_*.h`, brand/model comments), its
SupportedProtocols.md, Flipper-IRDB file listing, SmartIR CLIMATE.md. Repo
https://github.com/crankyoldgit/IRremoteESP8266 (LGPL-2.1, verified via GitHub API).

## 1. Market share (weak data, treat as indicative)

No authoritative 2025/26 brand table found. Figures conflict and come from marketing pages or posts.

- Frequently named leaders: Voltas, LG, Daikin, Blue Star, Samsung (search roundup below).
- Voltas: volume leader; 2.0M+ units FY24 (unverified, press). Imarc claims 35-40% each for Voltas and
  Daikin; implausible, ignore.
- LG: about 18% share estimate; also 18.35% of owned ACs in a survey (ownership, not sales).
  https://www.mysmartprice.com/gear/ac/ac-features/mysmartprice-ac-insights-2025/
- Blue Star: about 14% room-AC share (social-sourced; company target was 13.9% for FY25).
- Samsung: 10% in Mar 2025 quarter. https://www.outlookbusiness.com/corporate/samsung-aims-for-10-market-share-in-room-air-conditioner-segment
- Lloyd (Havells) about 6-7%, Hitachi about 4% (social posts, unverified). No reliable Carrier, Daikin,
  Godrej, Whirlpool, Panasonic numbers.
- Other lists: https://www.imarcgroup.com/india-air-conditioning-market ,
  https://statista.com/statistics/1018500/india-leading-ac-providers-market-share (paywalled).
- Practical order for us: Voltas, LG, Daikin, Blue Star, Samsung, Lloyd, Hitachi, Carrier, Panasonic
  (done), Godrej, Whirlpool, Haier. Buy Euromonitor or read Voltas/Blue Star filings for hard numbers.

## 2. Brand to IRremoteESP8266 protocol

Listed models come from the headers; the library's data is Europe/Asia-heavy, so Indian model
coverage is thin. "Variants" = remote/protocol types to cycle in a setup test press.

| Brand                       | Protocol(s)                                                                                                                            | Listed coverage                                                                                                           | Variants to try                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Voltas                      | VOLTAS (`ir_Voltas.h`, 1 model enum: 122LZF)                                                                                           | One window AC only. Many split Voltas (esp. Vestel/Beko-built) are Coolix or Midea or Gree per field reports, unverified. | 1 Voltas + Coolix + Midea + Gree    |
| LG                          | LG (28-bit, old 6711A) and LG2 (AKB74955603 / AKB73757604)                                                                             | Includes LG2 split models, Indian remotes of this style are common                                                        | 2-3                                 |
| Daikin                      | DAIKIN (280 bit), DAIKIN2, DAIKIN216 (ARC433B69), DAIKIN160, DAIKIN176, DAIKIN128, DAIKIN152, DAIKIN64, DAIKIN200, DAIKIN312           | Indian Daikin FTKM/FTL etc. use ARC4xx remotes; ARC433 family = DAIKIN/DAIKIN216 most likely                              | 3-5                                 |
| Samsung                     | SAMSUNG_AC (14-byte, AR09/AR12 family)                                                                                                 | Several AR models                                                                                                         | 1 (Windfree models maybe different) |
| Blue Star                   | BLUESTAR_HEAVY (one remote D716LXM0535A2400313, no AC model listed). Other Blue Star splits likely Coolix/Gree/Midea (OEM), unverified | Poor                                                                                                                      | 3-4                                 |
| Lloyd / Havells             | Not listed. Lloyd is built by Midea/Gree-class OEMs; field guess Coolix, Midea, Gree, unverified                                       | None                                                                                                                      | 3-4 guesses                         |
| Hitachi                     | HITACHI_AC1 (13 B), AC2, AC3, AC424, AC344, AC264, AC296, AC                                                                           | KAZE, RAS-22NK, RAK-25NH5, RAS-AJ25H listed                                                                               | 4-6                                 |
| Carrier                     | CARRIER_AC (Surrey, 42QG5A), CARRIER_AC84 (342WM), CARRIER_AC128; some Carrier use TOSHIBA protocol (42NQV/38NYV)                      | Mostly non-India models                                                                                                   | 3-4                                 |
| Whirlpool                   | WHIRLPOOL_AC (DG11J1-3A/-04/-91, SPIS/SPIW)                                                                                            | Listed                                                                                                                    | 1 (3 remote types)                  |
| Haier                       | HAIER_AC, HAIER_AC_YRW02, HAIER_AC160, HAIER_AC176                                                                                     | HSU-09HMC203 etc.                                                                                                         | 3-4                                 |
| Godrej                      | Not listed. Possibly Midea/Gree-family OEM, unverified                                                                                 | None                                                                                                                      | guesses                             |
| Panasonic                   | PANASONIC_AC (done)                                                                                                                    |                                                                                                                           |                                     |
| Mitsubishi Electric / Heavy | MITSUBISHI_AC, MITSUBISHI112, MITSUBISHI136, MITSUBISHI_HEAVY_88 / _152 (SRK, SRKxxZM)                                                 | Listed                                                                                                                    | 2-4                                 |
| O General / Fujitsu         | FUJITSU_AC (ARRAH2E etc.), OGeneral listed under protocol                                                                              | AR-RCL1E remote; Fujitsu General models                                                                                   | 2                                   |
| Toshiba                     | TOSHIBA_AC                                                                                                                             | RAS series                                                                                                                | 1-2                                 |
| Sharp                       | SHARP_AC                                                                                                                               | AH-A, AH-X                                                                                                                | 1                                   |
| Midea family                | MIDEA (also MIDEA24), COOLIX (Midea MS12FU, Beko, Kaysun, Toshiba M-series)                                                            | Many OEM badge remotes (RG57, RG52)                                                                                       | 2                                   |
| Gree family                 | GREE (Gree, Cooper&Hunter, Amana, Kelvinator-protocol Sharp)                                                                           | YAA/YB/YX remotes                                                                                                         | 2-3                                 |
| TCL family                  | TCL112AC (TCL, Daewoo, Electrolux)                                                                                                     |                                                                                                                           | 1                                   |
| IFB, Onida, Croma           | Not listed                                                                                                                             | None                                                                                                                      | skip                                |

Protocol list source: https://github.com/crankyoldgit/IRremoteESP8266/blob/master/SupportedProtocols.md
and per-protocol headers under `src/`. Remote model numbers are the key: the test-press flow should
ask for the remote model or a photo, not just the brand. Rough cost of a full "try everything" sweep:
30-40 protocol candidates, so group by brand and cap at about 5 each.

## 3. Stateful vs toggle issues for the absolute-state AcState

Good (full state in every frame, maps cleanly to AcState): VOLTAS, DAIKIN*, SAMSUNG_AC, HITACHI_AC*,
MIDEA, GREE, TOSHIBA_AC, SHARP_AC, MITSUBISHI*, CARRIER_AC*, TCL112, FUJITSU. Checksums are in the
encoder.
Issues:

- COOLIX: 24-bit frame holds mode/temp/fan, but swing and sleep are separate command codes
  (`kCoolixSwing 0xB26BE0`, `kCoolixSleep 0xB2E003`), swing acts as toggle, sleep is another frame.
  Need to track swing state ourselves and send an extra frame on change; AC state out of sync if the user
  uses the physical remote.
- MIDEA: swing is a toggle frame (`kMideaACToggleSwingV` 0xA201FFFFFF7C; Kaysun variant differs).
  Same extra-frame approach. Power is in the state frame.
- WHIRLPOOL: power is a toggle bit (`setPowerToggle`), and swing is a separate command (0x07).
  Needs assumed-state tracking.
- LG / LG2: main frame is full state (mode/temp/fan/power); vertical swing and light are separate
  frames (`kLgAcSwingVToggle` 0x8810001, light toggle 0x88C00A6, plus absolute swing positions in the
  0x8813xxx range). So swing is mostly absolute (0x8813149 = swing on) but a separate send.
- HAIER_AC (old, 9-byte): frame contains a "command" nibble (on/off/mode/fan/temp up/down/sleep). Each
  frame also carries full state, but the command field must be set correctly.
- Sleep is not in every state frame (Coolix, Haier need dedicated codes).
- A common trait of all these: swing=true/false is not sendable as one frame on LG/Coolix/Midea. Our
  AcState-to-frames encoder must allow `encode()` to return multiple frames, or the UI must show "swing
  (toggle)" as assumed state. Recommend: encode returns a list of frames with gaps.
- Temperature range 16-30 fits most protocols (Daikin 18-32 on some models, Samsung 16-30, Hitachi
  16-32, Coolix 17-30). Clamp per protocol.
- Dry/auto mode and fan 1/2/3 mapping differ: three-step fan maps to low/med/high; some have 5 speeds.

## 4. Alternatives

- Flipper-IRDB (CC0-1.0, license verified via API): https://github.com/Lucaslhm/Flipper-IRDB , `ACs/`.
  Brands present: Carrier, Daikin, Haier, Hitachi, LG, Samsung, Sharp, Panasonic, Midea, GREE, Toshiba,
  Mitsubishi, Fujitsu, TCL, General_Electric, and about 90 more. Not present: Voltas, Blue Star, Lloyd,
  Godrej, Whirlpool, O General, Havells, Onida. Files are raw captures of a few buttons (often one
  temperature/mode combination), so no full state matrix; only usable as a spot check of an encoder or
  as a fallback "replay a captured button" mode. Hitachi has 2 files, Carrier 1 (orlen, not India),
  LG about 8, Daikin about 8, Samsung 3.
- SmartIR (MIT): https://github.com/smartHomeHub/SmartIR/blob/master/docs/CLIMATE.md , 358 files;
  Broadlink-format base64 (needs conversion to µs; the Atomberg Broadlink files already failed on a real
  fan, see ATTRIBUTION.md). Indian-relevant: Voltas 3080 (INV/AC 1.5T 183V MZJ3 3S), Hitachi 1080-1093,
  Daikin 1100-1110, Haier 1320-1322, LG 1062-1065/7062, Samsung, Whirlpool, Carrier. Full matrix
  (mode x fan x temp), good but one file per model and Broadlink timing risk. Keep the name "SmartIR"
  out of the app.
- Others (not verified here): irdb (custom licence, few ACs), Tasmota/ESPHome climate_ir, Home Assistant
  Voltas cloud-only. Remote-capture of Indian models needs the author's own hardware (ESP32 + IR receiver,
  about Rs 400-500 as per the market doc).

## 5. Recommended priority (top 8)

Licence note: anything derived from IRremoteESP8266 stays LGPL-2.1 in `src/ir/lgpl/` with notice, as for
Panasonic. SmartIR is MIT, Flipper-IRDB is CC0, both safe for data.

| #   | Brand                                  | Protocol(s)                                               | Source + licence                                     | Effort                            | Risk                                                                                                                                                     |
| --- | -------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | LG                                     | LG2 (+ LG28)                                              | IRremoteESP8266 LGPL-2.1                             | S-M                               | Swing/light are separate frames; old LG remotes use LG28. Low protocol risk                                                                              |
| 2   | Daikin                                 | DAIKIN, DAIKIN216, DAIKIN2 (more later)                   | IRremoteESP8266 LGPL-2.1                             | M                                 | Many variants (needs remote model); long frames with 2 parts                                                                                             |
| 3   | Samsung                                | SAMSUNG_AC                                                | IRremoteESP8266 LGPL-2.1                             | S                                 | Single protocol, but some frames are 2 x 7 bytes with extended; Wind-Free untested                                                                       |
| 4   | Hitachi                                | HITACHI_AC1/AC424/AC344                                   | IRremoteESP8266 LGPL-2.1; SmartIR MIT as cross-check | M-L                               | 6+ variants, checksum/length differences                                                                                                                 |
| 5   | Voltas                                 | VOLTAS first, then Coolix/Midea/Gree                      | IRremoteESP8266 LGPL-2.1; SmartIR 3080 MIT           | M                                 | Library covers one window model only; may not match the splits people own. Highest value, uncertain match. Needs a real Voltas remote capture to confirm |
| 6   | Blue Star / Lloyd / Godrej (OEM group) | COOLIX, MIDEA, GREE (+BLUESTAR_HEAVY)                     | IRremoteESP8266 LGPL-2.1                             | M (one encoder each, 3 protocols) | Brand to protocol map is guesswork; swing toggles on Coolix/Midea; unknown which a given model uses. Needs user feedback / capture                       |
| 7   | Carrier                                | CARRIER_AC, TOSHIBA_AC                                    | IRremoteESP8266 LGPL-2.1                             | M                                 | Indian Carrier (Midea JV) likely Midea/Coolix, not listed models                                                                                         |
| 8   | Whirlpool / Haier / Mitsubishi Heavy   | WHIRLPOOL_AC, HAIER_AC_YRW02/176, MITSUBISHI_HEAVY_88/152 | IRremoteESP8266 LGPL-2.1                             | S each                            | Whirlpool power is a toggle; lower market share                                                                                                          |

Suggested sequence: build a protocol-agnostic harness once (multi-frame encode, variant picker, per-protocol
temp clamp, golden tests from IRremoteESP8266 test vectors), then add Samsung and LG2 as first, cheap wins,
Daikin next, and the OEM group (Coolix/Midea/Gree) last because it covers the most unknown brands (Blue
Star, Lloyd, Godrej, Carrier, Voltas splits). Port tests from IRremoteESP8266 `test/ir_*_test.cpp` (the
same repo) to verify each TypeScript encoder bit-for-bit.

## Open questions and caveats

- Brand to OEM protocol claims for Blue Star, Lloyd, Godrej, Voltas splits are field knowledge, not
  confirmed by the library; confirm by capture or user reports.
- I did not open each `.cpp` to count exact variant tables; variant counts are estimates.
- Market numbers: see section 1; unreliable.

---

## Local (no-cloud) control of Wi-Fi ACs in India - research

Date 2026-11-06. Confidence tags: [V] verified from a fetched page this session; [S] search snippet / community post; [K] my prior knowledge, NOT verified (check before building).

## Summary table

| Brand (India)                                                                                            | Local protocol?                                                                                                                               | Offline from first pairing?                                     | Verdict                                              |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------- |
| Panasonic MirAIe                                                                                         | Matter on 2026 range [S]; older units cloud only                                                                                              | Matter: yes (commissioning is local)                            | Matter driver (new units); IR for old                |
| Midea / Carrier-Midea / Midea OEMs (Carrier India, some Voltas/Lloyd/Hitachi-Johnson Controls units [K]) | Yes, Midea LAN v2/v3 (AES, 8-byte-framed TCP 6444, UDP discovery 6445) [K]                                                                    | v2: yes. v3: needs token+key, fetched from Midea cloud once [V] | "Cloud once" - flag, not default                     |
| Gree and Gree-OEMs (Gree+ app; also Cooper&Hunter, Kenstar etc.)                                         | Yes, UDP 7000, generic AES key to bind, per-device key after [S]                                                                              | Yes (bind is local) [S]                                         | Priority 1                                           |
| Daikin (older BRP069A/B, BRP072A)                                                                        | Yes, plain HTTP `/aircon/get_control_info`, `/aircon/set_control_info` [V pydaikin]                                                           | Yes                                                             | Priority 2, only if India adapters match             |
| Daikin newer (BRP072C needs key + HTTPS; BRP084 JSON; BRP069C4x not supported)                           | Partly; some cloud-registered [V][S]                                                                                                          | Key from adapter label (BRP072C) - no cloud [V]                 | Support A/B + 072C if hardware seen in India         |
| Tuya-based modules (many budget/OEM)                                                                     | Yes, protocol 3.1-3.5 over TCP 6668 + UDP 6666/6667 discovery [V tinytuya]                                                                    | No: local key from Tuya IoT cloud [V]                           | Excluded / flagged                                   |
| Haier (hOn / SmartAir2)                                                                                  | hOn app = cloud [S]; local only via UART (ESPHome) or a community SmartAir2 LAN project (immature) [S]                                        | n/a                                                             | Cloud-only -> IR                                     |
| LG ThinQ                                                                                                 | Cloud (ThinQ Connect API) [K]                                                                                                                 | No                                                              | Cloud-only -> IR (or Matter if shipped, unconfirmed) |
| Samsung SmartThings AC                                                                                   | Old (2016-ish) AC had TLS port 2878 API with cert+token [K]; current units SmartThings cloud [K]                                              | No                                                              | Cloud-only -> IR                                     |
| Voltas / Tata                                                                                            | Voltas Smart/Voltas Home; module unknown, likely Tuya or Midea-OEM [K, unverified]                                                            | Unknown                                                         | Treat as IR unless a unit is probed                  |
| Blue Star                                                                                                | BlueStar Smart app, cloud [K]                                                                                                                 | No                                                              | IR                                                   |
| Lloyd / Havells                                                                                          | Lloyd Smart AC app = cloud "from anywhere" [S]; hardware Midea or Tuya OEM [K]                                                                | Unknown                                                         | IR; probe module                                     |
| Hitachi (airCloud Home)                                                                                  | Cloud [K]; no known LAN API                                                                                                                   | No                                                              | IR                                                   |
| Whirlpool, Godrej                                                                                        | Cloud apps; no known LAN API [K]                                                                                                              | No                                                              | IR                                                   |
| Mitsubishi Electric (MELCloud / MAC-577IF)                                                               | MAC-577IF has a LAN HTTP API (XML, port 80) - used by HA `melcloud` alt "mitsubishi-wf-rac"/pymitsubishi [K, verify]; India: few Wi-Fi models | Likely yes                                                      | Low priority                                         |
| Electrolux / AUX / TCL                                                                                   | Electrolux = Midea OEM; AUX = Gree/own; TCL = own cloud [K]                                                                                   | Midea path for Electrolux                                       | Via Midea / Gree if module identified                |

## Open-source implementations (checked)

| Project                                                                                                                                                | Covers                                                           | Licence             | Cloud use                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [midea-local](https://github.com/midea-lan/midea-local)                                                                                                | Midea LAN protocol, discover/set                                 | MIT [V]             | Token/key "normally fetched from the cloud"; `discover` caches the pair, so only the first run per device needs cloud credentials [V] |
| [midea-ac-py (HA)](https://github.com/mill1000/midea-ac-py)                                                                                            | Midea ACs (0xAC, 0xCC) via msmart-ng                             | MIT [V]             | Cloud only during discovery to get V3 token/key; manual path with your own account via msmart-ng CLI [V]; afterwards fully local [V]  |
| [msmart-ng](https://pypi.org/project/msmart-ng)                                                                                                        | Midea LAN lib                                                    | MIT [S]             | V3 needs `--auto` (cloud) or token/key/id [S]                                                                                         |
| [greeclimate](https://github.com/cmroche/greeclimate)                                                                                                  | Gree UDP 7000, async; discovery by broadcast or known IP         | GPL-3.0 [V]         | No cloud in documented workflow [V]; has a doc on cloud-only firmware [V] (not read)                                                  |
| [gree-remote](https://github.com/tomikaa87/gree-remote)                                                                                                | Gree protocol notes + tools                                      | licence not checked | Local; broadcast bind with generic AES key, then per-device key [S]                                                                   |
| [pydaikin](https://github.com/fredrike/pydaikin)                                                                                                       | Daikin BRP069A/B, BRP072A/B/C, BRP084 (fw 2.8.0), AirBase, SKYFi | GPL-3.0 [V]         | None mentioned. BRP072C needs adapter key (HTTPS); SKYFi needs password [V]. BRP069C4x with fw 2.0.0 unsupported [V]                  |
| [tinytuya](https://github.com/jasonacox/tinytuya)                                                                                                      | Tuya LAN 3.1-3.5                                                 | MIT [V]             | Local key only via Tuya IoT cloud; key changes if device re-added to the app [V]. 3.5 needs AES-GCM [V]                               |
| [ESPHome Haier](https://esphome.io/components/climate/haier.html)                                                                                      | Haier hOn / SmartAir2 over UART                                  | MIT/GPL mix [K]     | Local, but needs extra hardware on the AC - not phone-only                                                                            |
| [HA SmartAir2 local thread](https://community.home-assistant.io/t/haier-air-conditioner-local-integration-no-cloud-smartair2/1017649)                  | Haier SmartAir2 LAN (reverse engineered)                         | n/a                 | Local; on/off, temp, fan only; not hOn [S]                                                                                            |
| [Faikin](https://community.home-assistant.io/t/need-daikin-wifi-use-the-open-source-faikin-esp32-hardware-instead-of-the-official-wifi-modules/644370) | ESP32 replacement for Daikin adapter                             | n/a                 | Extra hardware                                                                                                                        |

Licence note: GPL-3.0 libs (greeclimate, pydaikin) cannot be copied into a closed/permissive app; use them only as protocol references and re-implement from the protocol notes (clean-room), or check our own app licence. MIT libs (midea-local, msmart-ng, tinytuya) can be ported with attribution.

## Matter ACs in India (2025-2026)

- Panasonic: 2026 range of 57 smart models, MirAIe with Matter support; reported as all connected models [S]. Sources: [Digit](https://www.digit.in/news/general/panasonic-2026-smart-ac-lineup-launched-india.html), [Construction World](https://www.constructionworld.in/amp/latest-construction-news/real-estate-news/interiors/panasonic-launches-57-smart-ac-models;-targets-2-million-units-by-fy28/85971).
- Daikin India 2026 lineup (BEE 2026 ratings, AI/IoT): no Matter mention found [S]. [Asianet](https://newsable.asianetnews.com/business/daikin-india-launches-2026-ac-lineup-with-smart-ai-iot-capabilities-articleshow-95m35v1)
- Samsung, LG, Voltas, others: no Matter AC confirmation found. Unconfirmed, not proven negative. Check each brand's 2026 product pages.
- Matter 1.2+ has the Thermostat cluster, which is what room ACs use; the existing `src/matter/` driver should handle them. Panasonic units also need a Matter controller commissioning once (local, but the Panasonic app may be needed to enable Matter / get a pairing code - verify on a real unit) [K].

## Local-network behaviour per protocol (pairing/key details)

- Gree: UDP broadcast "scan" to port 7000 -> device answers; "bind" packet encrypted with the shared generic key returns a per-device key; later packets use it. Old firmware AES-128-ECB, newer firmware AES-128-GCM, auto-detect [S]. No cloud.
- Midea v2: no authentication beyond fixed keys derived in the protocol [K]. v3: 8370 handshake with token+key (cloud-issued per device/account) [V/K]. After first fetch, fully offline, but a reset of the AC module or key rotation requires cloud again [V]. A guide reports that blocking internet entirely can cause boot loops on some units [S, anecdotal].
- Daikin A/B: unauthenticated HTTP GET on port 80 [V]. BRP072C: HTTPS plus key printed on adapter [V].
- Tuya: needs local key = cloud once, and rotates on re-pair [V].

## React Native feasibility

- UDP: needs a native module, e.g. `react-native-udp` (MIT) [K]; Expo needs a dev build/config plugin, not Expo Go. Broadcast on Android needs `CHANGE_WIFI_MULTICAST_STATE` and a multicast lock; on iOS needs the Local Network permission plus `NSLocalNetworkUsageDescription` (and Bonjour service names in Info.plist for mDNS) [K]. iOS blocks raw broadcast to 255.255.255.255 on some versions without the multicast entitlement [K, verify].
- TCP: `react-native-tcp-socket` (MIT) [K], used already for LG/Samsung TV path presumably - reuse what `src/` has.
- AES: ECB/CBC/GCM via `react-native-quick-crypto` or `expo-crypto` + a pure-JS lib (`@noble/ciphers`, MIT, supports GCM, small) [K]. Gree GCM and Tuya 3.5 need GCM; Midea needs AES-128-ECB, AES-CBC, SHA-256, MD5, HMAC [K].
- HTTP: Daikin plain HTTP needs cleartext allowed (`usesCleartextTraffic` on Android, ATS local-networking exception on iOS) [K]. BRP072C uses self-signed HTTPS (needs pinned/ignored cert handling in native code).
- Discovery: Gree = UDP broadcast; Midea = UDP broadcast 6445 (+ optional port 20086); Daikin = UDP 30050 "DAIKIN_UDP/common/basic_info" [K] or mDNS; all workable with UDP only, no mDNS needed.
- Android 15/16 and iOS 18+ local network permission prompts: user must grant; document in onboarding.

## Priority recommendation

Implement (fully offline, no cloud at any stage):

1. Gree UDP (v1 ECB + v2 GCM). Widest OEM reach (Gree-made ACs under many brands), cleanest local story. Verify which India brands actually ship Gree modules (unknown; ask for a device probe: UDP 7000 scan).
2. Daikin local HTTP (BRP069A/B-style API + BRP072C key). Cheap to build (HTTP only, no crypto for A/B). Risk: Daikin India's "Mobile Controller" adapter may be a newer model that is cloud-registered or unsupported (BRP069C4x not supported [V]). Must test on a real Indian unit before shipping.
3. Matter ACs: already supported; add test with a Panasonic 2026 unit. Add Daikin/others if they ship Matter.

Flag "needs cloud once" (offered only as an optional, user-initiated import; excluded from the default offline promise): 4. Midea v3 (token/key). If supported at all: accept a pasted token+key (user fetched via msmart-ng on a PC), never call the Midea cloud from the app. Midea v2 units work with no key. 5. Tuya: accept a pasted local key only; no cloud client in the app.

Cloud-only -> use IR (our existing IR path):
LG ThinQ, Samsung SmartThings (current), Haier hOn, Hitachi airCloud, Blue Star, Whirlpool, Godrej, Lloyd/Havells, Voltas (until module identified), Panasonic MirAIe on non-Matter units, TCL, AUX.

## Open questions / needs a real device

- Which Wi-Fi module each Indian brand ships is not documented publicly in what I found (Voltas, Blue Star, Lloyd, Carrier: no evidence found). A one-time device probe (scan UDP 7000, 6445, 30050; TCP 6668, 6444, 80, 2878, 8888) on friends' units would resolve this faster than research.
- India-specific Daikin adapter model numbers unconfirmed.
- Verify all [K] items (esp. Samsung port, Mitsubishi LAN API, Midea ports) against source before design.

---

## MirAIe AC: local LAN control research (2026-11-06)

Verdict: no verified cloud-free local path exists for a phone app. All known MirAIe control is via cloud MQTT. Keep IR.

## 1. How MirAIe talks (cloud MQTT)

- HTTP only for login + device/home list; everything else is MQTT (HA forum, milothomas):
  https://community.home-assistant.io/t/panasonic-miraie-integration/302668
- Broker mqtt.miraie.in:8883, TLS1.2; MQTT username = homeId, password = access token from HTTP login
  (kholia example, which skips cert verification client-side):
  https://github.com/kholia/Panasonic-Smart-AC-Research/blob/main/mqtt-example.py
- Topics: subscribe `<userId>/<homeId>/#`; publish `<userId>/<homeId>/<deviceId>/control`. A /status subtopic
  is likely but UNVERIFIED. Payloads are small JSON (e.g. `ps` = power state, `cnt`, `sid`); full schema not confirmed.
- Libraries (all need cloud login with phone + password): ha-miraie-ac Node-RED (milothomas; licence not stated),
  hass-panasonic-miraie (chrissmartin), homebridge-panasonic-miraie-ac-platform, PyPI miraie-ac / miraie-ac-in
  (India-market fork), kpr-miraie-mqtt (bridge to local MQTT). Licences not verified except where noted.
  Note: community reports on-vs-power quirk (power button only turns off; send a mode to turn on).

## 2. Local path?

- No evidence of a local HTTP/UDP/MQTT port on the module. None documented anywhere found. (Absence, not proof.)
- Chip: ESP8266 running ESP8266_RTOS_SDK (kholia extracted ac.ota.bin; model CS-CU-WU18WKYXF):
  https://github.com/kholia/Panasonic-Smart-AC-Research (no licence file; "educational interoperability,
  commercial use forbidden" statement).
- Broker redirect: kholia needed a Frida SSL bypass in the _app_, which says nothing about the module. Whether
  the module validates/pins the broker cert is UNKNOWN (untested in sources). Redirect would also need the module to
  accept your own token scheme; auth is token-based per home, so a local broker would have to emulate it. Needs
  DNS override on router. Speculative; no one has published it.
- UART: DomiStyle/esphome-panasonic-ac (MIT) replaces DNSK-P11 / CZ-TACG1 Wi-Fi modules via CN-CNT / CN-WLAN port,
  fully local, 5V<->3.3V level shifter needed, ESP32 preferred:
  https://github.com/DomiStyle/esphome-panasonic-ac
  It does NOT mention India or MirAIe. Whether India MirAIe units (own Wi-Fi module, possibly different connector/
  protocol) match is UNVERIFIED. Must open indoor unit to check for a CN-CNT/CN-WLAN header and what the MirAIe
  module plugs into.

## 3. Provisioning

- Onboarding goes through the MirAIe app + cloud account; kholia hit an `AONB` error (guess: "already onboarded").
  Device credentials come from cloud login. No cloud-free onboarding found. UNVERIFIED beyond that.

## 4. Options for a no-hub phone app

| Option                                   | Offline         | Cloud once             | Router change | Hardware mod                   | Warranty/safety                                                                                                                               |
| ---------------------------------------- | --------------- | ---------------------- | ------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Cloud MQTT via login (existing libs)  | no              | every use              | no            | no                             | Violates One Remote rule (vendor cloud + account); ToS risk                                                                                   |
| B. Local broker via DNS override         | maybe, UNPROVEN | yes (token/onboarding) | yes (DNS)     | no                             | Low; likely blocked by cert checks / auth; phone must emulate cloud                                                                           |
| C. Replace module with ESPHome over UART | yes             | no                     | no            | yes (open unit, level shifter) | Voids warranty likely; mains exposed inside; protocol match UNVERIFIED; needs a separate ESP device (not phone-only) and HA/ESPHome-style API |
| D. IR (current)                          | yes             | no                     | no            | no                             | none; no state feedback                                                                                                                       |

## Recommendation

Keep IR for the Panasonic AC. Treat MirAIe as out of scope under the local-only rule. Optional future: user-run
experiment (C) if they open the unit and find a CN-WLAN/CN-CNT header; a phone app could then talk to an ESPHome
native API/MQTT on LAN, but that is a hardware add-on, not a core feature.
