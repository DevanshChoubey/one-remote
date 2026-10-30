# Code sources

- **Panasonic AC encoder** (`../lgpl/`): IRremoteESP8266 v2.8.6, `src/ir_Panasonic.cpp` and
  `src/ir_Panasonic.h`, licence LGPL-2.1, Copyright 2015 Kristian Lauszus and 2017, 2018 David Conran
  and contributors. See `../lgpl/LICENSE` and `../lgpl/NOTICE.md`.
- **Atomberg fan codes** (`atomberg.ts`): SmartIR repository, `codes/fan/1160.json` (Efficio) and
  `codes/fan/1170.json` (Renesa), commit `e4df2957ad915536f41ffb39daa96886d7cfe040`, licence MIT,
  Copyright (c) 2019 Vassilis Panos. In the app, credit them as "Fan IR codes: MIT licence, (c) their
  contributors" and never use the word "SmartIR" in the UI. The full MIT text is at the top of
  `atomberg.ts`.
- **LG TV codes** (`lgTv.ts`) and the NEC format (`../nec.ts`): our own code. NEC is a public
  protocol; the LG codes are NEC address 0x04 commands.

The About screen's licence text is copied from this file.
