# One Remote Matter Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Commission the Panasonic Matter AC into One Remote's own fabric and control it locally.
The lane first proves this on hardware (Android first, iPhone if the Apple entitlement is
available). Only then does it build:

- the `matter` link driver;
- the native adapter behind a `MatterController` interface;
- the Matter step in Add AC.

**Requires:** `lane/foundation` merged into `main` first. Work on `lane/matter`, branched from that
`main`. Task 6 also needs `lane/ir` merged, since it plugs into the IR lane's `AddApplianceFlow`
(`renderMatterStep`).

**Architecture:**

- **Pure side.** `src/matter` is pure TypeScript: the `MatterController` interface, the mapping
  between `AcState` and the Thermostat, Fan Control and On/Off clusters, the pairing-code parser,
  and the driver. It is tested against a fake controller.
- **Native side.** `src/matter/native/` (exempt from the pure-folder rule) adapts a local Expo
  module, `modules/matter-controller`, to `MatterController`. The spike picks the native library.
- **Through services.** Screens reach commissioning through a new `services.matter`
  (`MatterSetup`, typed in `src/core/matterSetup.ts`), and control through the `DeviceHub`.

**Tech Stack:** Expo SDK 58 dev client and Expo Modules API (Kotlin; Swift if the iPhone spike
passes), TypeScript strict, Bun, `expo-camera` (QR scanning), Jest (jest-expo).

- **Android:** Google Play services Matter commissioning API
  (`com.google.android.gms:play-services-home`) handing off to the app's own `CommissioningService`.
  A native controller comes from the connectedhomeip Android controller, as in Google's "Google Home
  Sample App for Matter" (Apache-2.0); the spike confirms or replaces it.
- **iPhone:** `MatterSupport` and `Matter.framework`.

**Spec:** `docs/superpowers/specs/2026-10-30-one-remote-design.md` (§6 "Matter", §7, §8 risk 1).
Foundation interfaces: `docs/superpowers/plans/2026-10-30-one-remote-foundation.md` Tasks 3–9. IR lane
seam: `docs/superpowers/plans/2026-10-30-one-remote-ir.md` Task 9 (`AddApplianceFlow`,
`MatterStepProps`). Mockup: `docs/design/one-remote-mockup-v4.html` ("Add an AC": the Matter logo
step and "Connecting"; "Fell back to IR"). Executors read the spec first.

## Global Constraints

- Everything in the foundation plan's Global Constraints applies.
- Foundation names, used verbatim: `Device`, `Link` (`{ kind: 'matter'; nodeId: string }`),
  `Command`, `AcState`, `AcMode`, `AcFan`, `Capabilities`, `Reported`, `DeviceError`, `LinkDriver`,
  `Unsubscribe`, `clampSetpoint`, `defaultAcState` (`src/core`); `Prefix`, `assertLocal`
  (`src/transport/localOnly.ts`); `SecretStore` (`src/store`); `Services`, `createServices`,
  `useServices` (`src/services/`); `NameRoomStep`, `DeviceSheet`.
- **Pass bar (spec §8):** 5 of 5 setpoint changes reflected on the AC within 2 s.
- **Fallback (spec §8):** if the spike fails on a platform, ship TV + IR and keep Matter behind a
  flag on that platform (`MATTER_PLATFORMS` in `src/matter/platforms.ts`, default
  `{ android: false, ios: false }`). Go back to the author only if neither platform can commission.
- **Open questions** (spec §6; asked in Task 1, Step 1):
  - Does the author have a paid Apple Developer account? Until they say yes, iPhone Matter is off
    and the iPhone gets TV only.
  - Is the bench AC already set up in MirAIe or Google Home? The default is multi-admin with a
    pairing code from that app. A factory reset needs the author's OK.
- **Secrets:** fabric root keys and operational credentials stay in native secure storage (Android
  Keystore, iOS Keychain). JS stores only `nodeId` in the link.
