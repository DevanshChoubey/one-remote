# One Remote IR Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Control the Panasonic ACs, the Atomberg fans and the LG TV's power from phones with an IR
blaster. The lane covers:

- the Android `ConsumerIrManager` module;
- the IR catalogue;
- the Panasonic AC encoder, ported from IRremoteESP8266 under LGPL-2.1;
- the Atomberg fan codes (MIT) and the LG TV NEC codes;
- the `ir` link driver;
- the AC and fan screens;
- the Add AC and Add fan flow with the IR test, and "IR backup" from the device sheet;
- the IR hardware spike.

**Requires:** `lane/foundation` merged into `main` first. Work on `lane/ir`, branched from that `main`.
Runs in parallel with `lane/tv` and `lane/matter`.

**Architecture:**

- **Pure IR code.** `src/ir` is pure TypeScript: signal formats, the catalogue, encoders and the
  driver. Signals are `{ freqHz, pattern }` in microseconds, the shape `ConsumerIrManager.transmit`
  takes.
- **LGPL boundary.** Everything derived from IRremoteESP8266 lives in `src/ir/lgpl/` with its own
  `LICENSE` and notice. Nothing outside that folder copies its code.
- **Native module.** `modules/ir-emitter` is a local Expo module. `src/transport/irEmitter.ts` adapts
  it to the pure `IrEmitter` interface.
- **Through services.** Screens reach the catalogue and the IR test through a new `services.ir`
  (`IrSetup`, typed in `src/core/irSetup.ts`), and send commands through the `DeviceHub`.

**Tech Stack:** Expo SDK 58 dev client and Expo Modules API (Kotlin), TypeScript strict, Bun,
expo-router, `expo-haptics`, Jest (jest-expo). Code sources: IRremoteESP8266 **v2.8.6** (LGPL-2.1)
and the SmartIR repository's Atomberg fan files (MIT).

**Spec:** `docs/superpowers/specs/2026-10-30-one-remote-design.md` (§3 goals 2, 4, 5 and 6, §6
"IR" and "Device model", §8 risk 3). Foundation interfaces:
`docs/superpowers/plans/2026-10-30-one-remote-foundation.md` Tasks 3–9. Mockups:
`docs/design/one-remote-mockup-v3.html` ("AC", "Fan") and `docs/design/one-remote-mockup-v4.html`
("Add an AC", "IR test", "No IR on this phone", "Add a fan", "Fell back to IR"). Research:
`docs/research/2026-10-30-market-and-validation.md` §5 "IR" and "IR code sources". Executors read
the spec first.

## Global Constraints

- Everything in the foundation plan's Global Constraints applies.
- Foundation names, used verbatim: `Device`, `Link` (`{ kind: 'ir'; remoteId }`), `Command`,
  `AcState`, `AcMode`, `AcFan`, `FanState`, `FanSpeed`, `TvKey`, `Capabilities`, `DeviceError`,
  `LinkDriver`, `isIdempotent`, `defaultAcState`, `clampSetpoint` (`src/core`); `DeviceHub`,
  `DeviceView` (`src/device/hub.ts`); `HomeStore`, `PreferenceStore` (`src/store`); `Services`,
  `createServices`, `useServices` (`src/services/`); `NameRoomStep`, `DeviceSheet`.
- **Permissions:** `android.permission.TRANSMIT_IR` is declared, and
  `<uses-feature android:name="android.hardware.consumerir" android:required="false" />`. Both go
  in the module's `AndroidManifest.xml`, which the manifest merger applies. On iOS, `hasIrEmitter()`
  is `false`.
- **Remote ids:** `'panasonic-ac/<model>'` with `<model>` one of `dke`, `jke`, `nke`, `lke` and
  `rkr`; `'atomberg-fan/<n>'`, where `<n>` is the SmartIR file number; and `'lg-tv/nec'` (the TV
  lane appends this id).
- **v1 brands:** only Panasonic (AC), Atomberg (fan) and LG (TV power). A brand is listed only once
  its codes have tests (spec §6 "v1 brands").
- **Never resend automatically.** One press is one `transmit`.
- **Attribution:** the UI never shows the word "SmartIR". The About screen credits "Fan IR codes:
  MIT licence, © their contributors" with the full MIT text, and "IR encoders: IRremoteESP8266,
  LGPL-2.1".
- **Timings:** `200` ms between consecutive fan keys in one `fan.set`; Panasonic `36700` Hz;
  NEC and Broadlink-derived codes `38000` Hz.
- Copy only in `src/i18n/en/{ac,fan,addAppliance}.ts`.
- **Shared files** (one-line edits, so merges with the other lanes are trivial):
  - `src/services/services.tsx`: one `import type { IrSetup } from '@/core/irSetup';` line and one
    `ir: IrSetup;` field.
  - `src/services/createServices.ts`: one import block, one `const irEmitter = createNativeIrEmitter();`
    line, the `ir` entry in the default `drivers` array (replace the `createFakeDriver('ir')` line;
    if there is none, add one line), and one `ir: deps.ir ?? createIrSetup({ emitter: irEmitter })`
    property.
  - `src/i18n/index.ts`: three import lines and three namespace entries (`ac`, `fan`,
    `addAppliance`).
  - `app/device/[id].tsx`: the `ac` and `fan` branches only (`<AcScreen deviceId={id} />`,
    `<FanScreen deviceId={id} />`).
  - `src/screens/device/DeviceSheet.tsx`: one import line and one line rendering
    `<IrBackupAction deviceId={deviceId} />` in "How it's connected".
  - The licences list behind Settings › About: replace the foundation's LGPL placeholder entry with
    the two entries above.
  - `eslint.config.js`: add `app/dev/ir-spike.tsx` to the dev-spike override's `files`.
