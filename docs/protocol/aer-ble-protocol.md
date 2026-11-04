<!-- From aer-remote docs/protocol/aer-ble-protocol.md (2026-11-04). Adapted: none. -->

# Godrej aer Smart Matic: BLE protocol notes

> **Not yet verified on our own hardware.** These notes are the basis for v1. The hardware test
> ([../spike/hardware-results.md](../spike/hardware-results.md)) will confirm or correct them.

## Contents

- [Sources](#sources)
- [GATT](#gatt)
- [Framing](#framing)
- [Example messages](#example-messages)
- [Commands](#commands)
- [Schedule entry (mT 103)](#schedule-entry-mt-103)
- [Vendor app sequences](#vendor-app-sequences)
- [Status reply (mT 157)](#status-reply-mt-157)
- [Not in the device](#not-in-the-device)

## Sources

Decoded from the official Android app `com.godrejcp.aermatic` v2.6 (vendor libraries
`com.cwdin.cwdtranscoderlibrary` and `com.cwdin.cwdblelibrary`), and cross-checked with
[AerControl](https://github.com/parthh37/aercontrol) (MIT) and
[godrej_aer](https://github.com/ov1d1u/godrej_aer) (Apache-2.0). Read for interoperability only; no
vendor code is copied.

## GATT

Service `6E400000-B5A3-F393-E0A9-E50E24DCCA9E` (Nordic-UART-style). No pairing or auth.

**Advertising.** The dispenser advertises the name `Smart Matic` but not the service UUID, so a scan
filtered by the service finds nothing. Aer Remote lists every device and checks for the service on connect. Seen on one dispenser (address prefix `A4:C1:38`) from an
Android 11 phone on 2026-10-27.

| UUID suffix | Vendor name                            | Use                                                        |
| ----------- | -------------------------------------- | ---------------------------------------------------------- |
| `…0001`     | RESPONSE_UUID                          | Notifications (replies). Has **no CCCD** on some firmware. |
| `…0002`     | PROVISION_UUID                         | Provisioning (mT 101).                                     |
| `…0003`     | ACTION_UUID                            | Every other command.                                       |
| `…0004`     | SCHED_UUID                             | Set schedules (mT 103).                                    |
| OTA         | `00010203-0405-0607-0809-0a0b0c0d2b12` | Firmware update (out of scope).                            |

Full UUIDs follow the service: `6E40xxxx-B5A3-F393-E0A9-E50E24DCCA9E`, where `xxxx` is the suffix.

**Firmware quirk** (from godrej_aer): some builds (for example 3.0.8-IN) accept commands on
`…0002/3/4` interchangeably, others only on `…0003`. Probe with fetch status on first connect and
remember what answers.

- Writes are without response (`setWriteType(1)`).
- The vendor app requests a larger MTU after connecting.
- The device accepts **one central at a time**.

## Framing

Each message is one CBOR map.

| Direction        | Shape                            | Notes                                             |
| ---------------- | -------------------------------- | ------------------------------------------------- |
| Request          | `{mT, mN, …}`                    | `mT` is the message type, `mN` a message number.  |
| Reply on `…0001` | `{mT: request + 50, mN, ack, …}` | `ack: 200` means OK. The device echoes `mN` back. |

The vendor app uses either fixed `mN` values or a random 100–253, and matches replies on it.

## Example messages

These bytes come from the app's own encoder (`src/protocol/messages.ts`), which matches the byte
output of Jackson CBOR used by the vendor app: maps and arrays are indefinite-length (`BF … FF`,
`9F … FF`). They are not captures from a device.

Fetch status, `{mT: 107, mN: 100}`:

```text
BF                 map, indefinite length
   62 6D 54        "mT"
   18 6B           107
   62 6D 4E        "mN"
   18 64           100
FF                 end of map
```

Set schedules with one entry (Mon–Fri, 08:00–22:00, every 20 min), `{mT: 103, mN: 102, S: [{s: …}]}`:

```text
BF                         map, indefinite length
   62 6D 54   18 67        "mT": 103
   62 6D 4E   18 66        "mN": 102
   61 53                   "S"
   9F                      array, indefinite length
      BF                   map
         61 73             "s"
         45 7C 08 00 2A 14 5 bytes: the schedule entry
      FF                   end of map
   FF                      end of array
FF                         end of map
```

A reply has the same shape. An OK reply to spray now (mT 104) with `mN: 101` would be
`{mT: 154, mN: 101, ack: 200}`.

## Commands

| mT  | Name              | Extra fields                                                               | Char    |
| --- | ----------------- | -------------------------------------------------------------------------- | ------- |
| 101 | provision         | `dN` (string, device name), `pK` (int)                                     | `…0002` |
| 102 | set time          | `eP` epoch seconds, `tZ` = −(UTC offset in minutes), `tD` DST savings (ms) | `…0003` |
| 103 | set schedules     | `S`: array of `{ s: bytes[5] }` (see below)                                | `…0004` |
| 104 | spray now         | `rI`: 0 = spray once; 10/20/40 = auto-spray every N min                    | `…0003` |
| 105 | refill inserted   | `rR: true` resets spray counters                                           | `…0003` |
| 106 | stop              | `sS: true` stops auto-spray; or `sS: <slot>` stops a schedule              | `…0003` |
| 107 | fetch status      | none                                                                       | `…0003` |
| 108 | remove schedules  | none (clears all)                                                          | `…0003` |
| 109 | retrieve schedule | none; reply has `S: [{ s: bytes }]`                                        | `…0003` |
| 110 | set unique id     | `uID` (int64)                                                              | `…0003` |
| 111 | get unique id     | none                                                                       | `…0003` |
| 112 | restart schedule  | `rS: <slot>`                                                               | `…0003` |
| 113 | test LED          | none                                                                       | `…0003` |
| 114 | get time          | none                                                                       | `…0003` |

Slot numbers for 106 and 112: 0–9 = schedule one to ten, 255 = all, 128 = current.

**Integer width quirk:** for `eP` (set time) and `uID`, the vendor app rewrites the CBOR integer to a
full 8-byte unsigned int (major type 0, additional info 27 / `0x1b`) regardless of value. The firmware
likely expects that fixed width; mirror it. For example, `eP` is sent as `1B 00 00 00 00 xx xx xx xx`.

## Schedule entry (mT 103)

Up to 10 entries. Each `s` is 5 raw bytes:

| Byte | Meaning                                                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------- |
| 0    | Weekday mask: Mon `0x40`, Tue `0x20`, Wed `0x10`, Thu `0x08`, Fri `0x04`, Sat `0x02`, Sun `0x01`                        |
| 1    | Start hour (0–23, device local time)                                                                                    |
| 2    | Start minute                                                                                                            |
| 3    | Repeat count = `(end − start in minutes) / interval`, integer division. End must be after start (no overnight windows). |
| 4    | Interval in minutes (the app offers 10 / 20 / 40)                                                                       |

Example: Mon–Fri, 08:00–22:00, every 20 min:

| Byte | Value  | Why                                  |
| ---- | ------ | ------------------------------------ |
| 0    | `0x7C` | `0x40 + 0x20 + 0x10 + 0x08 + 0x04`   |
| 1    | `0x08` | 8 h                                  |
| 2    | `0x00` | 0 min                                |
| 3    | `0x2A` | 42 = (22:00 − 08:00) / 20 = 840 / 20 |
| 4    | `0x14` | 20 min                               |

So `s = 7C 08 00 2A 14`. Because the count is one byte, a window can hold at most 255 sprays.

## Vendor app sequences

| When               | Sequence                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| First connect      | Set time (102), get/set unique id (111/110), fetch status (107).                                                                     |
| Open device screen | Set time (102), then fetch status (107).                                                                                             |
| Save schedules     | Remove schedules (108), wait about 3 s, then set schedules (103) with the whole active list. Replace-all; there is no per-entry add. |

## Status reply (mT 157)

From AerControl:

| Field | Meaning                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------- |
| `bV`  | Battery, mV. About 3.1 V full, 2.4 V cutoff (below it the device acks sprays but does not spray). |
| `fV`  | Firmware string.                                                                                  |
| `cS`  | Auto-spray state: 111/0 off; 112/121/131 = 10 min; 113/122/132 = 20 min; 114/123/133 = 40 min.    |
| `sC`  | Spray counters (`sn`, `sc`, `bn`).                                                                |
| `sV`  | Structure version.                                                                                |

Seen on firmware 3.0.8-IN (see `docs/spike/hardware-results.md`):

- `cS` 11x is auto-spray. 12x means a schedule window is running, and its last digit is the
  schedule's interval, not the auto-spray one: with auto-spray at 10 min and a 20 min schedule, `cS`
  read 122.
- `sC.sn[0]` counts manual sprays and `sC.sn[1]` auto sprays; turning auto-spray on sprays once at
  once. `sC.sc[i]` counts the sprays of schedule slot `i`.
- When a schedule window starts, auto-spray stops and stays off after the window (`cS` 0).
- A schedule sprays at its end time too: 18:50 to 19:50 every 20 min sprayed 4 times.

The refill estimate assumes 2200 sprays per can.

## Not in the device

The official app also has login/OTP, a cloud account, "preset schedules" fetched from Godrej's
server, and buying refills. None of these are needed to drive the device.
