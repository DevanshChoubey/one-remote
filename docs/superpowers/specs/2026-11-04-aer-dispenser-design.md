# Godrej aer Smart Matic in One Remote: Design

Status: draft for the author's review, 2026-11-04. Extends `2026-10-30-one-remote-design.md`.

## 1. Intent and the why

One Remote is meant to be the one app for everything at home it can reach locally: TVs, ACs, fans
and now the Godrej aer Smart Matic air freshener. The author built Aer Remote
(`../godrejapp`, `DevanshChoubey/aer-remote`) as a separate app for the aer. He wants that same
functionality inside One Remote, so one app covers the home, and he wants it built on the backend
code that already exists in Aer Remote rather than written again.

The aer screens are drawn in One Remote's own style (author's choice, 2026-11-04), in the one
central mock, next to the TV, AC and fan. Aer Remote's warm theme does not come across.

## 2. Goals

Parity with Aer Remote v1 and its refill and battery alerts
(`godrejapp/docs/superpowers/specs/2026-10-26-aer-remote-design.md` and
`2026-10-27-refill-battery-alerts-design.md`):

1. **Spray now.**
2. **Auto spray** on or off, every 10, 20 or 40 minutes.
3. **Schedules:** up to 10 per dispenser (start, end, weekdays, interval), written to the dispenser
   and run on it with no phone nearby. The app reads them back after every save and shows what the
   dispenser holds.
4. **Status:** battery %, refill remaining (an estimate from the spray count), firmware, when it was
   last read. "I refilled it" resets the counter.
5. **Clock:** set the dispenser's time on every connect, in the dispenser's home time zone.
6. **Find it:** blink its light, while adding and from its screen.
7. **Several dispensers:** add, name, put in a room, reorder, rename and remove, like any other
   One Remote device.
8. **Alerts** (local notifications, no background Bluetooth): refill almost out (<10%) and out
   (predicted), battery low (<10%) and flat (from readings), and a check-in reminder after 14 days
   without a reading. Each can be turned off in Settings.
9. **Connect every time, or say why** in plain words: Bluetooth off, out of range, another phone or
   the official app is connected, battery flat, not a Smart Matic.

## 3. Non-goals

- Background Bluetooth, push notifications, firmware updates, the vendor's provisioning, preset
  schedules from Godrej's server, buying refills, accounts.
