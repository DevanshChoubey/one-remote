# Code sources

## In-app licence and credit text (copy this into Settings > About)

This section is the only part shown to users.

- Fan IR codes: Flipper-IRDB, public domain (CC0).
- IR encoders: IRremoteESP8266, LGPL-2.1. Full text and notice: `../lgpl/LICENSE` and
  `../lgpl/NOTICE.md`.

## Provenance notes (developers only; not shown in the app)

- **Panasonic AC encoder** (`../lgpl/`): derived from IRremoteESP8266 v2.8.6, `src/ir_Panasonic.cpp`
  and `src/ir_Panasonic.h`, LGPL-2.1, Copyright 2015 Kristian Lauszus and 2017, 2018 David Conran and
  contributors. The source actually read was master at commit `1e2f0f3` (version 2.9.0, 2026-01-03);
  its release notes list only documentation changes for Panasonic since v2.8.6.
- **Other AC encoders** (`../lgpl/`, one file per protocol; the table in `../lgpl/NOTICE.md` lists the
  upstream files): derived from IRremoteESP8266 v2.8.6, LGPL-2.1, read at master `1e2f0f3`. Each
  file's header names its upstream files, copyright and changes. Test vectors in `tests/ir/lgpl/` are
  copied from the upstream `test/ir_*_test.cpp` files.
  - Carrier (`carrierAc.ts`, CARRIER_AC64): the one Carrier protocol the library builds from settings
    (cool and fan only). CARRIER_AC, CARRIER_AC40, CARRIER_AC84 and CARRIER_AC128 are not ported.
    Not yet checked on a real Indian unit.
  - Daikin (`daikinAc.ts`, DAIKIN and DAIKIN216): DAIKIN for the ARC433 / ARC466 / ARC443 remotes
    (FTXM-M and M series), DAIKIN216 for ARC433B69 / ARC484A4, as listed by the library. DAIKIN2
    and the newer DAIKIN312 are not ported. Not yet checked on a real Indian unit.
  - Hitachi (`hitachiAc.ts`, HITACHI_AC424 and HITACHI_AC): the RAR-8P2 remote (RAS-AJ series) and
    the older RAS-35THA6 remote, as listed by the library. HITACHI_AC1 (listed for the KAZE-312KSDP)
    and the other Hitachi protocols are not ported. Not yet checked on a real Indian unit.
  - LG (`lgAc.ts`, LG2 and LG): remotes AKB74955603 (absolute swing codes), AKB75215403 (no swing
    message) and the older 6711A20083V (swing toggle), as listed by the library. Not yet checked on
    a real Indian unit.
  - Samsung (`samsungAc.ts`, SAMSUNG_AC): the AR-series protocol the library lists for several
    AR09/AR12 models. Not yet checked on a real Indian unit.
  - Whirlpool (`whirlpoolAc.ts`, WHIRLPOOL_AC): remotes DG11J1-3A / DG11J1-04 and DG11J1-91, as
    listed by the library. Power is a toggle bit, so the app must know the real power state. Not yet
    checked on a real Indian unit.
- **Atomberg fan codes** (`atomberg.ts`): Flipper-IRDB (https://github.com/Lucaslhm/Flipper-IRDB),
  `Fans/Atomberg/Atomberg_fan.ir`, CC0-1.0. NECext address 00 F3, rewritten as clean NEC frames.
- **LG TV codes** (`lgTv.ts`) and the NEC format (`../nec.ts`): our own code. NEC is a public
  protocol; the LG codes are NEC address 0x04 commands.

### Why not the SmartIR Atomberg files

The earlier SmartIR files (1160, 1170) were Broadlink recordings whose timings the real fan rejected
(tested 2026-11-06 on an iQOO Z10x: no reaction). The clean NEC POWER frame 0x00CF8976 worked, and it is
a toggle. The speed, boost, sleep and light mapping comes from Flipper-IRDB and is not yet checked on a
real fan.