- **Local network only:**
  - before use, the device's operational address passes `assertLocal` with the phone's on-link
    prefixes, IPv6 included (from the native module);
  - otherwise the link is unusable with `DeviceError('notLocal')`;
  - the native controller has no cloud, OTA or DCL lookups configured.
- **Words:** the UI never asks "Matter or IR?" and never says "protocol". The word "Matter" appears
  only for the logo and code step, and in the device sheet's link name.
- Copy only in `src/i18n/en/matter.ts`.
- **Shared files** (one-line edits, so merges with the other lanes are trivial):
  - `src/services/services.tsx`: one `import type { MatterSetup } from '@/core/matterSetup';` line
    and one `matter: MatterSetup;` field.
  - `src/services/createServices.ts`: one import block, one `const matterController = …` line, the
    `matter` entry in the default `drivers` array (replace the `createFakeDriver('matter')` line; if
    there is none, add one line), and one `matter: deps.matter ?? …` property.
  - `src/i18n/index.ts`: one import line and one namespace entry (`matter`).
  - `app/add/ac.tsx`: one line passing `renderMatterStep={(p) => <MatterStep {...p} />}` to the IR
    lane's `AddApplianceFlow`, plus its import.
  - `src/screens/device/DeviceSheet.tsx`: one import line and one line rendering
    `<MatterLinkActions deviceId={deviceId} />` in "How it's connected".
  - `app.json` / `app.config.ts`:
    - one `plugins` entry, `./plugins/withMatter`;
    - one iOS `NSBonjourServices` entry with `_matter._tcp` and `_matterc._udp`;
    - the camera permission string for `expo-camera`: "One Remote uses the camera to scan the setup
      code on your AC.".
  - `eslint.config.js`: add `app/dev/matter-spike.tsx` to the dev-spike override's `files`.

## Review Focus

1. **Commissioning fails halfway** (the wrong Wi-Fi password in the system prompt, the AC out of BLE
   range): the Connecting list marks the failed step and says what to do, with "Try again". It never
   leaves a spinner, and no device is saved. Test in Task 6.
2. **A pairing code with a typo:** a manual code whose check digit is wrong is refused before
   commissioning starts ("Check the code and type it again"). Test in Task 3 (parser) and Task 6
   (screen).
3. **The AC's operational address is not local** (a router hands out a global IPv6 address outside
   the phone's /64): the link is refused with `notLocal`, and the hub falls back to IR. Test in
   Task 4.
4. **The subscription drops** (AC power cut, Wi-Fi blip): the driver resubscribes with backoff, and
   sends meanwhile throw `notSent` so the hub uses IR. The screen keeps the last reported state.
   Test in Task 4.
5. **A setpoint outside the AC's own limits** (it reports 18–30, the user presses − at 18): the
   write is clamped to the reported limits, never rejected by the AC. Test in Task 4.

---

### Task 1: Android spike: commission into the app's fabric and control the AC (gate)

**Blocks:** Tasks 4 and 5 (merge), and Task 6. **Runs first.**

**Files:**
- Create:
  - `modules/matter-controller/expo-module.config.json`, `modules/matter-controller/index.ts`;
  - `modules/matter-controller/android/**`: the module, its `CommissioningService`, the Gradle
    dependencies and the controller binaries the spike chooses;
  - `plugins/withMatter.js`, `src/matter/platforms.ts`, `app/dev/matter-spike.tsx`,
    `docs/spike/matter-results.md`.
- Modify (shared): the `plugins` entry in `app.json`/`app.config.ts`, and `eslint.config.js`.

**Spike module surface** (throwaway names are fine; Task 5 adapts it to `MatterController`):
- `commission(payload: string)`;
- `read(nodeId)` → OnOff, SystemMode, OccupiedCoolingSetpoint, LocalTemperature, FanMode,
  AbsMin/MaxCoolSetpointLimit and FanModeSequence;