- Constructing services makes no native call. The module loads through `requireOptionalNativeModule`,
  so it is `null` in Jest and on iOS.

## Review Focus

1. **A press transmits exactly once**, even when the hub retries the link later or the user presses
   again quickly. Toggle keys (fan Boost, Sleep and Light) are sent only when the last state is
   known, never guessed. Test in Task 5.
2. **Phone without IR in the add flow:** the user never reaches the IR test. They see "This phone has
   no IR blaster" and "Add anyway", and the device saved that way shows greyed out on Home. Test in
   Task 9.
3. **"Yes, it worked" before pressing Test, or the confirm press fails:** "Yes" is disabled until
   Test was pressed. A failed confirm moves on to the next candidate. When all fail, the user sees
   "Sorry, we don't have codes for this AC yet." Test in Task 9.
4. **Buttons the AC lacks:** Sleep, Swing, modes and fan speeds missing from `capabilities` are not
   rendered, so a press cannot send a state the AC ignores. Test in Task 7.
5. **The vendor IR call fails** (iQOO quirk, or the emitter is busy): `transmit` throwing becomes
   `DeviceError('notSent')`, and the screen says "Couldn't send. Try again", never a silent success.
   Test in Task 5 and Task 7.

---

### Task 1: IR emitter native module

**Files:**
- Create: `modules/ir-emitter/expo-module.config.json`, `modules/ir-emitter/index.ts`,
  `modules/ir-emitter/android/build.gradle`, `modules/ir-emitter/android/src/main/AndroidManifest.xml`,
  `modules/ir-emitter/android/src/main/java/expo/modules/iremitter/IrEmitterModule.kt`,
  `src/ir/emitter.ts`, `src/transport/irEmitter.ts`, `src/ir/testing/fakeEmitter.ts`.
- Test: `tests/transport/irEmitter.test.ts`, `tests/ir/fakeEmitter.test.ts`.

**Interfaces:**
- Produces:

```ts
// src/ir/emitter.ts (pure)
export interface IrSignal { freqHz: number; pattern: number[] }   // µs, mark first, even length
export interface IrEmitter { hasEmitter(): boolean; transmit(s: IrSignal): Promise<void> }
// src/ir/testing/fakeEmitter.ts
export function createFakeEmitter(opts?: { has?: boolean }): IrEmitter & { sent: IrSignal[]; failNext(): void };
// src/transport/irEmitter.ts
export function createNativeIrEmitter(): IrEmitter;
```

- Kotlin module `IrEmitter`:
  - `Function("hasIrEmitter")` returns `ConsumerIrManager?.hasIrEmitter() == true`;
  - `AsyncFunction("transmit") { freq: Int, pattern: IntArray -> }` calls
    `ConsumerIrManager.transmit` and rejects with code `E_IR_TRANSMIT` on any exception.
- `createNativeIrEmitter`:
  - `hasEmitter()` is `false` when the module is `null` (iOS, Jest);
  - `transmit` rejects `DeviceError('noIrEmitter')` when there is no emitter, and
    `DeviceError('notSent')` on `E_IR_TRANSMIT`;
  - before calling native, it rejects patterns longer than `2,000,000` µs in total, or of odd
    length, with `DeviceError('unsupported')`.

- [ ] **Step 1: Write the failing tests:**
  - with the native module mocked `null` → `hasEmitter() === false`, and `transmit` rejects
    `noIrEmitter`;
  - with a mock that throws `E_IR_TRANSMIT` → rejects `notSent`;
  - a pattern of odd length → rejects `unsupported`, and native is not called;
  - the fake records `sent`, and `failNext()` makes the next `transmit` reject `notSent`.
- [ ] **Step 2: Run it.** `bun run test tests/transport/irEmitter.test.ts tests/ir/fakeEmitter.test.ts`.
  Expect FAIL.
- [ ] **Step 3: Implement** the module and the adapters. The manifest holds exactly the permission
  and the `required="false"` feature from Global Constraints.
- [ ] **Step 4: Run it.** Expect PASS. Then `bunx expo prebuild --clean` and check that
  `android/app/src/main/AndroidManifest.xml` contains both lines.
- [ ] **Step 5: Commit** `feat(ir): add ConsumerIrManager Expo module and emitter adapter`.

### Task 2: Signal formats and catalogue

**Files:**
- Create: `src/ir/nec.ts`, `src/ir/broadlink.ts`, `src/ir/catalogue.ts`, `src/core/irSetup.ts`.
- Test: `tests/ir/nec.test.ts`, `tests/ir/broadlink.test.ts`, `tests/ir/catalogue.test.ts`.

**Interfaces:**
- Consumes: `IrSignal` (Task 1).
- Produces:

