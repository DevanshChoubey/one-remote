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
- **Atomberg fan codes** (`atomberg.ts`): Flipper-IRDB (https://github.com/Lucaslhm/Flipper-IRDB),
  `Fans/Atomberg/Atomberg_fan.ir`, CC0-1.0. NECext address 00 F3, rewritten as clean NEC frames.
- **LG TV codes** (`lgTv.ts`) and the NEC format (`../nec.ts`): our own code. NEC is a public
  protocol; the LG codes are NEC address 0x04 commands.

### Why not the SmartIR Atomberg files

The earlier SmartIR files (1160, 1170) were Broadlink recordings whose timings the real fan rejected
(tested 2026-11-06 on an iQOO Z10x: no reaction). The clean NEC POWER frame 0x00CF8976 worked, and it is
a toggle. The speed, boost, sleep and light mapping comes from Flipper-IRDB and is not yet checked on a
real fan.