- `writeSetpoint(nodeId, centi)`;
- `subscribe(nodeId)`, emitting `onAttributes`;
- `peerAddress(nodeId)`;
- `onLinkPrefixes()`.

- [ ] **Step 1: Ask the author the two open questions** (Global Constraints) and record the answers
  at the top of `docs/spike/matter-results.md`.
  - If the AC is set up in MirAIe or Google Home, get a fresh pairing code there (multi-admin).
    Record the exact menu path for the Task 6 copy.
  - Do not factory-reset the AC without the author's OK.
- [ ] **Step 2: Build the module.**
  - Start from Google's "Google Home Sample App for Matter":
    - `Matter.getCommissioningClient(activity).commissionDevice(CommissioningRequest)` with
      `setCommissioningService(ComponentName(context, OneRemoteCommissioningService::class.java))`;
    - the service finishes commissioning with the controller and returns
      `CommissioningCompleteMetadata`.
  - Pin exact versions of `play-services-home` and the controller (a connectedhomeip release tag
    such as `v1.3.0.0`, its AAR and `.so`).
  - `withMatter.js` adds the service to `AndroidManifest.xml`, plus the Gradle repository and
    dependencies.
  - The spike screen is dev-only (it redirects to `/` unless `__DEV__`). It has:
    - Commission (paste or type a code);
    - Read;
    - Setpoint − and +, timing each write to the next subscription report;
    - a "5×" button: 5 setpoint changes 4 s apart, with each round-trip time;
    - Subscribe;
    - a log.
- [ ] **Step 3: Check it builds.** Run `bun run typecheck && bun run lint`, then
  `bunx expo prebuild --clean && bunx expo run:android`. Commit
  `feat(matter): add Android Matter spike module and screen`.
- [ ] **Step 4 (author, on hardware):** on the iQOO, and again on the S21 FE:
  - commission the bench Matter AC;
  - read the room temperature;
  - run "5×", watching the AC's display.
- [ ] **Step 5: Record** in `docs/spike/matter-results.md`:
  - the library and versions, and the APK size before and after;
  - the commissioning steps the system UI showed, and the time each took;
  - whether `CommissioningRequest` accepted our own payload (QR or 11-digit) or needed its own
    scanner;
  - whether power is OnOff or Thermostat SystemMode Off;
  - the supported SystemModes, FanModeSequence, setpoint limits and RockSupport;
  - the peer address type (ULA, link-local or global);
  - the 5× results against the pass bar.
- [ ] **Step 6: Apply the gate.**
  - **Pass:** set `MATTER_PLATFORMS.android = true`. Commit
    `docs(spike): record Android Matter results`.
  - **Fail:** leave it `false` and record why. Tasks 4–6 are not merged for Android. Continue with
    Task 2.

### Task 2: iPhone spike (conditional on a paid Apple Developer account) (gate)

