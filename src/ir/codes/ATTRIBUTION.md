# Code sources

## In-app licence and credit text (copy this into Settings > About)

This section is the only part shown to users. It never uses the word "SmartIR".

- Fan IR codes: MIT licence, (c) their contributors. Full MIT text: the MIT licence block at the top of
  `atomberg.ts`.
- IR encoders: IRremoteESP8266, LGPL-2.1. Full text and notice: `../lgpl/LICENSE` and
  `../lgpl/NOTICE.md`.

## Provenance notes (developers only; not shown in the app)

- **Panasonic AC encoder** (`../lgpl/`): derived from IRremoteESP8266 v2.8.6, `src/ir_Panasonic.cpp`
  and `src/ir_Panasonic.h`, LGPL-2.1, Copyright 2015 Kristian Lauszus and 2017, 2018 David Conran and
  contributors. The source actually read was master at commit `1e2f0f3` (version 2.9.0, 2026-01-03);
  its release notes list only documentation changes for Panasonic since v2.8.6.
- **Atomberg fan codes** (`atomberg.ts`): SmartIR repository, `codes/fan/1160.json` (Efficio) and
  `codes/fan/1170.json` (Renesa), commit `e4df2957ad915536f41ffb39daa96886d7cfe040`, MIT,
  Copyright (c) 2019 Vassilis Panos.
- **LG TV codes** (`lgTv.ts`) and the NEC format (`../nec.ts`): our own code. NEC is a public
  protocol; the LG codes are NEC address 0x04 commands.

### Known data conflict in the Atomberg files (for the hardware spike and an ESP32 capture)

- In 1160, `speed2` and `speed3` are byte-identical (NEC 0x00CF51AE). `speed3` is dropped from the
  catalogue, so 1160 counts as missing a key and the plan's spike gate applies.
- The speed labels of 1160 contradict 1170. 1170 decodes as 1:09F6, 2:51AE, 3:C936, 4:11EE, 5:F10E.
  Neither file is verified against a real fan. Capture the real remotes (ESP32) before trusting
  1160's `speed1`, `speed2`, `speed4`, `speed5` or `boost`.
- Candidate order puts 1170 first, because its codes are distinct and consistent.