```ts
// nec.ts (our own code; NEC is a public protocol)
export function necSignal(code32: number): IrSignal; // 38 kHz; 9000/4500 header, 560 mark, 1690/560 spaces, MSB first, 560 trailer, final gap pads the frame to 108000 µs
// broadlink.ts
export function broadlinkToSignal(base64: string): IrSignal; // 0x26 IR packet, 2-byte LE length at [2..3]; tick = 269/8192 ms (≈32.84 µs); 0x00 + 2-byte BE for long pulses; stops at 0x0d 0x05
// catalogue.ts
export type FanKey = 'off' | 'speed1' | 'speed2' | 'speed3' | 'speed4' | 'speed5' | 'boost' | 'sleep'
  | 'timer1' | 'timer2' | 'timer4' | 'timer8' | 'timerOff' | 'light';
export type Remote =
  | { id: string; kind: 'ac'; brandId: string; label: string; caps: Capabilities; encode(s: AcState): IrSignal }
  | { id: string; kind: 'fan'; brandId: string; label: string; caps: Capabilities; keys: Partial<Record<FanKey, IrSignal>> }
  | { id: string; kind: 'tv'; brandId: string; label: string; keys: Partial<Record<TvKey | 'powerOn', IrSignal>> };
export interface Catalogue { brands(kind: 'ac' | 'fan'): BrandInfo[]; remotes(brandId: string): Remote[]; remote(id: string): Remote | undefined }
export function createCatalogue(remotes: Remote[], brands: BrandInfo[]): Catalogue;
export function testPlan(r: Remote): { first: TestPress; confirm: TestPress };
// src/core/irSetup.ts (types the screens may import; catalogue.ts imports them from here)
export type TestPress = 'acOnCool24' | 'acUp25' | 'fanSpeed3' | 'fanLight' | 'fanSpeed1';
export interface BrandInfo { id: string; name: string; kind: 'ac' | 'fan'; matter: boolean }
export interface IrCandidate { remoteId: string; label: string }
export interface IrSetup {
  hasEmitter(): boolean;
  brands(kind: 'ac' | 'fan'): BrandInfo[];
  candidates(brandId: string): IrCandidate[];          // in test order
  testPlan(remoteId: string): { first: TestPress; confirm: TestPress };
  sendTest(remoteId: string, press: TestPress): Promise<void>;
  brandOf(remoteId: string): BrandInfo | undefined;
}
```

- `testPlan`:
  - AC → `{acOnCool24, acUp25}`, which send `defaultAcState()` with `power:true` (Cool 24°), then the
    same state at 25°;
  - a fan with `light` → `{fanSpeed3, fanLight}`;
  - a fan without `light` → `{fanSpeed3, fanSpeed1}`.
- **Candidate order (ruling):** the bench variant first once the spike names it; until then the
  catalogue order.

- [ ] **Step 1: Write the failing tests.**
  - `necSignal(0x20DF10EF)`:
    - `freqHz` is 38000;
    - the pattern length is 68 (header 2, 32 bits × 2, trailer mark, final gap);
    - it starts `[9000, 4500, 560, 560, 560, 560, 560, 1690]` (0x2 = `0010`, MSB first);
    - its total duration is exactly 108,000 µs.
  - `broadlinkToSignal`:
    - a hand-built packet `[0x26,0x00,0x07,0x00, 0x11,0x22, 0x00,0x01,0x2c, 0x0d,0x05]` (base64)
      decodes, with `Math.round(ticks × 269000 / 8192)`, to `[558, 1116, 9851, 100000]`: the
      odd-length pattern is padded with a trailing gap of `100000`;
    - a non-`0x26` packet throws `DeviceError('unsupported')`.
  - `createCatalogue`:
    - `brands('ac')` lists only brands that have remotes;
    - `remotes('panasonic')` keeps insertion order;
    - an unknown id gives `undefined`;
    - `testPlan` follows the three cases above.
- [ ] **Step 2: Run it.** `bun run test tests/ir`. Expect FAIL.
- [ ] **Step 3: Implement** the four files.
- [ ] **Step 4: Run it.** Expect PASS.
- [ ] **Step 5: Commit** `feat(ir): add NEC and Broadlink signal formats and the IR catalogue`.

### Task 3: Panasonic AC encoder (LGPL-2.1)

**Files:**
- Create: `src/ir/lgpl/LICENSE` (the LGPL-2.1 text), `src/ir/lgpl/NOTICE.md`,
  `src/ir/lgpl/panasonicAc.ts`, `tests/ir/lgpl/panasonicAc.fixtures.ts`.
- Test: `tests/ir/lgpl/panasonicAc.test.ts`.

**Interfaces:**
- Consumes: `IrSignal`, `AcState`.
- Produces:

```ts
export type PanasonicModel = 'dke' | 'jke' | 'nke' | 'lke' | 'rkr';
export function panasonicAcBytes(s: AcState, model: PanasonicModel): Uint8Array; // 27 bytes: 8-byte section 1, 19-byte section 2
export function panasonicAcSignal(s: AcState, model: PanasonicModel): IrSignal;  // 36700 Hz, both sections with the section gap
export const PANASONIC_CAPS: Capabilities;
```

- Port from IRremoteESP8266 v2.8.6, `src/ir_Panasonic.cpp` and `.h`:
  - the `IRPanasonicAc` class: `stateReset`, `setModel`, `setPower`, `setMode`, `setTemp`,
    `setFan`, `setSwingVertical` and `fixChecksum`;
  - the timing constants `kPanasonicHdrMark`, `kPanasonicHdrSpace`, `kPanasonicBitMark`,
    `kPanasonicOneSpace`, `kPanasonicZeroSpace`, `kPanasonicAcSectionGap` and the message gap.
  - Keep their names in comments.
- Each file starts with a header giving: the LGPL-2.1 licence; "Derived from IRremoteESP8266
  v2.8.6, src/ir_Panasonic.cpp, © David Conran and contributors"; and the changes made.
- The CKP model is left out: its power is a toggle, which breaks "every IR press sends the full
  state".
- Mapping:
  - mode: `cool`→Cool, `dry`→Dry, `fan`→Fan, `auto`→Auto;
  - fan: `auto`→Auto, `1`→Low, `2`→Medium, `3`→High;
  - `swing: true`→vertical Auto, `false`→vertical Middle;
  - `sleep` is ignored.