**Blocks:** the iOS half of Task 5. **Skip** (record "not attempted: no paid Apple Developer
account; iPhone gets TV only") unless Task 1, Step 1 recorded a paid account.

**Files:**
- Create: `modules/matter-controller/ios/**` (the module and a `MatterSupport` extension target).
- Modify: `plugins/withMatter.js` (iOS part: entitlements and the extension target),
  `docs/spike/matter-results.md`.

- [ ] **Step 1: Build on the author's Mac.**
  - Add the Matter entitlements to the app ID.
  - Add a `MatterAddDeviceExtensionRequestHandler` extension to `withMatter.js`, and an
    `MTRDeviceController` with its own fabric (`Matter.framework`).
  - Expose the same spike surface as Task 1.
  - Build: `bun install && bunx expo prebuild --clean && bunx expo run:ios --device`.
- [ ] **Step 2 (author):** commission (a fresh multi-admin code if the AC already belongs to the
  Android fabric), read, and run "5×".
- [ ] **Step 3: Record** the same fields as Task 1, Step 5, plus the Xcode and iOS versions and how
  the extension target was added.
  - **Pass:** set `MATTER_PLATFORMS.ios = true`.
  - **Fail:** leave it `false`; the iPhone gets TV only.
  - **Neither platform could commission:** stop the lane and report to the author (spec §8).
  - Commit `docs(spike): record iPhone Matter results`.

### Task 3: Controller interface, cluster mapping, pairing codes and fake controller

**Not blocked:** pure code. It may start during the spike, but it is merged only if Task 1 or Task 2
passed.

**Files:**
- Create: `src/matter/controller.ts`, `src/matter/clusters.ts`, `src/matter/codes.ts`,
  `src/matter/testing/fakeController.ts`, `src/core/matterSetup.ts`.
- Test: `tests/matter/clusters.test.ts`, `tests/matter/codes.test.ts`, `tests/matter/fakeController.test.ts`.

**Interfaces:**
- Produces:

```ts
// controller.ts
export interface MatterAcAttrs { onOff?: boolean; systemMode: number; occupiedCoolingSetpoint: number; // 0.01 °C
  fanMode?: number; rockSetting?: number; localTemperature: number | null }
export interface MatterAcInfo { hasOnOff: boolean; absMinCool: number; absMaxCool: number; // 0.01 °C
  fanModeSequence?: number; rockSupport?: number; systemModes?: number[] }
export type MatterWrite = Partial<Pick<MatterAcAttrs, 'onOff' | 'systemMode' | 'occupiedCoolingSetpoint' | 'fanMode' | 'rockSetting'>>;
export interface MatterController {
  available(): boolean;
  commission(payload: string, onStep: (s: CommissionStep) => void): Promise<{ nodeId: string }>;
  info(nodeId: string): Promise<MatterAcInfo>;
  read(nodeId: string): Promise<MatterAcAttrs>;
  write(nodeId: string, w: MatterWrite): Promise<void>;     // rejects MatterError
  subscribe(nodeId: string, onAttrs: (a: MatterAcAttrs) => void, onLost: () => void): Unsubscribe;
  peerAddress(nodeId: string): Promise<string | null>;
  onLinkPrefixes(): Promise<Prefix[]>;
}
// clusters.ts (pure)
export const SYSTEM_MODE: { off: 0; auto: 1; cool: 3; fanOnly: 7; dry: 8 };
export const FAN_MODE: { off: 0; low: 1; medium: 2; high: 3; on: 4; auto: 5 };
export function toWrites(s: AcState, info: MatterAcInfo): MatterWrite[];   // in send order
export function fromAttrs(a: MatterAcAttrs, last: AcState): { state: AcState; roomTemp?: number };
export function capabilitiesFrom(info: MatterAcInfo): Capabilities;
// codes.ts (pure)
export type MatterCode = { kind: 'qr'; payload: string } | { kind: 'manual'; digits: string };
export function parseMatterCode(input: string): MatterCode | null;
// core/matterSetup.ts (types the screens may import)
export type CommissionStep = 'found' | 'network' | 'responds';
export type MatterErrorCode = 'cancelled' | 'badCode' | 'notFound' | 'networkFailed' | 'noResponse'
  | 'unreachable' | 'rejected' | 'unavailable';
export class MatterError extends Error { constructor(readonly code: MatterErrorCode, readonly step?: CommissionStep) }
export interface MatterSetup {
  available(): boolean;
  parseCode(input: string): MatterCode | null;
  commission(code: MatterCode, onStep: (s: CommissionStep) => void): Promise<Extract<Link, { kind: 'matter' }>>;
}
// testing/fakeController.ts
export function createFakeController(opts?: { available?: boolean; info?: Partial<MatterAcInfo>; peer?: string;
  prefixes?: Prefix[]; failAt?: CommissionStep }): MatterController & {
  writes: MatterWrite[]; setAttrs(a: Partial<MatterAcAttrs>): void; lose(): void; unreachable(on: boolean): void };
```

- `toWrites`:
  - `power:false` → `[{onOff:false}]` when `hasOnOff`, else `[{systemMode:0}]`;
  - `power:true` → `{onOff:true}` (when `hasOnOff`), then `{systemMode}`, then
    `{occupiedCoolingSetpoint}`, then `{fanMode}` (when `fanModeSequence` is defined), then
    `{rockSetting}` (when `rockSupport` is set);
  - the setpoint is `clampSetpoint(s.setpoint, capabilitiesFrom(info)) * 100`;
  - fan: `auto`→5, `1`→1, `2`→2, `3`→3.
- `fromAttrs`:
  - `onOff === false` or `systemMode === 0` → `power:false`, keeping `last.mode`;
  - fan: 4 (On) → `'auto'`;
  - setpoint is `Math.round(occupiedCoolingSetpoint / 100)`;
  - `roomTemp` is `localTemperature / 100`, omitted when `null`.
- `capabilitiesFrom`:
  - `setpoint` = `{min: absMinCool/100, max: absMaxCool/100}`;
  - `acModes` = the subset of cool/dry/fan/auto in `systemModes` (all four when unknown);
  - `acFan` by FanModeSequence: 0 → `[1,2,3]`, 1 → `[1,3]`, 2 → `[1,2,3,'auto']`,
    3 → `[1,3,'auto']`, 4 and 5 → `['auto']`, undefined → `[]`;
  - `swing` = `rockSupport > 0`;
  - `sleep: false`.
- `parseMatterCode`:
  - strips spaces and dashes;
  - takes 11 or 21 digits whose last digit is the Verhoeff check digit of the rest → `manual`;
  - takes `MT:` followed by at least 19 base-38 characters `[0-9A-Z.-]` → `qr`;
  - anything else → `null`.

- [ ] **Step 1: Write the failing tests.**
  - `toWrites({power:true,mode:'cool',setpoint:24,fan:2,swing:false,sleep:false}, {hasOnOff:true,absMinCool:1600,absMaxCool:3000,fanModeSequence:2})`
    → `[{onOff:true},{systemMode:3},{occupiedCoolingSetpoint:2400},{fanMode:2}]`.
  - `power:false` with `hasOnOff:false` → `[{systemMode:0}]`.
  - setpoint 16 with `absMinCool:1800` → `occupiedCoolingSetpoint:1800` (Review Focus 5).
  - `fromAttrs({onOff:true,systemMode:8,occupiedCoolingSetpoint:2550,fanMode:5,localTemperature:2710}, defaultAcState())`
    → `mode:'dry'`, `setpoint:26`, `fan:'auto'`, `power:true`, `roomTemp:27.1`; with
    `localTemperature:null` → no `roomTemp`.
  - `capabilitiesFrom` for sequence 1 gives `acFan:[1,3]`, and for `rockSupport:0`, `swing:false`.
  - `parseMatterCode`:
    - `'34970112332'` and `'3497-011-2332'` → `{kind:'manual',digits:'34970112332'}`;
    - `'34970112331'` → `null` (check digit; Review Focus 2);
    - `'MT:Y.K9042C00KA0648G00'` → `qr`;
    - `'hello'` and `'1234'` → `null`.
  - fake: `commission` with `failAt:'network'` calls `onStep('found')`, then rejects
    `MatterError('networkFailed','network')`; `setAttrs` reaches subscribers.
- [ ] **Step 2: Run it.** `bun run test tests/matter`. Expect FAIL.
- [ ] **Step 3: Implement** the five files.
- [ ] **Step 4: Run it.** Expect PASS.
- [ ] **Step 5: Commit** `feat(matter): add Matter controller interface, AC cluster mapping and code parser`.

### Task 4: The `matter` link driver

**Not blocked for writing** (pure, against the fake). It is merged only with the platform flag from
Task 1 or Task 2 set.

**Files:**
- Create: `src/matter/driver.ts`.
- Test: `tests/matter/driver.test.ts`.

**Interfaces:**
- Consumes: Task 3; `LinkDriver`, `assertLocal`.
- Produces: `createMatterDriver(o: { controller: MatterController; enabled: boolean; resubscribeMs?: number[] /* [1000, 2000, 5000, 10000, 30000] */ }): LinkDriver & { kind: 'matter' }`.

- `available()` = `enabled && controller.available()`.
- `supports` is only `ac.set` on a device of kind `ac`.
- `capabilities` returns the cached `capabilitiesFrom(info)`. Before the first `info` it returns
  the default `{ acModes:['cool','dry','fan','auto'], acFan:['auto',1,2,3], setpoint:{min:16,max:30}, swing:false, sleep:false }`.
- **Local check:** on first use per node, `peerAddress` must pass
  `assertLocal(addr, await controller.onLinkPrefixes())`. On failure the node is marked `notLocal`,
  and every send rejects `DeviceError('notLocal')` until the app restarts.
- **`send(ac.set)`:** runs `toWrites` in order.
  - `MatterError('unreachable')` before the first write → `DeviceError('notSent')`; after one →
    `DeviceError('timeout')`. `ac.set` is idempotent, so the hub may fall back either way.
  - `MatterError('rejected')` on a `systemMode` write removes that mode from the cached
    capabilities and rejects `DeviceError('unsupported')`.
- **`observe`:** `read`, then `subscribe`. It emits `{kind:'ac', state, roomTemp}` from `fromAttrs`.
  On `onLost` it resubscribes with `resubscribeMs` backoff. Sends while the subscription is lost
  first try one `read`; if that fails, they reject `notSent`.

- [ ] **Step 1: Write the failing tests** (fake controller, fake timers):
  - `writes the full state in order`: `ac.set` cool 24 fan 2 → `writes` equal Task 3's first
    `toWrites` case;
  - `reports real state`: `setAttrs({occupiedCoolingSetpoint:2500, localTemperature:2700})` →
    the observer gets `setpoint:25`, `roomTemp:27`;
  - `rejects a non-local peer` (Review Focus 3):
    - peer `'2001:db8::5'` with prefixes `[{address:'2401:4900:1c3a:5e10::7',bits:64}]` → send
      rejects `notLocal`;
    - peer `'2401:4900:1c3a:5e10::abcd'` → resolves;
  - `unreachable is notSent`: `unreachable(true)` → rejects `notSent`, and `writes` is empty;
  - `resubscribes after loss` (Review Focus 4): `lose()`, advance `1000` ms → `subscribe` called
    again, and later `setAttrs` still reaches the observer;
  - `clamps to the AC's limits`: info `absMinCool:1800`, send setpoint 16 → the write is `1800`;
  - `rejected mode`: `dry` rejected → send rejects `unsupported`, and `capabilities().acModes`
    no longer has `'dry'`;
  - `disabled`: `enabled:false` → `available() === false`.
- [ ] **Step 2: Run it.** `bun run test tests/matter/driver.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement** `driver.ts`.
- [ ] **Step 4: Run it.** Expect PASS, with `src/matter` (excluding `native/`) coverage at least 80%.
- [ ] **Step 5: Commit** `feat(matter): add matter link driver`.

### Task 5: Native adapter and wiring

**Blocked on the spike:** this task starts only after Task 1 (or Task 2) passed. It wraps whatever
library the spike chose. The plan fixes only the interface and the tests.

**Files:**
- Create: `src/matter/native/nativeController.ts`, `src/matter/setup.ts`.
- Modify: `modules/matter-controller/**` (turn the spike surface into the `MatterController`
  surface); shared lines in `src/services/services.tsx`, `src/services/createServices.ts` and
  `app.json`/`app.config.ts` (`NSBonjourServices`).
- Test: `tests/matter/nativeController.test.ts`, `tests/matter/setup.test.ts`,
  `tests/services/matterServices.test.ts`.

**Interfaces:**
- Consumes: Tasks 3–4; `MATTER_PLATFORMS`.
- Produces:
  - `createNativeMatterController(): MatterController`. It loads the module with
    `requireOptionalNativeModule('MatterController')`; `available()` is `false` when the module is
    `null`, as in Jest or on a platform where the spike failed;
  - `createMatterSetup(o: { controller: MatterController }): MatterSetup`. Its `commission` returns
    `{kind:'matter', nodeId}` and checks the peer with `assertLocal` before resolving;
  - in `createServices`: `const matterController = createNativeMatterController();`, the driver
    `createMatterDriver({ controller: matterController, enabled: MATTER_PLATFORMS[Platform.OS === 'ios' ? 'ios' : 'android'] })`,
    and `matter: deps.matter ?? createMatterSetup({ controller: matterController })`.
- The native module emits commissioning progress as `onCommissionStep` with `'found' | 'network' | 'responds'`.
  Native errors map to `MatterErrorCode`:
  - the user cancelled the system UI → `cancelled`;
  - an invalid payload → `badCode`;
  - BLE discovery failed → `notFound` (step `found`);
  - Wi-Fi provisioning failed → `networkFailed` (step `network`);
  - CASE or the first read failed → `noResponse` (step `responds`).

- [ ] **Step 1: Write the failing tests** (mock the native module):
  - with the module `null` → `available() === false`, and `commission` rejects `unavailable`;
  - with mocked events `found`, `network`, `responds`, then success `{nodeId:'0x12'}` → `onStep`
    gets the three steps in order, and `setup.commission` resolves `{kind:'matter', nodeId:'0x12'}`;
  - a native error `E_WIFI` → rejects `MatterError('networkFailed','network')`;
  - a non-local peer after commissioning → rejects `DeviceError('notLocal')`;
  - `createServices()` holds a `matter` driver and `services.matter`, and building them calls no
    native method.
- [ ] **Step 2: Run it.** `bun run test tests/matter/nativeController.test.ts tests/matter/setup.test.ts tests/services/matterServices.test.ts`.
  Expect FAIL.
- [ ] **Step 3: Implement** the adapter, the setup and the shared lines.
- [ ] **Step 4: Run it.** Expect PASS. Then `bun run typecheck && bun run lint && bun run test`.
- [ ] **Step 5: Commit** `feat(matter): add native Matter controller adapter and wire it into services`.

### Task 6: Matter step in Add AC, Connecting list and re-pair

**Blocked on:** Task 5 merged, and `lane/ir` merged (for `AddApplianceFlow` and `MatterStepProps`).

**Files:**
- Create: `src/screens/add/matter/{MatterStep,ScanCode,TypeCode,ConnectingStep}.tsx`,
  `src/screens/add/matter/connecting.ts`, `src/screens/device/MatterLinkActions.tsx`,
  `src/i18n/en/matter.ts`.
- Modify (shared): `app/add/ac.tsx` (one line and an import), `src/screens/device/DeviceSheet.tsx`
  (one import, one line), `src/i18n/index.ts`, and the `expo-camera` permission in `app.json`/`app.config.ts`.
- Test: `tests/screens/add/matterStep.test.tsx`, `tests/screens/add/connecting.test.ts`,
  `tests/screens/device/matterLinkActions.test.tsx`.

**Interfaces:**
- Consumes: `MatterStepProps` (`{ brandId; onDone(link); onSkip() }`) from the IR lane;
  `services.matter`.
- Produces:

```ts
export type RowState = 'pending' | 'active' | 'done' | 'failed';
export function connectingRows(reached: CommissionStep[], failed?: MatterError):
  { step: CommissionStep; state: RowState }[];      // always three rows: found, network, responds
export function MatterStep(p: MatterStepProps): React.JSX.Element;
export function MatterLinkActions(props: { deviceId: string }): React.JSX.Element | null;
```

- **Matter step** (mockup v4 "Matter (if it has it)"):
  - "Does it have this logo?";
  - "Point the camera at the Matter QR code on the AC's sticker or manual". The camera opens only
    here, and the permission is asked the first time;
  - "Type the 11-digit code instead";
  - "No Matter logo — use the AC's remote codes" → `onSkip()`.
  - Multi-admin help, under "Already set up in another app?": "If the AC is already in MirAIe or
    Google Home, open that app and look for "Linked Matter apps" or "Share device". It shows a new
    code; scan or type it here." Use the exact MirAIe menu path from the spike results when it was
    recorded.
  - An invalid typed code → "Check the code and type it again", and nothing starts.
- **Connecting** (mockup v4 "Matter setup"):
  - rows "Found the AC", "Joining your Wi-Fi", "Checking it responds", each ✓, … or ✗;
  - "Keep the phone near the AC with Bluetooth on";
  - on failure, the failed row and one line of copy:
    - `notFound` "Couldn't find the AC. Bring the phone closer and check the AC is in pairing mode.";
    - `networkFailed` "The AC couldn't join your Wi-Fi. Check the Wi-Fi password and try again.";
    - `noResponse` "The AC joined but didn't answer. Try again.";
    - `badCode` "That code didn't work. Get a new code and try again.";
    - `cancelled` → back to the Matter step with no message;
  - with "Try again". On success, `onDone(link)`. The IR lane's flow then offers the IR backup on IR
    phones.
- `MatterLinkActions`: for a device with a `matter` link, "Pair again" runs the Matter step and
  replaces that link's `nodeId` in the store.

- [ ] **Step 1: Write the failing tests:**
  - `connectingRows(['found'])` → found `done`, network `active`, responds `pending`;
  - `connectingRows(['found'], new MatterError('networkFailed','network'))` → network `failed`;
  - screen:
    - typing `'34970112331'` → "Check the code and type it again", and `commission` not called;
    - typing `'34970112332'` → Connecting; the fake emits `found`, then fails at `network` →
      "The AC couldn't join your Wi-Fi…"; "Try again" calls `commission` a second time; nothing is
      saved (Review Focus 1);
    - success → `onDone` with `{kind:'matter', nodeId}`;
    - "No Matter logo…" → `onSkip`;
    - the multi-admin help text renders;
  - `app/add/ac.tsx` passes `renderMatterStep`, so on a fake with Matter available, Add AC →
    Panasonic shows "Does it have this logo?";
  - `MatterLinkActions`: "Pair again" with a new node `'0x34'` saves the link `{kind:'matter',nodeId:'0x34'}`
    and keeps the other links.
- [ ] **Step 2: Run it.** `bun run test tests/screens/add/matterStep.test.tsx tests/screens/add/connecting.test.ts tests/screens/device/matterLinkActions.test.tsx`.
  Expect FAIL.
- [ ] **Step 3: Implement** to mockup v4. Install with `bunx expo install expo-camera`.
- [ ] **Step 4: Run it.** Expect PASS. Then `bun run typecheck && bun run lint && bun run test --coverage`,
  all green.
- [ ] **Step 5: Commit** `feat(matter): add Matter code step and connecting steps to Add AC`.
- [ ] **Step 6: Smoke-test** on the iQOO:
  - add the Matter AC end to end, accept the IR backup, and see the room temperature on the AC
    screen;
  - turn the AC's Wi-Fi off at the router: the AC screen line reads "Matter not reachable · sent
    over IR · point at the AC", and presses still work;
  - turn the Wi-Fi back on: the line returns to "Connected".

  Report; do not push.
