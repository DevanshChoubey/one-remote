# MirAIe cloud protocol (Panasonic India Wi-Fi ACs)

What One Remote's opt-in MirAIe connection (`src/miraie/`) speaks, and where each fact comes from.
This is the app's single cloud exception: it is off by default and only runs after the user turns
it on in Settings and signs in with their own MirAIe account.

Clean room: the sources below were read for facts (URLs, field names, values). No code was copied;
`src/miraie/` is written from this note. Several sources have no licence or a copyleft one.

Nothing here was tried against the real service while writing the code. Every fact is marked:

- **[3]** three or more independent sources agree;
- **[2]** two sources agree;
- **[1]** one source only;
- **[?]** a guess; the code handles it defensively.

## Sources

| Ref | Project                                                        | Licence                               | Read                                                                                     |
| --- | -------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| K   | kholia/Panasonic-Smart-AC-Research, `mqtt-example.py`          | none ("educational interoperability") | broker, credentials, topics, payload                                                     |
| P   | milothomas/py-miraie-ac (`constants`, `api`, `broker`)         | GPL-3.0                               | endpoints, login body and status codes, homes shape, topic suffixes, enums, base payload |
| H   | chrissmartin/hass-panasonic-miraie (`const`, `api`, `climate`) | MIT (README) / "Other" on GitHub      | endpoints, client id, login body, status fields, swing values, power-then-mode order     |
| B   | thisisharishr/homebridge-panasonic-miraie-ac-platform          | Apache-2.0                            | MQTT.js `mqtts://` with default TLS checks, payloads, QoS 0                              |
| I   | miraie-ac-in on PyPI (fork of rkzofficial/miraie-ac)           | MIT                                   | phone format `+91XXXXXXXXXX`; firmware 3.02+ packs the room temperature differently      |
| F   | Home Assistant forum thread "Panasonic MirAIe integration"     | n/a                                   | HTTP only for login and listing, everything else MQTT                                    |

## HTTPS

- Login: `POST https://auth.miraie.in/simplifi/v1/userManagement/login`, JSON body **[2: P, H]**
  - `clientId`: `PBcMcfG19njNCL8AOgvRzIC8AjQa` (the MirAIe app's public client id, not a user
    secret) **[2]**
  - `mobile` (for a phone number) or `email`, and `password` **[2]**
  - `scope`: `an` followed by random digits **[2]** (P uses 9 digits, H "an\_" plus digits)
  - 200: `userId`, `accessToken`, `refreshToken`, `expiresIn` (seconds) **[1: P reads all four; H
    only `accessToken`]**
  - 401: wrong number or password **[1: P]**; 412: number not registered **[1: P]**
- No refresh endpoint is documented. H signs in again every 7 days and on any 401; P signs in again
  when MQTT drops. **The app keeps the password in secure storage for this** and signs in again
  when the broker or the API refuses the token.
- Homes: `GET https://app.miraie.in/simplifi/v1/homeManagement/homes`, `Authorization: Bearer
<accessToken>` **[2]**. An array of homes: `homeId`, `homeName` [1], `spaces[]` with `spaceName`
  and `devices[]` with `deviceId`, `deviceName`, `topic` (an array; the first entry is the device's
  topic root) **[2]**.
- Device details: `GET .../deviceManagement/devices/<deviceId>` → an array whose first item has
  `category` (`"ac"` for ACs), `modelName`, `brand`, ... **[1: P]**. Used to keep only ACs.
- Device status: `GET .../deviceManagement/devices/<deviceId>/mobile/status` → the same fields as
  the MQTT status plus `onlineStatus: "true"` **[2: P, H]**.

## MQTT

- Broker `mqtt.miraie.in:8883`, TLS **[3: K, P, H, B]**. P and B verify the certificate against the
  public CAs, so it is publicly trusted **[2]** (K turned verification off; One Remote does not).
- MQTT 3.1.1 works: H (aiomqtt default) and B (MQTT.js default) use it **[2]**. P asks for 3.1.
- Username = `homeId`, password = `accessToken` **[3: K, P, B]**.
- Client id: anything; each project makes its own random one **[3]**.
- Topics, with `<root>` = the device's `topic[0]` from the homes listing **[2: P, H]** (K builds the
  same root as `<userId>/<homeId>/<deviceId>`, **[1]**):
  - publish commands to `<root>/control` **[3]**
  - subscribe to `<root>/status` **[1: P]** (H subscribes to `<root>/state` instead **[?]**) and
    `<root>/connectionStatus` **[1: P]**. The app subscribes to all three.