- `PANASONIC_CAPS` = `{ acModes: ['cool','dry','fan','auto'], acFan: ['auto',1,2,3], setpoint: { min: 16, max: 30 }, swing: true, sleep: false }`.
- `NOTICE.md` says the folder is LGPL-2.1, names its source and version, and says how to get the
  source. The app's other code is not covered.

- [ ] **Step 1: Copy the reference fixtures.** From IRremoteESP8266 v2.8.6 `test/ir_Panasonic_test.cpp`,
  copy into `tests/ir/lgpl/panasonicAc.fixtures.ts`, with the test name and line in a comment:
  - the expected 27-byte states for at least three settings per model `dke`, `jke`, `nke`, `lke` and
    `rkr`, built with `setModel`, `setMode`, `setTemp` and `setFan`;
  - one expected timing string (`f36700d50m…s…`) from a `sendPanasonicAc` test.
- [ ] **Step 2: Write the failing tests:**
  - every fixture's state equals `panasonicAcBytes` for the same settings;
  - the timing string parses to a pattern equal to `panasonicAcSignal(...).pattern`;
  - the checksum byte (index 26) equals the reference for each fixture;
  - `power:false` changes only the power bit and the checksum;
  - setpoint `31` is clamped to 30 and `15` to 16 (via `clampSetpoint` with `PANASONIC_CAPS`).
- [ ] **Step 3: Run it.** `bun run test tests/ir/lgpl`. Expect FAIL.
- [ ] **Step 4: Implement** `panasonicAc.ts`.
- [ ] **Step 5: Run it.** Expect PASS.
- [ ] **Step 6: Commit** `feat(ir): port Panasonic AC encoder from IRremoteESP8266 (LGPL-2.1)`.

### Task 4: Code sets: Panasonic remotes, Atomberg fans, LG TV, and `IrSetup`

**Files:**
- Create: `src/ir/codes/panasonic.ts`, `src/ir/codes/atomberg.ts`, `src/ir/codes/lgTv.ts`,
  `src/ir/codes/index.ts`, `src/ir/codes/ATTRIBUTION.md`, `src/ir/setup.ts`.
- Test: `tests/ir/codes.test.ts`, `tests/ir/setup.test.ts`.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `defaultCatalogue: Catalogue` (`src/ir/codes/index.ts`), with brands
    `{id:'panasonic', name:'Panasonic', kind:'ac', matter:true}` and
    `{id:'atomberg', name:'Atomberg', kind:'fan', matter:false}`, and the TV remote `'lg-tv/nec'`
    (it is not a listed brand);
  - `createIrSetup(o: { emitter: IrEmitter; catalogue?: Catalogue }): IrSetup` (`src/ir/setup.ts`).

- `panasonic.ts`: one `Remote` per model (`panasonic-ac/dke`, `/jke`, `/nke`, `/lke`, `/rkr`) whose
  `encode` is `panasonicAcSignal(s, model)` and whose caps are `PANASONIC_CAPS`.
- `atomberg.ts`: the two Atomberg fan files from SmartIR's `codes/fan/` (find them by
  `"manufacturer": "Atomberg"`), kept as their base64 Broadlink strings and decoded with
  `broadlinkToSignal`.
  - The file header carries the MIT licence text and copyright line from SmartIR's `LICENSE`, the
    source file numbers, and the commit hash.
  - Map SmartIR command names to `FanKey`, with the mapping table in a comment. Speeds in their
    listed order become `speed1…speedN`.
  - `caps = { fanLight: <has light>, sleep: <has sleep> }`.
- `lgTv.ts`: `'lg-tv/nec'` with `necSignal` codes:
  - `power` `0x20DF10EF`;
  - `powerOn` `0x20DF23DC` (discrete on, so `tv.powerOn` stays idempotent);
  - `volumeUp` `0x20DF40BF`;
  - `volumeDown` `0x20DFC03F`;
  - `mute` `0x20DF906F`.
- `ATTRIBUTION.md` names both sources, their licences and versions. It is the file the About screen's
  licence text is copied from.

- [ ] **Step 1: Write the failing tests:**
  - every Atomberg code decodes, with an even pattern length and `freqHz` 38000;
  - each Atomberg remote has `off` and `speed1`…`speed5` (if a file lacks one, the test names it,
    and the spike gate applies);
  - `lg-tv/nec` `powerOn` equals `necSignal(0x20DF23DC)`;
  - `brands('ac')` is `[Panasonic]` and `brands('fan')` is `[Atomberg]`;
  - `candidates('panasonic')` lists five remotes;
  - `setup.sendTest('panasonic-ac/dke','acUp25')` transmits `panasonicAcSignal({...defaultAcState(), power:true, setpoint:25}, 'dke')`;
  - `brandOf('atomberg-fan/<n>')` gives Atomberg.
