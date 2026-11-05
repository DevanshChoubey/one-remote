# LGPL-2.1 notice

Everything in this folder (`src/ir/lgpl/`) is licensed under the GNU Lesser General Public License,
version 2.1. The full text is in `LICENSE` next to this file.

It is derived from **IRremoteESP8266 v2.8.6**, Copyright 2009 Ken Shirriff, Copyright 2015 Kristian
Lauszus, Copyright 2015 Mark Szabo, Copyright 2017-2021 David Conran and contributors.
Source: https://github.com/crankyoldgit/IRremoteESP8266

The source actually read was IRremoteESP8266 master at commit `1e2f0f3` (version 2.9.0, 2026-01-03).

| File here        | Upstream files                                                           |
| ---------------- | ------------------------------------------------------------------------ |
| `panasonicAc.ts` | `src/ir_Panasonic.cpp`, `src/ir_Panasonic.h`                             |
| `irsend.ts`      | `src/IRsend.cpp` (sendData, sendGeneric), `test/IRsend_test.h`           |
| `samsungAc.ts`   | `src/ir_Samsung.cpp`, `src/ir_Samsung.h`, `src/IRac.cpp` (IRac::samsung) |

The Panasonic release notes list only documentation changes since v2.8.6. Each file states its
upstream copyright and the changes made. The test vectors in `tests/ir/lgpl/` are copied from the
matching upstream `test/ir_*_test.cpp` files and are under the same licence. The rest of One Remote is
not covered by this licence.

## Offer of source

For at least three years from the date you received this app, the author will supply, on request, the
complete corresponding source code of everything in `src/ir/lgpl/`, in a form that lets you modify
and rebuild it. Write to devanshc13@gmail.com. The source is also in the One Remote repository.