- Overnight schedule windows (the dispenser rejects end before start).
- A per-schedule pause (the dispenser keeps no readable paused flag).
- Talking to the dispenser over Wi-Fi or the cloud. Bluetooth only.
- Importing dispensers already added in Aer Remote. Re-adding takes a scan and a blink, and the
  schedules are read back from the dispenser anyway. _(Claude's call.)_
- Shared code between the two apps as a package. The code is copied (see §5); Aer Remote stays as it
  is.

## 4. Anti-goals

- Holding the Bluetooth connection: the dispenser takes one phone at a time, so One Remote must free
  it within seconds.
- Showing state the app thinks the dispenser has instead of what it read.
- Any network traffic for the aer, telemetry or account.
- An aer section that looks bolted on: it must look and behave like the TV, AC and fan screens.

## 5. Decisions

### Reusing Aer Remote's backend

Copy these from `../godrejapp/src` with their tests, and adapt names and imports only:

| Aer Remote                         | One Remote                     | What it is                                             |
| ---------------------------------- | ------------------------------ | ------------------------------------------------------ |
| `src/protocol/*`                   | `src/aer/protocol/*`           | CBOR, messages, replies, schedule bytes, status, UUIDs |
| `src/device/*`                     | `src/aer/*`                    | client, session, command queue, retries, time, errors  |
| `src/alerts/*` (pure parts)        | `src/aer/alerts/*`             | refill prediction, alert plan and state                |
| `src/alerts/expoScheduler.ts`      | `src/services/aerAlerts.ts`    | the `expo-notifications` adapter                       |
| `src/ble/transport.ts`, `base64.ts`| `src/transport/ble/*`          | the `BleTransport` interface                           |
| `src/ble/rnTransport.ts`           | `src/transport/ble/rnTransport.ts` | the `react-native-ble-plx` adapter                 |
| `src/ble/testing/fakeDispenser.ts` | `src/aer/testing/fakeDispenser.ts` | the simulated dispenser for tests                  |

- `src/aer` (except the scheduler adapter) stays free of React Native and Expo, as `src/matter`
  does, and the lint rules gain it. Bluetooth is reached only through `src/transport/ble`, so the
  rule "radios live in `src/transport`" holds. _(Claude's call.)_
- The protocol doc `godrejapp/docs/protocol/aer-ble-protocol.md` is copied to
  `docs/protocol/aer-ble-protocol.md`.
- Aer Remote's timeouts, retries, channel probe, 10 s idle disconnect and replace-all schedule save
  come across unchanged. They passed its hardware test.
- "Copy and adapt" allows small refactors where a copied file cannot compile as it is (Aer
  Remote's `@/store`, `@/i18n` and `@/core` imports, its queue living inside `client.ts`). The copied
  tests must still pass, with only the same adaptations. _(Claude's call.)_
- Copied files keep a one-line note of where they came from. Both apps are the author's, so there is
  no licence issue. _(Claude's call.)_

### Device model

- `aer` joins `DeviceKind`, so rooms, order, rename, remove and the Home list treat it like any
  device. It does **not** join the hub's `Driver`, `Command` or `Reported` types: the hub's
  online/fallback/refresh model is built for always-reachable links, and the aer is
  connect-on-demand. A separate `AerService` (from Aer Remote's client) is exposed through
  `useServices()`, and the Home card, the add flow and the dispenser screen call it directly.
  _(Claude's call.)_
- A new link `{ kind: 'aer'; bleId: string; timeZone: string;
  channels?: … }`, with `channels` being the probed characteristic pair Aer Remote remembers.
  _(Claude's call on the names.)_
- The aer has one link only, so there is no fallback. Its state (`AerStatus`, schedules) comes from
  the dispenser and is cached for display when it is out of reach, labelled with when it was read.
- That cache, and `clockSet`, live in a small aer store keyed by the One Remote device id, next to
  the home store. It presents Aer Remote's `DispenserStore` interface (built from the device and its
  link plus the cache), so the copied alert engine and its tests run unchanged. The alert ids are the
  device ids. _(Claude's call.)_
- Commands go through the aer client's own queue, not the TV/AC command path, because each one is a
  connect, a request and a reply. The device layer exposes them to screens through `useServices()`
  like the others.

### Screens (drawn in the central mock first)

All in One Remote's tokens, components and motion:

1. **Home card:** name, battery and refill at a glance, and today's next spray. A Spray quick action
   on the card, as the TV card has its switch. _(Claude's call.)_
2. **Add flow:** "Air freshener" joins the kind picker. Then: turn Bluetooth on (if off) → a scan list
   of nearby Bluetooth devices, first found first → pick one → it blinks, "Is this the one that
   blinked?" → not a Smart Matic says so → the shared Name it step (name and room) → the home time
   zone, defaulting to the phone's.
3. **Dispenser screen:** a big Spray now, the Auto spray switch with 10/20/40, a status block
   (battery, refill, firmware, last read), the schedules list with Add, and the link line
   "Bluetooth · close by · how it's connected", as on the other screens.
4. **Schedule editor:** start and end time, weekday chips, interval chips, and "about N sprays a
   day". Delete from here.
5. **Device settings:** rename, room, "I refilled it", Find (blink), home time zone, remove.
6. **Settings:** an Alerts group (refill, battery, check-in switches). Privacy text names Bluetooth.
7. **States:** connecting, Bluetooth off, out of range, busy with another phone, battery flat,
   saving and read-back, save failed, cached (last read N ago), and the notification-permission ask.

### Permissions and privacy

- Android: `BLUETOOTH_SCAN` with `neverForLocation`, `BLUETOOTH_CONNECT`, `POST_NOTIFICATIONS`;
  exact alarms only if Aer Remote's alert design needs them. iOS: Bluetooth and notifications usage
  strings. No location permission.
- The aer needs Android 12 or newer, because older Android only allows a Bluetooth scan with the
  location permission. One Remote's minimum Android stays as it is; on older phones the kind picker
  shows the aer as "Needs Android 12". _(Claude's call.)_
- `expo-notifications` comes with a no-push plugin, as Aer Remote's `withNoPushEntitlement`, and no
  Firebase messaging: alerts are local only. _(Claude's call.)_
- Bluetooth stays in the room, so the "local only" rule holds. `PRIVACY.md`, the in-app Privacy text
  and the Play Data safety notes add Bluetooth and notifications.

### Release

The aer ships in the first Play closed beta (author's choice, 2026-11-04), so the beta waits for it.
Before the beta build: `PRIVACY.md`, the in-app Privacy text and `docs/store/google-play.md`
(Data safety, permissions, the reviewer note "needs a TV, AC, fan or aer dispenser") are updated,
and the release manifest is checked again for Google telemetry, since `react-native-ble-plx` and
`expo-notifications` are new native dependencies.

### Engineering

One Remote's rules apply as they are (TDD, strict TS, i18n strings, typed errors, primitives only in
`src/ui`, Bun only). The aer work lands in lanes like the TV brands did.

## 6. Constraints

- Bluetooth needs the dev build and the `react-native-ble-plx` config plugin, as Aer Remote has.
- The dispenser does not advertise its service, so the scan cannot filter by it (Aer Remote hardware
  test, 2026-10-27).
- Only one phone or app can be connected at a time, including Aer Remote itself. Both apps can be
  installed; whichever connects first wins until it lets go.
- Aer Remote has passed the hardware test on one Android phone only; iOS is untested in both apps.

## 7. Left to the builder

- File layout inside `src/aer` beyond the table above, and how the services wire it.
- Storage for aer status and schedule cache, within One Remote's store.
- Exact copy, in the mock's voice; the mock is the reference for words and layout.
- The order of lanes. The mock gates only the screen lanes; the protocol, transport and alerts
  lanes can start while it is reviewed. _(Claude's call.)_
- iOS: built for both platforms with the iOS strings in place, and tested on Android only for now,
  as in Aer Remote. The `bleId` is opaque (a MAC on Android, a per-app UUID on iOS).

## 8. Done means

- Every goal in §2 works against the simulated dispenser in tests, and on the author's real
  dispenser from the iQOO Z10x: spray, auto spray, a schedule saved and read back, status, blink.
- The mock shows every aer screen and state, and the app matches it.
- An alert fires on the phone from a predicted refill date.