- [ ] **Step 2: Run it.** `bun run test tests/ir/codes.test.ts tests/ir/setup.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement** the code files and `setup.ts`.
- [ ] **Step 4: Run it.** Expect PASS.
- [ ] **Step 5: Commit** `feat(ir): add Panasonic, Atomberg and LG TV code sets and IR setup`.

### Task 5: The `ir` link driver and wiring

**Files:**
- Create: `src/ir/driver.ts`, `src/ir/fanKeys.ts`.
- Modify (shared, see Global Constraints): `src/services/services.tsx`, `src/services/createServices.ts`.
- Test: `tests/ir/driver.test.ts`, `tests/ir/fanKeys.test.ts`, `tests/services/irServices.test.ts`.

**Interfaces:**
- Consumes: Tasks 1–4, `LinkDriver`.
- Produces:

```ts
export function fanKeys(prev: FanState | undefined, next: FanState, keys: ReadonlySet<FanKey>): FanKey[];
export function createIrDriver(o: { emitter: IrEmitter; catalogue?: Catalogue; gapMs?: number /* 200 */ }): LinkDriver & { kind: 'ir' };
```

- `fanKeys` rules:
  - `next.power` false → `['off']`;
  - power on → `speed<n>` when `prev` is undefined, was off, or had another speed;
  - then, only when `prev` is known and on: `boost` if boost changed, `sleep` if sleep changed,
    `light` if light changed (keys present only);
  - then `timer<h>`, or `timerOff`, if `timerHours` changed and that key exists.
- Driver:
  - `available()` = `emitter.hasEmitter()`;
  - `capabilities` = the remote's `caps` (`{}` for TV);
  - `supports`:
    - `ac.set` for AC remotes;
    - `fan.set` for fan remotes;
    - `tv.powerOn` and `tv.key` `power`/`volumeUp`/`volumeDown`/`mute` when the TV remote has
      that key;
    - nothing for an unknown `remoteId`.
  - `send`:
    - `ac.set` → one `transmit(remote.encode(state))`;
    - `fan.set` → `transmit` each key from `fanKeys(last[deviceId], state, …)`, `gapMs` apart. It
      stores `last[deviceId]` only after all keys went out;
    - TV → one `transmit`.
    - Emitter errors pass through as `DeviceError` (`notSent`, `noIrEmitter`). No retries.
  - No `observe`; the hub keeps `lastSent` (foundation Task 6).

- [ ] **Step 1: Write the failing tests:**
  - `fanKeys`:
    - `(undefined, {power:true, speed:3, boost:true, …})` → `['speed3']` (no blind toggles);
    - `({on,speed:3,boost:false}, {on,speed:3,boost:true})` → `['boost']`;
    - `({on,speed:2}, {off})` → `['off']`;
    - a timer change to 4 without a `timer4` key → `[]`.
  - driver:
    - `transmits once per press`: `ac.set` → `emitter.sent.length === 1`; two quick sends → 2;
    - `emitter failure is notSent`: `failNext()` → rejects `notSent`, and `sent` is unchanged;
    - `no emitter`: `has:false` → `available() === false`;
    - `fan keys are spaced`: a `fan.set` needing `speed4` and `light` → two transmits, at least
      `200` ms apart (fake timers);
    - `tv`: `supports(tv.powerOn)` is `true` for `'lg-tv/nec'`, and `supports(tv.key up)` is
      `false`;
    - `unknown remote`: `supports` is `false` for `'nope/1'`.
  - services: `createServices()` holds an `ir` driver and `services.ir`, and building them calls no
    native method.
- [ ] **Step 2: Run it.** `bun run test tests/ir/driver.test.ts tests/ir/fanKeys.test.ts tests/services/irServices.test.ts`.
  Expect FAIL.
- [ ] **Step 3: Implement** and wire the two shared lines.
- [ ] **Step 4: Run it.** Expect PASS, with `src/ir` coverage at least 80%.
- [ ] **Step 5: Commit** `feat(ir): add ir link driver and wire it into services`.

### Task 6: IR hardware spike (gate)

**Files:**
- Create: `app/dev/ir-spike.tsx`, `docs/spike/ir-results.md`.
- Modify (shared): `eslint.config.js` (spike override).

The screen is dev-only (it redirects to `/` unless `__DEV__`) and drives `services.ir` and the
driver directly. It shows `hasEmitter()`. It has per-candidate buttons for each Panasonic model (On
Cool 24, 25, Off); every Atomberg key for each code set; and the LG TV power, powerOn, volume and
mute. It also has a "×10" button that sends the selected press 10 times, 3 s apart, and a log of
each transmit with its duration.

- [ ] **Step 1: Implement the spike screen.** Run `bun run typecheck && bun run lint`.
- [ ] **Step 2: Commit** `feat(ir): add IR spike screen`.
- [ ] **Step 3 (author, on hardware):**
  - Run `adb shell pm list features | grep consumerir` on the iQOO Z10x. Expect
    `feature:android.hardware.consumerir`.
  - Build `bunx expo prebuild --clean && bunx expo run:android`.
  - From 3 m, run "×10" for:
    - the Panasonic IR-only AC: On Cool 24, then 25;
    - each Atomberg fan: power and speed 1–5;
    - the LG TV: powerOn and power, with the TV off.
  - On the S21 FE, check `hasEmitter()` is `false` and IR-only cards are greyed out on Home.
- [ ] **Step 4: Record** in `docs/spike/ir-results.md`:
  - phone, Android version and whether `consumerir` is listed;
  - the remote model numbers printed on the Panasonic and Atomberg remotes;
  - which Panasonic model variant worked;
  - which Atomberg code set worked, and how its remote cancels a timer;
  - whether speed keys also turn the fan on;
  - whether the LG discrete power-on works on the C4;
  - x/10 per press against the pass bar, **10 of 10 from 3 m**.

  Then set the candidate order in `src/ir/codes` to put the bench variants first. Commit
  `docs(spike): record IR hardware results`.

**Gate:**
- **Panasonic or Atomberg codes don't match the real devices:** stop. Capture the real codes with
  an ESP32 and IRremoteESP8266's `IRrecvDumpV2` before going further (spec §6). Add them as a new
  code set with tests from the capture.
- **A key missing from the Atomberg file:** treat it the same way.
- **Signals go out, but the devices ignore them** (a vendor timing quirk): add a pattern-unit quirk
  test and fix to `src/transport/irEmitter.ts` before Task 9.
- **LG discrete power-on fails:** drop `powerOn` from `'lg-tv/nec'`, so the TV lane's Wake-on-LAN
  path is used. Never fall back to the power toggle for `tv.powerOn`.

Tasks 7–8 use fakes and can run during the hardware run. Task 9's candidate order waits for this
result.

### Task 7: AC screen

**Files:**
- Create: `src/screens/appliance/AcScreen.tsx`, `src/screens/appliance/acModel.ts`,
  `src/screens/appliance/statusLine.ts`, `src/screens/appliance/pressFeedback.ts`, `src/i18n/en/ac.ts`.
- Modify (shared): `app/device/[id].tsx` (the `ac` branch), `src/i18n/index.ts`.
- Test: `tests/screens/appliance/acModel.test.ts`, `tests/screens/appliance/statusLine.test.ts`,
  `tests/screens/appliance/acScreen.test.tsx`.

**Interfaces:**
- Consumes: `useServices()` (`hub`, `prefs`), `DeviceView`, `DeviceSheet`.
- Produces:

```ts
export interface AcView { state: AcState; source: 'reported' | 'lastSent' | 'none'; roomTemp?: number; caps: Capabilities }
export function acView(v: DeviceView): AcView;                            // 'none' → defaultAcState()
export function nextAc(s: AcState, change: Partial<AcState>, caps: Capabilities): AcState; // clamps the setpoint
export function statusLine(v: DeviceView): { key: string; params?: Record<string, string> };
export function AcScreen(props: { deviceId: string }): React.JSX.Element;
```

- Layout (mockup v3 "AC"):
  - the header has ‹, the name, the subtitle "{room} · {temp}° in the room" (room temperature only
    when `roomTemp` is present), ⏻ and ⋯;
  - the dial shows the setpoint and the mode name, with − and +;
  - mode chips ❄ Cool, 💧 Dry, 🌬 Fan, A Auto, filtered by `caps.acModes`;
  - fan chips 1, 2, 3 and Auto, filtered by `caps.acFan`;
  - ↕ Swing (only if `caps.swing`) and 🌙 Sleep (only if `caps.sleep`);
  - the status line at the bottom.
- **Ruling:** the mockup's ⏲ Timer is not built. The frozen `AcState` has no timer; it is a gap
  for the foundation model.
- Every press sends `{kind:'ac.set', state: nextAc(...)}` with the full state. While `power` is
  false, everything except ⏻ is disabled. − at the minimum and + at the maximum are disabled and
  send nothing.
- The screen shows the sent state at once (optimistic), then whatever the hub's view says.
- `statusLine` keys and copy:
  - `ac.status.connected` "● Connected · how it's connected": the first link worked, and it reports
    state;
  - `ac.status.irOnly` "Sent over IR · point the phone at the AC": `via === 'ir'`, not fallen back;
  - `ac.status.fellBack` "{link} not reachable · sent over IR · point at the AC": `fellBack` and
    `via === 'ir'`; `{link}` is `t('device.link.<device.links[0].kind>')`;
  - `ac.status.needsIr` "Needs a phone with IR": `usable === false`.
  - "how it's connected" opens the `DeviceSheet`.
- Send errors: `notSent` → "Couldn't send. Try again"; `timeout` → "The AC didn't answer. Try
  again"; `noIrEmitter` → "Needs a phone with IR".
- `pressFeedback()` calls `Haptics.selectionAsync()` when `prefs.get().haptics`.

- [ ] **Step 1: Write the failing tests.**
  - `acView`:
    - a reported state with `roomTemp:27` → `source:'reported'`, `roomTemp:27`;
    - a `lastSent` state → `source:'lastSent'` with no `roomTemp`;
    - no state → `defaultAcState()`.
  - `nextAc`: `+` at 30 stays 30; a change of `mode:'dry'` keeps the other fields.
  - `statusLine`: the four cases above, including "Matter not reachable · sent over IR · point at
    the AC" for links `[matter, ir]` with `fellBack:true, via:'ir'`.
  - screen (fake hub):
    - + from 24 sends `ac.set` with `setpoint:25` and every other field unchanged;
    - Dry sends `mode:'dry'`;
    - caps `{sleep:false, swing:false, acModes:['cool','dry']}` → no Sleep, Swing, Fan or Auto
      chips in the tree (Review Focus 4);
    - a reported `roomTemp:27` → "27° in the room"; IR-only → no room temperature line;
    - `power:false` → − and + are disabled;
    - a send rejecting `notSent` → "Couldn't send. Try again" (Review Focus 5).
- [ ] **Step 2: Run it.** `bun run test tests/screens/appliance`. Expect FAIL.
- [ ] **Step 3: Implement** to mockup v3 "AC" and v4 "Fell back to IR".
- [ ] **Step 4: Run it.** Expect PASS.
- [ ] **Step 5: Commit** `feat(ac): add AC remote screen`.

### Task 8: Fan screen

**Files:**
- Create: `src/screens/appliance/FanScreen.tsx`, `src/screens/appliance/fanModel.ts`, `src/i18n/en/fan.ts`.
- Modify (shared): `app/device/[id].tsx` (the `fan` branch), `src/i18n/index.ts`.
- Test: `tests/screens/appliance/fanScreen.test.tsx`.

**Interfaces:**
- Consumes: Task 7's `statusLine` and `pressFeedback`; `useServices()`.
- Produces: `fanView(v: DeviceView): { state: FanState; caps: Capabilities }` (default
  `{power:false, speed:1, boost:false, sleep:false, timerHours:0}`) and
  `FanScreen(props: { deviceId: string }): React.JSX.Element`.

- Layout (mockup v3 "Fan"):
  - "Speed" with five tall bars (1 2 3 above, 4 5 below), lit up to the current speed;
  - ⚡ Boost and 🌙 Sleep;
  - "Timer" chips Off, 1 h, 2 h, 4 h and 8 h;
  - 💡 Light, only if `caps.fanLight`;
  - ✨ LED is not built (`FanState` has no LED field).
- Tapping a bar sends `fan.set` with `{power:true, speed:n}`. ⏻ flips `power`. All presses send the
  full `FanState`.

- [ ] **Step 1: Write the failing tests:**
  - the five bars render, each with label "Speed n" and role `button`;
  - tapping bar 4 sends `fan.set` with `speed:4, power:true`;
  - Boost sends `boost:true`;
  - the 2 h chip sends `timerHours:2`;
  - `fanLight:false` → no Light row; `fanLight:true` → Light toggles `light`;
  - an IR-only fan on a phone without IR → the screen shows "Needs a phone with IR" and the bars are
    disabled.
- [ ] **Step 2: Run it.** `bun run test tests/screens/appliance/fanScreen.test.tsx`. Expect FAIL.
- [ ] **Step 3: Implement** to mockup v3 "Fan".
- [ ] **Step 4: Run it.** Expect PASS.
- [ ] **Step 5: Commit** `feat(fan): add fan remote screen`.

### Task 9: Add AC and Add fan flow (brand, IR test, no-IR phone)

**Files:**
- Create: `src/screens/add/appliance/{AddApplianceFlow,BrandStep,IrTestStep,NoIrStep,NoCodesStep}.tsx`,
  `src/screens/add/appliance/flow.ts`, `src/screens/add/appliance/irTest.ts`,
  `src/screens/add/appliance/feedback.ts`, `src/i18n/en/addAppliance.ts`.
- Modify (shared): `app/add/ac.tsx` → `<AddApplianceFlow kind="ac" />`; `app/add/fan.tsx` →
  `<AddApplianceFlow kind="fan" />`; `src/i18n/index.ts`.
- Test: `tests/screens/add/flow.test.ts`, `tests/screens/add/irTest.test.ts`,
  `tests/screens/add/addAppliance.test.tsx`.

**Interfaces:**
- Consumes: `services.ir` (`IrSetup`), `services.drivers`, `NameRoomStep`.
- Produces (the Matter lane plugs into `renderMatterStep`):

```ts
export type FlowStep =
  | { name: 'brand' }
  | { name: 'matter'; brandId: string }
  | { name: 'irTest'; brandId: string; backup: boolean }
  | { name: 'noIr'; brandId: string }
  | { name: 'noCodes'; brandId: string; backup: boolean }
  | { name: 'name'; links: Link[]; suggestedName: string };