- QoS: P subscribes with 1; B with 0; everyone publishes with 0 **[2]**. The app subscribes with 1
  and publishes with 0.

## Command payloads

Every command is one small JSON object: the base fields plus one setting **[3]**.

- Base: `ki: 1`, `cnt: "an"`, `sid: "1"` **[2: P, H]** (K: `ki: 0`, `sid: "0"`; B: `cnt: "ios"`).
- Power: `ps: "on" | "off"` **[3]**. H writes `"ON"`/`"OFF"` in one place but reads lower case.
- Turning on: send `ps: "on"`, then the mode **[2: H, research note "power button only turns
  off"]**. The app always sends the mode right after `ps: "on"`.
- Mode: `acmd: "cool" | "dry" | "fan" | "auto"` (`"heat"` exists on heat pumps) **[3]**.
- Set point: `actmp` as a string with one decimal, e.g. `"24.0"` **[2: K, P]**. Range 16 to 30
  **[1: H]**, 0.5 steps **[1]**; the app sends whole degrees.
- Fan: `acfs: "auto" | "quiet" | "low" | "medium" | "high"` **[2: P, H]**. The app offers 1, 2, 3
  for this link and maps them to low, medium, high; it reads `quiet` as 1. The app's fan has five
  levels (`AcFan` 1..5, for 5-speed IR remotes): 4 and 5 are sent as `high`, the nearest **[app
  choice]**, and a `high` read back after the app set 4 or 5 keeps that level.
- Vertical swing: `acvs`, a number 0 to 5, 0 = auto (swinging), 1 to 5 fixed vane positions
  **[2: P, B]**. H sends `"0"` for on and `"3"` for off **[1]**. **Swing off = 3 is a guess
  [?]**: the AC may need another position. Reading: `acvs` 0 (number or string) is swing on.
  The app maps `AcState.swingV` straight onto it (`auto` = 0, 1..5 = 1..5) and reads it back the
  same way. That 1 is the top position and 5 the bottom, as in the app's `AcSwingV`, is **[?]**.
  When only `swing` changed (and `swingV` disagrees), `swing` decides: on = 0, off = 3.
- Horizontal swing `achs` exists **[2]**, but its values are not documented; the app leaves it
  alone and does not offer `swingH` on this link.
- Not used by the app: `acng` (nanoe), `acpm` (powerful), `acem` (economy), `acec` (clean), `cnv`
  (Converti7), `acdc` (display) **[2]**. Their on/off values are not confirmed, so this link does
  not offer `AcState`'s `powerful`, `quiet` or `ion`; the AC screen hides them, and the IR backup
  (lane A's Panasonic encoder) still carries them when the AC is driven over IR.

## Status payloads

- Same field names as the commands, plus `rmtmp` (room temperature, a string) **[3]**, `ts`,
  `errors`, `warnings`, filter fields **[1]**. Whether a status message is always complete or only
  carries the changed fields is **[?]**: the app merges each message over the last known state.
- Firmware 3.02+ sends `rmtmp` "in a packed decimal format" **[1: I, not described]**. The app shows
  a room temperature only when `rmtmp` parses to 0 to 60 °C, else none.
- `connectionStatus`: format not documented **[?]**. The app reads `onlineStatus` (`"true"`,
  `"false"` or a boolean) when present and ignores anything else. An AC known to be offline makes a
  send fail as `notSent`, so the IR backup takes it.

## What is unconfirmed, in short

1. Swing-off value (3), and which end of `acvs` 1..5 is the top.
2. `<root>/status` vs `<root>/state`; the app listens to both.
3. `connectionStatus` payload.
4. Whether a status is complete or partial.
5. Packed room temperature on firmware 3.02+.
6. Login error codes beyond 401 and 412; token lifetime (`expiresIn`).
7. Android TLS: `react-native-tcp-socket` validates the chain against the system CAs but does not
   check the host name, so the app checks the leaf certificate's subject CN is `mqtt.miraie.in` or
   `*.miraie.in` before it sends the token. Whether that library sets SNI on Android is untested.
