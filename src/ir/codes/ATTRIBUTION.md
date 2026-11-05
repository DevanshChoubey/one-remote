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
  - Coolix (`coolixAc.ts`, COOLIX) and Midea (`mideaAc.ts`, MIDEA): Midea's two protocols, used by
    the Midea remotes the library lists (RG52D / RG57A7 / RG51 for Coolix, RG57A6 / RG66B6 / RG57H4
    for the 48-bit one). Swing (both) and sleep (Coolix) are separate toggle messages, sent when
    the setting differs from the last sent state. Also offered for Carrier as guesses, since
    Carrier's Indian ACs come from its Midea joint venture: unconfirmed on a real remote. Not yet
    checked on a real Indian unit.
  - Daikin (`daikinAc.ts`, DAIKIN and DAIKIN216): DAIKIN for the ARC433 / ARC466 / ARC443 remotes
    (FTXM-M and M series), DAIKIN216 for ARC433B69 / ARC484A4, as listed by the library. DAIKIN2
    and the newer DAIKIN312 are not ported. Not yet checked on a real Indian unit.
  - Gree (`greeAc.ts`, GREE): the YAW1F and YBOFB remote types, as listed by the library. Fan 1, 2
    and 3 are Gree's own three speeds rather than the library's mapping, which sends low and medium
    alike. Not yet checked on a real Indian unit.
  - Haier (`haierAc.ts`, HAIER_AC_YRW02, HAIER_AC176 and HAIER_AC): the YR-W02 and V9014557 M47 8D
    remotes (the 14-byte and 22-byte forms of one protocol) and the older HSU07-HEA03 remote, as
    listed by the library. HAIER_AC160 is not ported. Not yet checked on a real Indian unit.
  - Hitachi (`hitachiAc.ts`, HITACHI_AC424 and HITACHI_AC): the RAR-8P2 remote (RAS-AJ series) and
    the older RAS-35THA6 remote, as listed by the library. HITACHI_AC1 (listed for the KAZE-312KSDP)
    and the other Hitachi protocols are not ported. Not yet checked on a real Indian unit.
  - LG (`lgAc.ts`, LG2 and LG): remotes AKB74955603 (absolute swing codes), AKB75215403 (no swing
    message) and the older 6711A20083V (swing toggle), as listed by the library. Not yet checked on
    a real Indian unit.
  - Mitsubishi Heavy (`mitsubishiHeavyAc.ts`, MITSUBISHI_HEAVY_152 and MITSUBISHI_HEAVY_88): the
    RLA502A700B remote (SRKxxZM-S, SRKxxZMXA-S) and the RKX502A001C remote (SRKxxZJ-S), as listed
    by the library. The 152-bit timing is checked against a real capture from the library's
    tests. Not yet checked on a real Indian unit.
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