export interface FlowEnv { kind: 'ac' | 'fan'; irAvailable: boolean; matterAvailable: boolean; hasIrCodes(brandId: string): boolean }
export function afterBrand(b: BrandInfo, env: FlowEnv): FlowStep;
export function afterMatter(brandId: string, matterLink: Link, env: FlowEnv): FlowStep;
export interface MatterStepProps { brandId: string; onDone(link: Extract<Link, { kind: 'matter' }>): void; onSkip(): void }
export function AddApplianceFlow(props: { kind: 'ac' | 'fan'; renderMatterStep?: (p: MatterStepProps) => React.ReactNode;
  replaceIrOn?: string /* device id: IR backup mode, Task 10 */ }): React.JSX.Element;
// irTest.ts (pure)
export type IrTestState = { candidates: string[]; index: number; phase: 'try' | 'confirm'; pressed: boolean; result?: string | 'none' };
export function irTestReducer(s: IrTestState, e: 'pressed' | 'yes' | 'no'): IrTestState;
```

- `matterAvailable` = `renderMatterStep !== undefined` and the `matter` driver in
  `services.drivers` is `available()`. `irAvailable` = `services.ir.hasEmitter()`.
- `afterBrand`:
  - `b.matter && matterAvailable` → `matter`;
  - else `irAvailable` → `irTest`;
  - else → `noIr`.
- `afterMatter`: `irAvailable && hasIrCodes` → `irTest` with `backup:true` (and a "Skip" action);
  otherwise → `name` with `[matterLink]`.
- `irTestReducer`:
  - `no` → next candidate, phase `try`, `pressed:false`, or `result:'none'` after the last;
  - `yes` with `pressed:false` → unchanged;
  - `yes` in `try` → phase `confirm`, `pressed:false`;
  - `yes` in `confirm` → `result` = that remote id;
  - `no` in `confirm` → next candidate.
- **Brand step:**
  - title "Which brand?";
  - `services.ir.brands(kind)`;
  - a disabled row "Other brands · Not yet supported";
  - the link "Brand missing? Tell us (opens email, nothing sent automatically)", which opens
    `mailto:devanshc13@gmail.com?subject=One%20Remote%20brand%20request` through `Linking`. The
    address is the constant `FEEDBACK_EMAIL` in `feedback.ts`.
- **IR test step** (mockup v4 "IR test"):
  - "{brand} · try {n} of {total}", "Point at the AC, press Test" (the fan variant says "the fan");
  - the press description from `testPlan`, e.g. "This turns the AC on, Cool 24°. Did it beep or
    turn on?", and for the confirm press "Now press Test to set 25°. Did it change?";
  - Test, "No, try next", "Yes, it worked" (disabled until Test was pressed), and progress dots.
  - Test calls `ir.sendTest(remoteId, press)`.
- **No codes:** "Sorry, we don't have codes for this {kind} yet." It goes on to `name` when this
  was a backup after Matter, and back to Home otherwise.
- **No IR** (mockup v4):
  - "This phone has no IR blaster";
  - "Only ACs with the Matter logo work from this phone. Phones with IR (many Xiaomi, Redmi, Poco,
    iQOO, Vivo) can control the rest.";
  - "Scan Matter code", shown only when the brand has Matter and `matterAvailable`;
  - "Add anyway (for another phone)" → `name` with `[{kind:'ir', remoteId: candidates[0].remoteId}]`.
    The device sheet's "Redo IR backup" fixes the guess on an IR phone.
- **Name:** `NameRoomStep` with `draft {kind, links}` and `suggestedName` "{brand} AC" or
  "{brand} fan".

- [ ] **Step 1: Write the failing tests.**
  - `afterBrand`:
    - Panasonic on an IR phone with Matter available → `matter`;
    - Panasonic with no `renderMatterStep` → `irTest`;
    - Atomberg on a phone without IR → `noIr`.
  - `afterMatter` on an IR phone → `irTest` with `backup:true`; on a phone without IR → `name` with
    `[matter]`.
  - `irTestReducer`:
    - `yes` before `pressed` is a no-op (Review Focus 3);
    - a full path of pressed → yes → pressed → yes gives `result` = candidate 0;
    - a `no` in `confirm` moves to candidate 1;
    - `no` on the last candidate gives `result:'none'`.
  - flow screen (fake `IrSetup` and drivers):
    - on a phone without IR, Add AC → Panasonic shows "This phone has no IR blaster"; "Add anyway"
      reaches `NameRoomStep` with links `[ir 'panasonic-ac/dke']`; the saved device's Home card is
      greyed (Review Focus 2);
    - on an IR phone, "try 1 of 5"; Test calls `sendTest(…,'acOnCool24')`; Yes → confirm; Test
      calls `sendTest(…,'acUp25')`; Yes → `NameRoomStep` with that remote;
    - every candidate answered "No" → "Sorry, we don't have codes for this AC yet.";
    - the fan flow's first press is `fanSpeed3`;
    - the brand list for a fan is `[Atomberg]` plus the disabled row.
- [ ] **Step 2: Run it.** `bun run test tests/screens/add`. Expect FAIL.
- [ ] **Step 3: Implement** to mockup v4 "Add an AC", "IR test", "No IR on this phone" and "Add a fan".
- [ ] **Step 4: Run it.** Expect PASS.
- [ ] **Step 5: Commit** `feat(add): add AC and fan add flow with IR test`.

### Task 10: IR backup from the device sheet, and licences

**Files:**
- Create: `src/screens/appliance/IrBackupAction.tsx`, `app/add/ir-backup.tsx`.
- Modify (shared): `src/screens/device/DeviceSheet.tsx` (one import, one line), and the About
  licence entries (replace the LGPL placeholder).
- Test: `tests/screens/appliance/irBackup.test.tsx`, plus one case in the existing
  `tests/screens/settings.test.tsx`.

**Interfaces:**
- Consumes: `AddApplianceFlow` (`replaceIrOn`), `services.ir`, `services.store`.
- Produces: `IrBackupAction({ deviceId }): React.JSX.Element | null`, and the route
  `/add/ir-backup?id=<deviceId>`.

- `IrBackupAction`:
  - hidden when `!ir.hasEmitter()`;
  - for an AC or fan: "Add IR backup" when no `ir` link, "Redo IR backup" when there is one. It
    opens `/add/ir-backup?id=…`, which runs `AddApplianceFlow` from the brand step. With a known
    brand (`ir.brandOf(existing remoteId)`), it starts at that brand's IR test.
  - On success the flow replaces the existing `ir` link, or appends one at the end (a backup), then
    returns to the device.
  - For a TV without an `ir` link: "Add IR backup" appends `{kind:'ir', remoteId:'lg-tv/nec'}`
    directly (one LG code set, no test).

- [ ] **Step 1: Write the failing tests:**
  - a `[matter]` AC on an IR phone shows "Add IR backup"; finishing the flow with
    `'panasonic-ac/nke'` saves links `[matter, ir 'panasonic-ac/nke']`;
  - an `[ir 'panasonic-ac/dke']` AC shows "Redo IR backup"; finishing with `nke` saves
    `[ir 'panasonic-ac/nke']` (replaced, not added);
  - a `[webos]` TV → links `[webos, ir 'lg-tv/nec']`;
  - a phone without IR → nothing rendered;
  - Settings › About lists "IR encoders: IRremoteESP8266, LGPL-2.1" and "Fan IR codes: MIT
    licence", and the rendered text never contains "SmartIR".
- [ ] **Step 2: Run it.** `bun run test tests/screens/appliance/irBackup.test.tsx tests/screens/settings.test.tsx`.
  Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it.** Expect PASS. Then `bun run typecheck && bun run lint && bun run test --coverage`,
  all green.
- [ ] **Step 5: Commit** `feat(ir): add IR backup from the device sheet and IR licence notices`.
- [ ] **Step 6: Smoke-test** on the iQOO:
  - add the IR-only Panasonic AC and both fans through the IR test;
  - control each from its screen;
  - on the S21 FE, the same flow shows the no-IR screen.

  Report; do not push.
