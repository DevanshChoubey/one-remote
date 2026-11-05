# Godrej aer Smart Matic in One Remote: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan runs in **waves**: Wave 0 is one agent (contracts); Wave 1 is six lanes at once (one git worktree each); Wave 2 is one integration agent; Wave 3 is the author with the real dispenser.

**Goal:** Add the Godrej aer Smart Matic (Bluetooth) to One Remote with Aer Remote v1's features and alerts, on Aer Remote's copied backend, drawn as in the central mock.

**Architecture:** Aer Remote's protocol, session/client, alerts engine, BLE transport and fake dispenser are copied into `src/aer` (pure TypeScript) and `src/transport/ble` (the only place that imports `react-native-ble-plx`), with names and imports adapted. `aer` joins `DeviceKind` and `Link` but not the hub: an `AerService` (built on the copied `DispenserClient`) and an `Alerts` engine are two new fields of `useServices()`. A small aer store keeps the read-back cache per One Remote device id and presents Aer Remote's `DispenserStore` over the home store, so the copied client and alert engine run unchanged. Wave 0 fixes every shared contract (types, fakes, copy, icons, routes) so the six Wave 1 lanes never touch each other's files.

**Tech Stack:** Expo SDK 58, React Native 0.88, TypeScript, expo-router, Reanimated 4.7, react-native-ble-plx (new), expo-notifications (new), @react-native-community/datetimepicker (new), Jest (jest-expo) + @testing-library/react-native, Bun.

**Spec:** `docs/superpowers/specs/2026-11-04-aer-dispenser-design.md` (binding). Mock: `docs/design/one-remote-mockup.html`, sections `#s-aer`, `#s-addaer` and `S.aer`, `S.aerSchedule`, `S.addAer`, `S.addAerBlink`, `S.addAerZone`, `S.addKind`, `S.addName` (kind `'aer'`), `S.settings`, `AerCard`, `sheetAer`, `alertsGroup`, `permNotif`, `permBt`, the `AER_*` tables and the CSS at lines 579-613. Source app: `/media/devansh/Experiment/playground/godrejapp` (called **AR** below).

## Global Constraints

- Bun only: `bun install`, `bun add`, `bunx`, `bun run`. Never npm, yarn or pnpm. Native deps with `bunx expo install <pkg>`.
- Tests: `bunx jest --maxWorkers=2 <path>` (never `bun run test`); the full `bunx jest --maxWorkers=2` before the commit that ends a task. Types: `bunx tsc --noEmit`. Lint: `bunx eslint <paths>`, and `bunx eslint . --max-warnings=0` before the commit that ends a task.
- Commits: Conventional Commits, author `Devansh Choubey <devanshc13@gmail.com>`, message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No `merge:` type (use `chore: merge <what> (<branch>)`). Never push.
- Pre-commit hook: prettier + eslint; no `console.log` (`console.warn`/`console.error` only); no `!` non-null assertions.
- Copied files start with one line: `// From aer-remote <AR path> (2026-11-04). Adapted: <what>.` Copied tests keep every assertion; only imports, names and the adaptations this plan names may change, and each such test change is listed in the task.
- Copy is only names and imports, except the adaptations listed here: `DeviceError`→`AerError` (and `DeviceErrorCode`→`AerErrorCode`), `SavedDispenser.bleId`, the `busy` code, per-group alert switches, `aerAlerts.*` copy keys, no location permission. Timeouts, retries, the channel probe, the 10 s idle disconnect and the replace-all schedule save are unchanged.
- `src/aer` is pure TypeScript (no React Native, Expo or AsyncStorage imports). Only `src/transport/ble/**` imports `react-native-ble-plx`; only `src/services/aerAlerts.ts` imports `expo-notifications`. Task 0.1 adds the lint rules.
- Bluetooth only, in the room: no network code, no telemetry, no account. No location permission on any Android version: below Android 12 (API 31) the aer is unavailable and shows "Needs Android 12". One Remote's `minSdkVersion` does not change. No `withReleaseMinSdk` (AR's) is copied.
- Alerts are local notifications only: no push token, no Firebase messaging, no exact alarms, no background Bluetooth.
- The mock is the reference for every screen, state and word. It is edited in place only by Task 0.5 (Wave 0) and Task W.1 (Wave 2). Wave 1 tasks write a needed mock edit into their task report instead.
- New copy lives in `src/i18n/en/aer.ts` and `src/i18n/en/aerAlerts.ts`, plus the named keys in `add.ts`, `device.ts` and `settings.ts`; all of it is written in Tasks 0.4 and 0.5, exactly as there. Wave 1 adds no keys (report any it needs).
- Screens compose from `@/ui`; colours, radii and shadows from `src/theme`; every new animation reads `useMotion()` (reduced: loops stop, moves become fades). Each screen task renders one screen with `scheme="dark"` and one with `reducedMotion` in its tests.
- Screens reach the aer only through `useServices().aer` / `.aerAlerts` and the helpers `@/services` re-exports (Task 0.4); never `@/aer` directly (lint enforces).
- Wave 1 parallel rules: each lane works in `.superpowers/worktrees/aer-<lane>` on branch `lane/aer-<lane>`, cut from the Wave 0 tip of `lane/aer`; it edits only the files its tasks list; it never edits `package.json`, `bun.lock`, `jest.config.js`, `eslint.config.js`, `app.json`, `src/services/services.tsx`, `src/services/index.ts`, `src/services/createServices.ts`, `tests/screens/helpers.tsx`, `src/i18n/**` or the mock (Lane C may edit `app.json`). It never changes a Wave 0 interface; if it needs to, it stops and reports.

## Review Focus

1. **An Android 11 (or older) phone.** The kind picker shows Air freshener disabled with "Needs Android 12"; opening `/add/aer` directly shows the same and never asks for location. Tests: Task E.1 `needs Android 12`, Task C.1 `androidPermissionsFor(30)`.
2. **The phone is in another time zone than the dispenser's home** (travelling, or a dispenser at a parent's home). The card's next spray and the schedule list use the home zone, and a zone change closes the session so the next connect sets the clock in the new zone. Tests: Task 0.4 `formatNextSpray uses the home zone`, Task A.4 `setTimeZone writes the link and reconnects`.
3. **A dispenser already in the app shows up in a new scan**, or one dispenser is reported twice. It is hidden; each other device is listed once, first found first. Tests: Task A.4 `scan hides added dispensers and repeats`, Task E.2 `lists first found first`.
4. **The aer cache in storage is corrupt or missing** (killed mid-write, app update). It reads as empty, the device stays on Home ("Not read yet"), and the screen reads it again; nothing throws into Home. Test: Task A.3 `corrupt cache reads as empty`.
5. **The app goes to the background, or the screen closes, mid-action** (Spray, then the Home button). Every session closes (`closeAll`), the dispenser is free within seconds, and no state update lands after unmount. Tests: Task F.3 `closes every session in the background`, Task D.2 `unmount while spraying`.

---

## Waves, lanes and dependencies

| Wave | Lane / task | Branch | Depends on | Files owned (summary) |
|---|---|---|---|---|
| 0 | 0.1 deps + lint + Jest setup | `lane/aer` | `main` | `package.json`, `bun.lock`, `jest.config.js`, `eslint.config.js`, `tests/setup/*`, `tests/lint-rules.test.ts` |
| 0 | 0.2 icons + small shared UI props | `lane/aer` | 0.1 | `src/ui/iconPaths.ts`, `src/ui/{IconButton,ProgressBar,OptionCard}.tsx`, `src/ui/addtv/Radar.tsx`, `src/ui/appliance/LinkLine.tsx` |
| 0 | 0.3 protocol, errors, time, BLE interface, model | `lane/aer` | 0.2 | `src/aer/protocol/*`, `src/aer/{errors,time}.ts`, `src/transport/ble/{transport,base64}.ts`, `src/core/model.ts`, `docs/protocol/` |
| 0 | 0.4 contracts, fakes, services, routes, alert copy | `lane/aer` | 0.3 | `src/aer/types.ts`, `src/aer/alerts/types.ts`, `src/aer/testing/*` (fakes), `src/services/*`, `src/screens/aer/{useAerView,format}.ts`, route stubs, `src/i18n/en/aerAlerts.ts` |
| 0 | 0.5 screen copy + mock gaps | `lane/aer` | 0.4 | `src/i18n/**`, the mock |
| 1 | Lane A backend: A.1 → A.2 → A.3 → A.4 | `lane/aer-a` | 0.4 | `src/aer/{session,client,store,service}.ts`, `src/aer/testing/fakeDispenser.ts` |
| 1 | Lane B alerts: B.1 → B.2 | `lane/aer-b` | 0.4 | `src/aer/alerts/*`, `src/services/aerAlerts.ts` |
| 1 | Lane C native: C.1 → C.2 | `lane/aer-c` | 0.4 | `src/transport/ble/rnTransport.ts`, `plugins/withNoPush.js`, `plugins/withNoLocation.js`, `app.json` |
| 1 | Lane D dispenser screens: D.1 → D.2 → D.3 | `lane/aer-d` | 0.5 | `src/screens/home/{AerCard,HomeScreen}.tsx`, `src/screens/aer/{AerScreen,ScheduleEditor,...}`, `src/ui/aer/{SprayDisc,LevelTile,TimeCard,timePicker}.tsx`, `app/device/[id].tsx`, `app/aer/schedule/[id].tsx` |
| 1 | Lane E add flow: E.1 → E.2 → E.3 | `lane/aer-e` | 0.5 | `src/screens/add/{KindPicker,NameRoomStep,newDevice}.tsx`, `src/screens/add/aer/*`, `src/ui/aer/BlinkArt.tsx`, `app/add/aer.tsx`, `app/aer/zone/[id].tsx` |
| 1 | Lane F sheet + settings + glue: F.1 → F.2 → F.3 | `lane/aer-f` | 0.5 | `src/screens/device/{DeviceSheet,linkActions}.tsx`, `src/screens/aer/AerSheetActions.tsx`, `src/screens/settings/*`, `src/screens/aer/{useAerAlertOpen,openSettings}.ts`, `src/screens/AppProviders.tsx`, `app/_layout.tsx` |
| 2 | W.1 merge + real wiring + dev spike | `lane/aer` | all of Wave 1 | `src/services/createServices.ts`, `app/dev/aer-spike.tsx`, the mock (reported edits) |
| 2 | W.2 release: docs + manifest check | `lane/aer` | W.1 | `PRIVACY.md`, `docs/store/google-play.md`, `plugins/*` if the check finds a leak |
| 3 | H.1 hardware check (manual) | `lane/aer` | W.2 | none (a report) |

Lanes A, B and C need only Tasks 0.1-0.4 and may start from the 0.4 tip while 0.5 is written; D, E and F start from the 0.5 tip. Inside a lane, tasks run in order. No Wave 1 lane reads another lane's code: all of them build on the Wave 0 interfaces and fakes. Merge order in W.1: A, B, C, D, E, F.

---

## Wave 0: contracts (one agent, sequential, branch `lane/aer` in `.superpowers/worktrees/aer`)

### Task 0.1: Dependencies, Jest setup and the layer rules

**Files:**
- Modify: `package.json`, `bun.lock` (via `bunx expo install`)
- Create: `tests/setup/expoNotifications.ts` (copy of AR `tests/setup/expoNotifications.ts`, plus `getExpoPushTokenAsync: jest.fn()` so a test can assert it is never called)
- Modify: `jest.config.js` (`setupFiles` gains `'<rootDir>/tests/setup/expoNotifications.ts'`)
- Modify: `eslint.config.js`, `tests/lint-rules.test.ts`

**Interfaces:**
- Produces: the three packages installed; layer rules: `aer` in `SERVICE_MODULES`, `DOMAIN_FOLDERS` and `PURE_FOLDERS` (purity message names `src/aer`); a `bleImports` pattern (`react-native-ble-plx`, `react-native-ble-plx/**`, message `'Bluetooth (react-native-ble-plx) is allowed only in src/transport/ble.'`) banned everywhere except `src/transport/ble/**`; a `notificationImports` pattern (`expo-notifications`, `expo-notifications/**`, message `'expo-notifications is allowed only in src/services/aerAlerts.ts.'`) banned everywhere except `src/services/aerAlerts.ts` and `tests/**`; `'// aer lane'` slot comment in `DEV_SPIKE_FILES`.

- [ ] **Step 1: Install.** `bunx expo install react-native-ble-plx expo-notifications @react-native-community/datetimepicker`. Expected: all three in `dependencies` at SDK 58 versions (AR uses `react-native-ble-plx ~3.5.1`, `expo-notifications ~58.1.7`).
- [ ] **Step 2: Write the failing lint tests** in `tests/lint-rules.test.ts`, with its `errorsFor` helper:
  `expect(errorsFor("import { BleManager } from 'react-native-ble-plx';\nexport const X = BleManager;\n", 'src/aer/x.ts')).toContain('no-restricted-imports')`, the same for `src/screens/x.tsx` and `src/services/x.ts`, and `toEqual([])` for `src/transport/ble/x.ts`; `expect(errorsFor("import * as N from 'expo-notifications';\nexport const X = N;\n", 'src/aer/alerts/x.ts')).toContain('no-restricted-imports')` and `toEqual([])` for `src/services/aerAlerts.ts`; `expect(errorsFor("import { Platform } from 'react-native';\nexport const X = Platform;\n", 'src/aer/x.ts')).toContain('no-restricted-imports')`; `expect(errorsFor("import { x } from '@/aer/client';\nexport const X = x;\n", 'src/screens/x.tsx')).toContain('no-restricted-imports')`.
- [ ] **Step 3: Run** `bunx jest --maxWorkers=2 tests/lint-rules.test.ts`. Expected: FAIL on the new cases.
- [ ] **Step 4: Implement** the rules in `eslint.config.js` (add `bleImports` and `notificationImports` to every `patterns` list that has `socketImports`, then an override for `src/transport/ble/**` without `bleImports` and one for `src/services/aerAlerts.ts` without `notificationImports`), and the Jest setup file.
- [ ] **Step 5: Run** `bunx jest --maxWorkers=2 tests/lint-rules.test.ts && bunx tsc --noEmit && bunx eslint . --max-warnings=0`. Expected: PASS, no errors.
- [ ] **Step 6: Commit** `build(aer): add Bluetooth, notifications and time picker, and their layer rules`.

### Task 0.2: The aer icons and small shared UI props

**Files:**
- Modify: `src/ui/iconPaths.ts` (8 icons), `src/ui/IconButton.tsx`, `src/ui/ProgressBar.tsx`, `src/ui/OptionCard.tsx`, `src/ui/addtv/Radar.tsx`, `src/ui/appliance/LinkLine.tsx`
- Test: `tests/ui/aerKit.test.tsx`

**Interfaces:**
- Produces: `IconName` gains `'aer' | 'spray' | 'bt' | 'btoff' | 'battery' | 'clock' | 'globe' | 'bell'` (paths copied from the mock's `<symbol id="i-…">`); `IconButtonProps.tone?: 'ink' | 'power' | 'accent'` (`accent`: accent-soft disc, accent icon, mock `.ibtn.acc`) and `IconButtonProps.busy?: boolean` (spinner instead of the icon, `accessibilityState.busy`); `ProgressBarProps.tone?: 'accent' | 'warm' | 'danger'` (mock `.stat.low`/`.stat.bad`); `RadarProps.icon?: IconName` (default `'wifi'`); `LinkLineProps.icon?: IconName` (replaces the default dot/icon).

- [ ] **Step 1: Write the failing tests** `it('draws every aer icon')` (each of the 8 names renders `Icon` without throwing and is in `ICON_NAMES`); `it('IconButton accent tone and busy')` (busy shows `getByTestId('<id>-spinner')` and `accessibilityState.busy === true`); `it('ProgressBar tone colours the fill')` (`danger` fill uses `theme.color.danger`, dark scheme too); `it('Radar and LinkLine take an icon')`.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/ui/aerKit.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the props; defaults keep every existing render identical.
- [ ] **Step 4: Run** `bunx jest --maxWorkers=2 tests/ui`. Expected: PASS (existing UI tests unchanged).
- [ ] **Step 5: Commit** `feat(ui): add the air freshener icons and accent, busy and tone props`.

### Task 0.3: Copy the protocol, errors, time and BLE interface; add the device model

**Files:**
- Create (copy from AR): `src/aer/protocol/{cbor,messages,replies,schedule,status,uuids,index}.ts` ← `src/protocol/*`; `src/aer/errors.ts` ← `src/device/errors.ts`; `src/aer/time.ts` ← `src/device/time.ts`; `src/transport/ble/transport.ts`, `src/transport/ble/base64.ts` ← `src/ble/*`; `docs/protocol/aer-ble-protocol.md` ← `docs/protocol/aer-ble-protocol.md`
- Test (copy): `tests/aer/protocol/*.test.ts` ← `tests/protocol/*`; `tests/aer/time.test.ts` ← `tests/device/time.test.ts`; `tests/transport/ble/base64.test.ts` ← `tests/ble/base64.test.ts`; new `tests/aer/errors.test.ts`
- Modify: `src/core/model.ts`, `src/i18n/en/device.ts` (`linkBluetooth` only), `src/screens/device/DeviceSheet.tsx` (`LINK_LABEL` only), `src/screens/home/DeviceCard.tsx` (`TILE` only), `jest.config.js` (coverage gate list gains `'aer'`), `tests/core/model.test.ts`, `tests/device/hub.test.ts`

**Interfaces:**
- Produces in `src/core/model.ts`: `DeviceKind = 'tv' | 'ac' | 'fan' | 'aer'`; `LinkKind` gains `'aer'`; `Link` gains `{ kind: 'aer'; bleId: string; timeZone: string; channels?: AerChannels }`; `export interface AerChannels { reply: string; command: string; schedule: string }`. `src/aer/protocol/uuids.ts` keeps `Channels` as `export type Channels = AerChannels` (imported from `@/core`).
- Produces in `src/aer/errors.ts`: `AER_ERROR_CODES` = AR's list plus `'busy'`; `AerErrorCode`; `class AerError extends Error { readonly code: AerErrorCode }`; and
  `export type AerProblem = 'btoff' | 'denied' | 'away' | 'busy' | 'flat' | 'notAer' | 'scheduleRunning' | 'timeZone' | 'failed';`
  `export function aerProblem(e: unknown): AerProblem` — `bluetoothOff`→btoff, `permissionDenied`→denied, `unreachable`/`noReply`/`disconnected`→away, `busy`→busy, `batteryTooLow` or `rejected` with message `'batteryTooLow'`→flat, `notDispenser`→notAer, `rejected` with message `'scheduleRunning'`→scheduleRunning, `timeZone`→timeZone, anything else→failed.
- Produces: `DeviceStatus`, `Schedule`, `Interval`, `Weekday`, `TimeOfDay`, `MAX_SCHEDULES`, `sprayCount`, `validateSchedule`, `nextSprayToday`, `runsToday`, `batteryPercent`, `refillPercent`, `isBatteryTooLow`, `REFILL_SPRAYS` exactly as AR; `zoneInfo`, `wallClock`, `fromWallClock` from `src/aer/time.ts`; `BleTransport`, `BleConnection`, `FoundDevice`, `AdapterState` from `src/transport/ble/transport.ts`.

- [ ] **Step 1: Copy the tests** with imports changed (`@/protocol/` → `@/aer/protocol/`, `@/device/time` → `@/aer/time`, `@/ble/base64` → `@/transport/ble/base64`). Add `tests/aer/errors.test.ts`: `it.each` over the mapping above, e.g. `expect(aerProblem(new AerError('rejected', 'batteryTooLow'))).toBe('flat')`, `expect(aerProblem(new AerError('busy'))).toBe('busy')`, `expect(aerProblem(new Error('x'))).toBe('failed')`. In `tests/core/model.test.ts`: `it('accepts an aer device with an aer link')` (type-level: a `Device` with `kind: 'aer'`, `links: [{ kind: 'aer', bleId: 'AA:BB', timeZone: 'Asia/Kolkata' }]` compiles and round-trips through `createMemoryStore`). In `tests/device/hub.test.ts`: `it('leaves an aer device inert')` — `hub.setDevices([aerDevice]); expect(hub.view(id).usable).toBe(false); await expect(hub.send(id, { kind: 'tv.powerOn' })).rejects.toMatchObject({ code: 'noLink' })`.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/aer tests/transport/ble tests/core tests/device`. Expected: FAIL (modules missing).
- [ ] **Step 3: Copy the sources** with the header line; rename `DeviceError`→`AerError`; add `'busy'` and `aerProblem`; add the model types; `LINK_LABEL.aer = 'device.linkBluetooth'` (with `linkBluetooth: 'Bluetooth'` added to `src/i18n/en/device.ts` in this task) and `TILE.aer = 'aer'`; coverage gate `'aer'`.
- [ ] **Step 4: Run** the Step 2 command, then `bunx tsc --noEmit && bunx eslint src/aer src/transport/ble src/core --max-warnings=0`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(aer): copy the Smart Matic protocol and add the aer device kind`.

### Task 0.4: Contracts, fakes, services fields, shared screen helpers, routes and alert copy

**Files:**
- Create: `src/aer/types.ts`, `src/aer/alerts/types.ts`, `src/aer/testing/memoryDispenserStore.ts` (copy of AR `src/store/memoryStore.ts`), `src/aer/testing/fakeAerService.ts`, `src/aer/testing/fakeAlerts.ts`, `src/services/aerOff.ts`, `src/screens/aer/useAerView.ts`, `src/screens/aer/format.ts`, `src/i18n/en/aerAlerts.ts`
- Create (route stubs, each renders `<PlaceholderRemote id={id} />`): `app/add/aer.tsx`, `app/aer/schedule/[id].tsx`, `app/aer/zone/[id].tsx`
- Modify: `src/services/services.tsx`, `src/services/index.ts`, `src/services/createServices.ts`, `src/i18n/index.ts`, `tests/i18n.test.ts`, `tests/screens/helpers.tsx`
- Test: `tests/aer/fakes.test.ts`, `tests/screens/aer/format.test.ts`, `tests/services/aerRemove.test.ts`

**Interfaces (Produces):**

```ts
// src/aer/types.ts
export interface SavedDispenser {            // AR's, keyed by the One Remote device id
  id: string; bleId: string; name: string; homeTimeZone: string; channels?: Channels;
  clockSet?: boolean; lastStatus?: DeviceStatus & { at: string }; schedules?: { list: Schedule[]; at: string };
}
export interface DispenserStore { list(); get(id); upsert(d); remove(id); subscribe(cb): () => void } // AR's signatures
export interface AerView { deviceId: string; status?: DeviceStatus & { at: string }; schedules?: { list: Schedule[]; at: string }; clockSet?: boolean }
export interface FoundAer { bleId: string; name: string | null; rssi: number | null }
export interface AerService {
  /** false on Android below 12 (API 31). */
  supported(): boolean;
  /** The cached reading, synchronously ({ deviceId } before the first read). */
  view(deviceId: string): AerView;
  subscribe(deviceId: string, cb: (v: AerView) => void): Unsubscribe;
  /** Lists nearby devices, first found first, once each, without those already added. */
  scan(onFound: (d: FoundAer) => void, timeoutMs: number): { stop(): void; done: Promise<void> };
  /** For a dispenser not added yet pass `target`; the session is keyed by the future device id. */
  blink(deviceId: string, target?: { bleId: string; timeZone: string }): Promise<void>;
  /** Connects, sets the clock, reads, and only then writes `device` (kind 'aer', one aer link) to the home store. */
  add(device: Device): Promise<void>;
  refresh(deviceId: string): Promise<AerView>;
  sprayNow(deviceId: string): Promise<DeviceStatus>;
  setAutoSpray(deviceId: string, interval: Interval | null): Promise<DeviceStatus>;
  resetRefill(deviceId: string): Promise<DeviceStatus>;
  /** Replace-all save, then read-back; resolves with what the dispenser holds. */
  saveSchedules(deviceId: string, list: Schedule[]): Promise<Schedule[]>;
  setTimeZone(deviceId: string, zone: string): Promise<void>;
  /** Closes its session and drops its cache (the home store removal is the caller's). */
  forget(deviceId: string): Promise<void>;
  closeAll(): Promise<void>;
}
// src/aer/alerts/types.ts  (AR's scheduler.ts types plus the Alerts interface, adapted)
export type AlertGroup = 'refill' | 'battery' | 'checkIn';
export type AlertSwitches = Record<AlertGroup, boolean>;
export type AlertPermission = 'granted' | 'denied' | 'undetermined';
export interface ScheduledAlert { key: string; dispenserId: string; at: Date; title: string; body: string }
export interface AlertScheduler { /* AR's, unchanged */ }
export interface Alerts {
  start(): () => void; sync(opts: { mayAsk: boolean }): Promise<void>;
  switches(): Promise<AlertSwitches>; setSwitch(group: AlertGroup, on: boolean): Promise<void>;
  permission(): Promise<AlertPermission>; pendingKeys(): Promise<string[]>;
  /** The tapped alert's device id, or null when that device is gone. */
  onOpen(cb: (deviceId: string | null) => void): () => void;
}
```

- `createMemoryDispenserStore(): DispenserStore` (AR's memory store, `SavedDispenser` with `bleId`).
- `createFakeAerService(opts?: { supported?: boolean; found?: FoundAer[]; views?: Record<string, AerView>; home?: HomeStore }): FakeAerService` where `FakeAerService = AerService & { calls: { op: AerOp; deviceId?: string; arg?: unknown }[]; failNext(op: AerOp, e: AerError): void; hold(op: AerOp): { release(): void }; setView(v: AerView): void }` and `AerOp = 'scan' | 'blink' | 'add' | 'refresh' | 'sprayNow' | 'setAutoSpray' | 'resetRefill' | 'saveSchedules' | 'setTimeZone' | 'forget'`. Its `add` writes the device to `opts.home` when given; its `saveSchedules` returns the list it was given unless `setView` set other schedules.
- `createFakeAlerts(opts?: { permission?: AlertPermission; switches?: Partial<AlertSwitches> }): Alerts & { opened(id: string | null): void }`.
- `createAerOff(): { aer: AerService; aerAlerts: Alerts }` — the placeholder Wave 2 replaces: `supported()` false, every operation rejects `new AerError('bluetoothOff')`, alerts do nothing.
- `Services` gains `// aer lane` slot with `aer: AerService; aerAlerts: Alerts`. `createServices` uses `deps.aer ?? off.aer`, `deps.aerAlerts ?? off.aerAlerts`. `removeDeviceWith` gains `aer`: for each `link.kind === 'aer'`, `bestEffort('forget an air freshener', () => aer.forget(device.id))`.
- `@/services` re-exports: types `AerService`, `AerView`, `FoundAer`, `Alerts as AerAlerts`, `AlertGroup`, `AlertSwitches`, `AlertPermission`, `AerProblem`, `DeviceStatus as AerStatus`, `Schedule as AerSchedule`, `Interval as AerInterval`, `Weekday`, `TimeOfDay`; values `AerError`, `aerProblem`, `MAX_SCHEDULES`, `sprayCount`, `validateSchedule`, `nextSprayToday`, `runsToday`, `batteryPercent`, `refillPercent`, `isBatteryTooLow`, `zoneInfo`.
- `useAerView(deviceId: string): AerView` (subscribes to `aer`, re-renders on change).
- `src/screens/aer/format.ts`: `formatWhen(iso: string, now: Date): string` (AR's buckets with keys `aer.whenNow|whenMinutes|whenHours|whenDays`); `formatTime(t: TimeOfDay): string` → `'6:00 pm'` (12-hour, lowercase, mock `tFull`); `formatTimeParts(t): { hm: '6:00'; ap: 'pm' }`; `daysLabel(days: Weekday[]): string` (`aer.everyDay`, `aer.weekdays`, `aer.weekends`, else short names joined by `', '`); `zoneLabel(zone: string): string` (`'Asia/Kolkata'` → `'India · Kolkata'` from a `ZONE_COUNTRY` map of AR `zones.ts`'s 16 `FALLBACK` zones; others → `'<Area> · <City>'`, `_` → space); `offsetLabel(zone: string, at: Date): string` (`zoneInfo` standard offset → `'UTC+5:30'`, `'UTC+0'`, `'UTC-5'`); `formatNextSpray(view: AerView, timeZone: string, now: Date): string` (the card's first line when fresh: `nextSprayToday` → `aer.nextSpray`; else auto spray on → `aer.autoCard`; else `runsToday` → `aer.doneToday`; else `aer.noScheduleToday`); `AER_FRESH_MS = 3_600_000`.
- `src/i18n/en/aerAlerts.ts`: AR's `src/i18n/en/alerts.ts` verbatim except `checkIn: "It's been a while. Open One Remote to check {name}."` and `channel: 'Air freshener alerts'`.

- [ ] **Step 1: Write the failing tests.** `tests/aer/fakes.test.ts`: `it('fake service records calls and fails on demand')` (`failNext('sprayNow', new AerError('unreachable'))` → `sprayNow('d1')` rejects with code `unreachable`, then the next call resolves); `it('fake add writes the device to the home store')`; `it('held operations stay pending until released')`. `tests/screens/aer/format.test.ts`: `formatTime({h:18,m:0})` is `'6:00 pm'`, `formatTime({h:0,m:5})` is `'12:05 am'`; `daysLabel(['mon','tue','wed','thu','fri'])` is `'Weekdays'`, `daysLabel(['mon','wed'])` is `'Mon, Wed'`; `zoneLabel('Asia/Kolkata')` is `'India · Kolkata'`, `zoneLabel('America/Argentina/Buenos_Aires')` is `'America · Buenos Aires'`; `offsetLabel('Asia/Kolkata', new Date('2026-11-04T00:00:00Z'))` is `'UTC+5:30'`; `it('formatNextSpray uses the home zone')`: a schedule 18:00-22:00 every 40 min, every day, `now = 2026-11-04T12:00:00Z`, home `Asia/Kolkata` (17:30 there) gives `'Next spray 6:00 pm'` while the same view with home `Europe/London` (12:00) gives `'Next spray 6:00 pm'` too and with home `Asia/Tokyo` (21:00) gives `'Next spray 9:20 pm'`. `tests/services/aerRemove.test.ts`: `removeDevice` of an aer device calls `aer.forget(id)` once and removes it from the store; a rejecting `forget` is logged and the device stays removed. `tests/i18n.test.ts` gains `aerAlerts` in `NAMESPACES`.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/aer/fakes.test.ts tests/screens/aer tests/services/aerRemove.test.ts tests/i18n.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the types, fakes, `aerOff`, services fields and re-exports, `useAerView`, `format.ts`, `aerAlerts.ts` (registered in `src/i18n/index.ts`), the three route stubs, and `makeServices(drivers = [], extra: Partial<Services> = {})` in `tests/screens/helpers.tsx` defaulting `aer: createFakeAerService({ home })` (sharing the memory home store) and `aerAlerts: createFakeAlerts()`.
- [ ] **Step 4: Run** the Step 2 command, then the full `bunx jest --maxWorkers=2`, `bunx tsc --noEmit`, `bunx eslint . --max-warnings=0`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(aer): add the aer service contract, its fakes and the shared formatters`.

### Task 0.5: Screen copy and the mock gaps

**Files:**
- Create: `src/i18n/en/aer.ts`
- Modify: `src/i18n/index.ts`, `src/i18n/en/add.ts`, `src/i18n/en/device.ts`, `src/i18n/en/settings.ts`, `tests/i18n.test.ts`, `tests/screens/settings.test.tsx` and `tests/screens/kindPicker.test.tsx` (only where they assert the changed `privacyHint`, `privacyBody` or `hint` text)
- Modify: `docs/design/one-remote-mockup.html` (the gaps below, in place)

**Interfaces:**
- Produces: every key below; Wave 1 uses them by these names.

`src/i18n/en/aer.ts` (exact copy; the words come from the mock, the marked ones are the gaps this task also draws):

```ts
export default {
  // home card
  nextSpray: 'Next spray {time}', autoCard: 'Auto spray every {minutes} min' /*gap*/,
  doneToday: 'Done for today' /*gap*/, noScheduleToday: 'No schedule today' /*gap*/,
  notRead: 'Not read yet' /*gap*/, lastRead: 'Last read {when}', readNow: 'Read just now',
  cardFlat: 'Batteries flat. Replace them.', cardLow: 'Refill almost out',
  levels: 'Battery {battery}% · Refill {refill}%', sprayLabel: 'Spray {name}', sprayed: 'Sprayed',
  whenNow: 'just now', whenMinutes: '{n} min ago', whenHours: '{n} h ago', whenDays: '{n} d ago',
  // dispenser screen: bar subtitles
  subSpraying: 'Spraying…', subConnecting: 'Connecting…', subBtOff: 'Bluetooth is off',
  subAway: "Can't reach it", subBusy: 'Another phone is connected', subFlat: 'Batteries flat',
  subDenied: 'Bluetooth not allowed' /*gap*/,
  // problems (banners and error lines)
  probBtOff: 'Bluetooth is off. Turn it on, then try again.',
  probAway: "Can't reach it. Move closer and try again.",
  probBusy: 'Another phone or the Godrej app is connected to it. Close that app, then try again.',
  probFlat: "The batteries are flat, so it can't spray. Replace them, then try again.",
  probDenied: "One Remote isn't allowed to use Bluetooth. Allow Nearby devices in your phone's settings, then try again." /*gap*/,
  probNotAer: "That isn't a Smart Matic. Pick another one from the list.",
  probScheduleRunning: 'A schedule is running, so the dispenser kept auto spray off. Try again after it ends.' /*gap*/,
  probTimeZone: "This time zone isn't valid. Pick it again." /*gap*/,
  probFailed: 'Something went wrong. Try again.' /*gap*/,
  lowBanner: 'Refill almost out. Put in a new can, then tap I refilled it in Device settings.',
  openSettings: 'Open Settings', tryAgain: 'Try again',
  // spray, auto spray, status
  sprayNow: 'Spray now', spraying: 'Spraying…', autoSpray: 'Auto spray',
  autoEvery: 'Every {minutes} minutes', autoOff: 'Off', intervalChip: '{minutes} min',
  autoNote: 'When a schedule starts, auto spray turns off until you turn it on again.',
  status: 'Status', battery: 'Battery', refill: 'Refill left', percent: '{n}%',
  firmwareLine: 'Firmware {version} · {read}',
  // schedules list
  schedules: 'Schedules', scheduleCount: '{n} of {max}', noSchedules: 'No schedules yet.',
  addSchedule: 'Add schedule', scheduleFull: 'A dispenser holds up to {max} schedules. Delete one first.',
  scheduleWindow: '{start} to {end}', scheduleLine: '{days} · every {minutes} min · {sprays} sprays',
  everyDay: 'Every day', weekdays: 'Weekdays', weekends: 'Weekends',
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
  monFull: 'Monday', tueFull: 'Tuesday', wedFull: 'Wednesday', thuFull: 'Thursday',
  friFull: 'Friday', satFull: 'Saturday', sunFull: 'Sunday',
  rounded: 'The dispenser rounded the end time to {time}.',
  // schedule editor
  titleNew: 'New schedule', titleEdit: 'Edit schedule', start: 'Start', end: 'End',
  timeLabel: '{label} time, {time}', days: 'Days', sprayEvery: 'Spray every',
  estimate: 'About {count} sprays a day',
  endBeforeStart: 'The end time must be after the start time.', noDays: 'Pick at least one day.',
  tooShort: 'The window is shorter than one interval. Make it longer.',
  tooManySprays: 'That is too many sprays for one window. Use a longer interval.',
  stepSaving: 'Saving to the dispenser', stepReading: 'Reading it back',
  notKept: "The dispenser didn't keep this schedule. Try saving again.",
  saveSchedule: 'Save schedule', deleteSchedule: 'Delete schedule',
  deleteTitle: 'Delete this schedule?', deleteBody: 'It comes off the dispenser too.',
  yesDelete: 'Yes, delete', cancel: 'Cancel', saved: 'Saved', deleted: 'Schedule deleted',
  // link line
  linkReady: "Bluetooth · close by · how it's connected", linkOff: "Bluetooth is off · how it's connected",
  linkAway: "Bluetooth · out of range · how it's connected",
  linkBusy: "Bluetooth · in use by another phone · how it's connected",
  // add flow
  btOffTitle: 'Bluetooth is off',
  btOffBody: 'The air freshener is found and controlled over Bluetooth. Turn it on, then try again.',
  deniedTitle: 'Bluetooth not allowed' /*gap*/,
  deniedBody: "Allow Nearby devices for One Remote in your phone's settings, then try again." /*gap*/,
  lookingTitle: 'Looking nearby',
  lookingBody: 'Switch the air freshener on and keep the phone close. Close the Godrej app first.',
  looking: 'Looking for nearby devices…', stillLooking: 'Still looking…',
  nothingYet: 'Nothing yet? Move closer, close the Godrej app, and check the batteries.',
  lookAgain: 'Look again', unnamed: 'Unnamed device',
  signalClose: 'Very close', signalNear: 'Nearby', signalFar: 'Far away',
  checkTitle: 'Check your air freshener', blinking: 'Blinking its light…',
  askTitle: 'Is this the one that blinked?', askBody: 'Its light is blinking now. Look at the air freshener.',
  yesThatOne: 'Yes, that one', blinkAgain: 'Blink again', blinkToast: 'Blinking its light',
  noChooseAnother: 'No, choose another', notAerTitle: "That isn't a Smart Matic",
  notAerBody: 'Pick another one from the list.', notAerLabel: 'Not a Smart Matic',
  chooseAnother: 'Choose another', defaultName: 'Air freshener', next: 'Next',
  nameStep: 'Then its time zone',
  zoneTitle: 'Home time zone', zoneStep: 'Last step',
  zoneBody: 'The air freshener runs its schedules on this clock. The app sets it each time it connects.',
  zoneSearch: 'Search time zones', zonePlaceholder: 'City or country', thisPhone: 'This phone',
  done: 'Done', save: 'Save', zoneFailed: "Couldn't add it. {problem}" /*gap*/,
  // device sheet
  refilled: 'I refilled it', refilledSub: 'Refill left is {refill}%. Tap after putting in a new can.',
  findIt: 'Find it', findSub: 'Blinks its light', zoneRow: 'Home time zone', zoneSub: '{zone} ({offset})',
  linkSub: 'It takes one phone at a time, so the app lets go a few seconds after each action.',
  refillTitle: 'Put in a new can?', refillBody: 'Refill left goes back to 100%. Do this only after a new can is in.',
  refillYes: 'Yes, I refilled it', refillDone: 'Refill set to 100%',
  removeBody: 'The app forgets it. The air freshener keeps its schedules and keeps spraying.',
} as const;
```

Other files: `add.ts`: `kindAer: 'Air freshener'`, `needsAndroid12: 'Needs Android 12'` (gap), `hint: 'Next you pick the brand, or for an air freshener, find it nearby. The app finds out how to talk to it.'`. `device.ts`: nothing (`linkBluetooth` came in 0.3). `settings.ts`: `privacyHint: 'Home network and Bluetooth only'`, `privacyBody: 'One Remote talks only to devices on your home network, and to the air freshener over Bluetooth in the room. It has no account, no ads and no analytics, and nothing is sent to a server.'`, `alerts: 'Alerts'`, `alertRefill: 'Refill running low'`, `alertRefillSub: 'Almost out and out, estimated from the sprays'`, `alertBattery: 'Batteries low'`, `alertBatterySub: 'Low and flat, from the last reading'`, `alertCheckIn: 'Check-in reminder'`, `alertCheckInSub: 'After 14 days without a reading'`, `notificationsOff: "Notifications are off for One Remote in your phone's settings."`, `openSettings: 'Open Settings'`.

Mock gaps to draw (in place, in the existing `aerF` figures' style, each with `newcopy: true`): (1) `S.addKind({ oldAndroid: true })`: the Air freshener card dimmed and disabled with the subtitle "Needs Android 12"; (2) `S.addAer({ state: 'denied' })`: the btoff layout with `deniedTitle`/`deniedBody`, Open Settings and Try again; (3) `S.aer({ state: 'denied' })`: the problem banner `probDenied` with Open Settings and Try again, link line as btoff; (4) `AerCard` states `notread` ("Not read yet"), `done` ("Done for today") and `auto` ("Auto spray every 20 min"); (5) `S.aer()` with the `probScheduleRunning` toast; (6) `S.addAerZone({ failed: 1 })`: an error line `zoneFailed` with `probAway` above Done. Add each to the Screen index.

- [ ] **Step 1: Write the failing test.** `tests/i18n.test.ts` gains `aer` in `NAMESPACES` (its existing checks then require every `t('aer.…')` used in `src` to exist and every `{var}` to be passed); add `it('has the mock words for the aer')`: `expect(t('aer.sprayNow')).toBe('Spray now')`, `expect(t('add.needsAndroid12')).toBe('Needs Android 12')`, `expect(t('settings.privacyHint')).toBe('Home network and Bluetooth only')`.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/i18n.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write** the copy, register `aer`, update the two tests that assert the old hint/privacy text, and draw the mock gaps.
- [ ] **Step 4: Run** the full `bunx jest --maxWorkers=2` and open the mock in the browser pane: every new figure renders in light and dark with no console error. Expected: PASS.
- [ ] **Step 5: Commit** `docs(aer): add the air freshener copy and draw the states the mock lacked`.

---

## Wave 1, Lane A: the aer backend (`lane/aer-a`)

### Task A.1: Copy the fake dispenser

**Files:**
- Create: `src/aer/testing/fakeDispenser.ts` ← AR `src/ble/testing/fakeDispenser.ts`
- Test: `tests/aer/fakeDispenser.test.ts` ← AR `tests/ble/fakeDispenser.test.ts`

**Interfaces:**
- Consumes: `BleTransport` (0.3), protocol (0.3).
- Produces: `createFakeTransport(devices: Record<string, FakeDispenserOptions>, opts?): FakeTransport` as AR, plus `FakeDispenserOptions.refuses?: boolean` — `connect()` rejects with `new AerError('busy')` (the stack refused the link, as when another phone holds it).

- [ ] **Step 1: Copy the test** (imports only) and add `it('refuses a connect with busy')`: `await expect(t.connect('d1', 1000)).rejects.toMatchObject({ code: 'busy' })` for `{ d1: { refuses: true } }`.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/aer/fakeDispenser.test.ts`. Expected: FAIL.
- [ ] **Step 3: Copy the source** and add `refuses`.
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `test(aer): copy the simulated Smart Matic`.

### Task A.2: Copy the session and client

**Files:**
- Create: `src/aer/session.ts` ← AR `src/device/session.ts`; `src/aer/client.ts` ← AR `src/device/client.ts`
- Test: `tests/aer/session.test.ts`, `tests/aer/client.test.ts` ← AR `tests/device/*`

**Interfaces:**
- Consumes: `createFakeTransport` (A.1), `SavedDispenser`, `DispenserStore`, `createMemoryDispenserStore` (0.4).
- Produces: `class DispenserClient` with AR's public methods and signatures, except `blink(id: string, target?: { bleId: string; homeTimeZone: string }): Promise<void>` (AR: `homeTimeZone?: string`) and `add(id: string, name: string, homeTimeZone: string, bleId: string): Promise<SavedDispenser>`. Sessions open on `known.bleId`; the store key stays `id`. `openSession`, `checkAdapter`, `SessionOptions`, `ClientOptions` as AR. `connectWithRetries` throws `AerError('busy')` when every attempt was rejected with `busy`, else `unreachable` as AR.

- [ ] **Step 1: Copy the tests**, changing only: imports; `DeviceError`→`AerError`; every `SavedDispenser` fixture gains `bleId` equal to the fake device id used for it; `blink(id, zone)` → `blink(id, { bleId: id, homeTimeZone: zone })`; `add(id, name, zone)` → `add(id, name, zone, id)`. Add: `it('opens the session on bleId, not on the store key')` (store record `{ id: 'dev-1', bleId: 'AA:01', … }`, fake device `'AA:01'`: `refresh('dev-1')` resolves and `t.state('AA:01').time` is set); `it('reports busy when every connect is refused')` (`refuses: true` → `sprayNow` rejects with code `busy`); AR's `'reports unreachable after 3 attempts when busy'` stays as it is (the plain `busy` fake option still means unreachable).
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/aer/session.test.ts tests/aer/client.test.ts`. Expected: FAIL.
- [ ] **Step 3: Copy the sources** with the adaptations above.
- [ ] **Step 4: Run** them again. Expected: PASS, every copied case included.
- [ ] **Step 5: Commit** `feat(aer): copy the dispenser session and client`.

### Task A.3: The aer store (cache + `DispenserStore` over the home store)

**Files:**
- Create: `src/aer/store.ts`
- Test: `tests/aer/store.test.ts`

**Interfaces:**
- Consumes: `HomeStore`, `AsyncStorageLike` (`@/store/types`), `SavedDispenser`, `DispenserStore`, `AerView` (0.4).
- Produces:

```ts
export const AER_CACHE_KEY = 'one-remote/aer/v1'; // JSON Record<deviceId, Omit<AerView, 'deviceId'>>
export interface AerStore extends DispenserStore {
  load(): Promise<void>;                       // reads the cache once; corrupt or missing → {}
  view(deviceId: string): AerView;             // synchronous after load
  watch(deviceId: string, cb: (v: AerView) => void): Unsubscribe;
  stage(device: Device): void;                 // add(): upsert() of this id creates the home device
  unstage(deviceId: string): void;
  dropCache(deviceId: string): Promise<void>;
  bleIds(): Promise<Set<string>>;              // aer links already in the home store
}
export function createAerStore(deps: { home: HomeStore; storage: AsyncStorageLike }): AerStore;
```

`get(id)`/`list()` build `SavedDispenser` from each `kind: 'aer'` device and its aer link (`bleId`, `homeTimeZone: link.timeZone`, `channels`) plus the cache. `upsert(d)`: writes `clockSet`, `lastStatus`, `schedules` to the cache; writes `name`, `timeZone`, `channels` to the home device only when one of them changed; for a staged id, upserts the staged device with its link merged; for an unknown, unstaged id does nothing. `remove(id)` removes the home device and the cache entry. `subscribe` fires on home changes and cache writes. Cache writes are serialised (one key, read-modify-write, as `asyncStorageStore`).

- [ ] **Step 1: Write the failing tests:** `it('builds a SavedDispenser from the device, its link and the cache')`; `it('keeps reads, writes the cache, and leaves the home store alone when nothing in it changed')` (a home `subscribe` spy is not called for a status-only upsert); `it('writes a renamed dispenser and a new zone back to the device')`; `it('creates a staged device on its first upsert, and nothing for an unknown id')`; `it('corrupt cache reads as empty')` (`storage.getItem` returns `'{oops'` → `load()` resolves, `view('d1')` is `{ deviceId: 'd1' }`, `console.warn` once, and the next upsert writes valid JSON); `it('lists only aer devices')`; `it('bleIds lists every added dispenser')`.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/aer/store.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `createAerStore`.
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(aer): keep the dispenser readings next to the home store`.

### Task A.4: `AerService`

**Files:**
- Create: `src/aer/service.ts`
- Test: `tests/aer/service.test.ts`

**Interfaces:**
- Consumes: `DispenserClient` (A.2), `createAerStore` (A.3), `AerService` (0.4).
- Produces: `export function createAer(deps: { transport: BleTransport; home: HomeStore; storage: AsyncStorageLike; supported: boolean; client?: ClientOptions; now?: () => Date }): { service: AerService; dispenserStore: DispenserStore }` (Wave 2 hands `dispenserStore` to the alerts engine).
  - `scan` calls `client.scan`, skips `bleIds()` and ids already reported, maps `FoundDevice` → `FoundAer`.
  - `blink(id, target)` → `client.blink(id, target && { bleId: target.bleId, homeTimeZone: target.timeZone })`.
  - `add(device)`: `stage(device)`, then `client.add(device.id, device.name, link.timeZone, link.bleId)`; `unstage` in `finally`; rethrows the client's `AerError`.
  - `refresh` returns the store's `view` after `client.refresh`; `setTimeZone` → `client.setHomeTimeZone`; `forget(id)` → `client.remove(id)` then `dropCache(id)`; the rest pass through. `supported()` returns `deps.supported`.

- [ ] **Step 1: Write the failing tests** (fake transport + memory home store + memory storage): `it('adds a dispenser only after it answered')` (`refuses: true` → `add` rejects `busy` and `home.devices()` is empty; then a working fake → the device is saved with `links[0].channels` set and `view(id).status` present); `it('scan hides added dispensers and repeats')` (fake devices `AA:01`, `AA:02`; `AA:01` already linked; a fake scan reporting `AA:02` twice → `onFound` called once with `{ bleId: 'AA:02', name: 'Smart Matic', rssi: -60 }`); `it('setTimeZone writes the link and reconnects')` (after `refresh`, `setTimeZone(id, 'Asia/Tokyo')` → the home link's `timeZone` is `'Asia/Tokyo'` and the next `refresh` sends a set-time with tokyo's `tz`); `it('forget drops the cache and closes the session')`; `it('blink before adding stores nothing')`.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/aer/service.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `createAer`.
- [ ] **Step 4: Run** `bunx jest --maxWorkers=2 tests/aer`. Expected: PASS; `bunx jest --maxWorkers=2 --coverage tests/aer` keeps `src/aer` at 80% lines or more.
- [ ] **Step 5: Commit** `feat(aer): add the aer service over the copied client`.

## Wave 1, Lane B: alerts (`lane/aer-b`)

### Task B.1: Copy the alert plan, state and engine, with one switch per group

**Files:**
- Create: `src/aer/alerts/{plan,state,engine,index}.ts` ← AR `src/alerts/*`; `src/aer/alerts/testing/fakeScheduler.ts` ← AR `src/alerts/testing/fakeScheduler.ts`
- Test: `tests/aer/alerts/{plan,state,engine}.test.ts` ← AR `tests/alerts/*`

**Interfaces:**
- Consumes: `Alerts`, `AlertScheduler`, `AlertGroup`, `AlertSwitches` (0.4), `createMemoryDispenserStore` (0.4).
- Produces: `createAlerts(deps: AlertsDeps): Alerts`; `createAlertStateStore(storage: AsyncStorageLike): AlertStateStore` with keys `'one-remote/aer-alerts/v1'`, `'one-remote/aer-alerts/switches'`, `'one-remote/aer-alerts/asked'`; `AlertStateStore.enabled()`→`switches(): Promise<AlertSwitches>` (missing or unreadable → all `true`) and `setEnabled(on)`→`setSwitch(group, on)`; `groupOf(kind: AlertKind): AlertGroup` (`refillLow|refillOut`→refill, `batteryLow|batteryFlat`→battery, `checkIn`→checkIn). Engine: plans skip kinds whose group is off, so their pending alerts are cancelled by the existing not-planned path; all three off behaves as AR's `setEnabled(false)` (cancel all, forget unfired); `setSwitch(g, true)` syncs with `'always'`. Titles and bodies use `t('aerAlerts.<kind>Title')` / `t('aerAlerts.<kind>', { name })`.

- [ ] **Step 1: Copy the tests**, changing only imports, `DeviceError`→`AerError`, the `bleId` on fixtures, the `alerts.` → `aerAlerts.` copy keys, `enabled()` → `switches()` (expecting `{ refill: true, battery: true, checkIn: true }` where AR expected `true`), and `setEnabled(false|true)` → setting all three groups. Add: `it('a group switched off cancels only its alerts')` (refill and check-in pending; `setSwitch('refill', false)` → `pendingKeys()` is `['d1:checkIn']`); `it('switching a group back on asks for permission if the phone allows')`; `it('stores the switches')` (state round-trip; `'{bad'` reads as all on).
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/aer/alerts`. Expected: FAIL.
- [ ] **Step 3: Copy the sources** and add the group switches.
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(aer): copy the refill and battery alerts with a switch per group`.

### Task B.2: The expo-notifications scheduler

**Files:**
- Create: `src/services/aerAlerts.ts` ← AR `src/alerts/expoScheduler.ts`
- Test: `tests/services/aerAlerts.test.ts` ← AR `tests/alerts/expoScheduler.test.ts`

**Interfaces:**
- Produces: `createExpoScheduler(): AlertScheduler` as AR (channel id `'aer-alerts'`, name `t('aerAlerts.channel')`; `pendingKeys` keeps identifiers containing `':'`; data key `dispenserId` holds the device id).

- [ ] **Step 1: Copy the test** (imports and the channel id only) and add `it('never asks for a push token')`: after scheduling, `expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled()`.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/services/aerAlerts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Copy the source.**
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(aer): schedule the alerts as local notifications`.

## Wave 1, Lane C: native (`lane/aer-c`)

### Task C.1: The react-native-ble-plx transport

**Files:**
- Create: `src/transport/ble/rnTransport.ts` ← AR `src/ble/rnTransport.ts`
- Test: `tests/transport/ble/rnTransport.test.ts` ← AR `tests/ble/rnTransport.test.ts`

**Interfaces:**
- Produces: `createRnTransport(createManager?): BleTransport` as AR; `bleSupported(platform?: { OS: string; Version: number | string }): boolean` (iOS `true`; Android `Version >= 31`); `androidPermissionsFor(api: number)` returns `[BLUETOOTH_SCAN, BLUETOOTH_CONNECT]` for 31+ and `[]` below; `requestPermissions()` and `adapterState()` on Android below 31 return `false` and `'unsupported'` without prompting; `connect` maps a ble-plx `DeviceConnectionFailed` raised before the timeout to `AerError('busy')`, other failures unchanged.

- [ ] **Step 1: Copy the test** (imports, `AerError`) and change AR's `'asks Android 11 for precise location'` to `it('asks Android 11 for nothing: the aer needs Android 12')`: `expect(androidPermissionsFor(30)).toEqual([])`; add `it('never asks for location')` (no result of `androidPermissionsFor(n)` for n in 23..36 contains `ACCESS_FINE_LOCATION` or `ACCESS_COARSE_LOCATION`); `it('bleSupported')` (`{OS:'android',Version:30}` false, `31` true, `{OS:'ios',Version:'17.0'}` true); `it('maps a refused connect to busy')`.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/transport/ble`. Expected: FAIL.
- [ ] **Step 3: Copy the source** with the adaptations.
- [ ] **Step 4: Run** it again, then `bunx eslint src/transport/ble --max-warnings=0`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(transport): add the Bluetooth transport for the aer`.

### Task C.2: Config plugins and app.json

**Files:**
- Create: `plugins/withNoPush.js` (AR `withNoPushEntitlement.js`'s iOS part, plus Android), `plugins/withNoLocation.js`
- Modify: `app.json`
- Test: `tests/plugins/withNoPush.test.ts`, `tests/plugins/withNoLocation.test.ts`, `tests/plugins/aerConfig.test.ts`

**Interfaces:**
- Produces: `withNoPush` exports `removePushEntitlement(entitlements)` (drops `aps-environment`) and `removeFirebaseMessaging(manifest)` (adds `tools:node="remove"` for service `expo.modules.notifications.service.ExpoFirebaseMessagingService`, service `com.google.firebase.messaging.FirebaseMessagingService`, receiver `com.google.firebase.iid.FirebaseInstanceIdReceiver`, permission `com.google.android.c2dm.permission.RECEIVE`; idempotent; throws `'withNoPush'` without `<application>`). `withNoLocation` exports `removeLocation(manifest)`: deletes `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` from `uses-permission-sdk-23` and `uses-permission`, then adds `tools:node="remove"` entries for both in each list. `app.json`: plugins `"./plugins/withNoPush.js"`, `"./plugins/withNoLocation.js"` listed **before** `["react-native-ble-plx", { "isBackgroundEnabled": false, "modes": [], "neverForLocation": true, "bluetoothAlwaysPermission": "One Remote uses Bluetooth to find and control your air freshener in the room." }]` and `["expo-notifications", { "color": "#2f6df6" }]` (mods run in reverse order); `android.blockedPermissions` gains `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`.

- [ ] **Step 1: Write the failing tests** in the style of `tests/plugins/withNoGoogleTelemetry.test.ts` (remove, idempotent, throws) for both plugins; `tests/plugins/aerConfig.test.ts` compiles the mods in a child Node process as AR's `tests/config/iosConfig.test.ts` does (`getPrebuildConfigAsync` + `compileModsAsync`, `introspect: true`) and asserts: iOS entitlements have no `aps-environment`; iOS `NSBluetoothAlwaysUsageDescription` is the string above; the Android manifest has `BLUETOOTH_SCAN` with `android:usesPermissionFlags="neverForLocation"`, `BLUETOOTH_CONNECT`, no `uses-permission-sdk-23` without `tools:node="remove"` for location, the four Firebase entries removed, and still the `TransportBackendDiscovery` removal from `withNoGoogleTelemetry`. Timeout 60 s.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/plugins`. Expected: FAIL.
- [ ] **Step 3: Implement** both plugins and the `app.json` entries.
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `build(aer): configure Bluetooth and local notifications with no push and no location`.

## Wave 1, Lane D: Home card, dispenser screen, schedule editor (`lane/aer-d`)

Shared for D: problem state from `aerProblem(e)`; banner text `aer.prob<Problem>`; the screen state is

```ts
export type AerScreenState = 'ready' | 'spraying' | 'connecting' | 'btoff' | 'denied' | 'away' | 'busy' | 'flat' | 'low';
export function aerScreenState(view: AerView, op: 'connecting' | 'spraying' | null, problem: AerProblem | null): AerScreenState;
```
(`src/screens/aer/screenState.ts`: op first; then problem btoff/denied/away/busy/flat; then a reading with `isBatteryTooLow` → flat; `refillPercent < 10` → low; else ready. `live` = ready/spraying/low; `cached` = connecting/btoff/denied/away/busy.)

### Task D.1: The Home card with the Spray quick action

**Files:**
- Create: `src/screens/home/AerCard.tsx`, `src/screens/aer/screenState.ts`, `src/screens/aer/cardLine.ts`
- Modify: `src/screens/home/HomeScreen.tsx` (render `AerCard` for `device.kind === 'aer'`)
- Test: `tests/screens/aer/aerCard.test.tsx`, `tests/screens/aer/screenState.test.ts`

**Interfaces:**
- Consumes: `useAerView`, `formatNextSpray`, `formatWhen`, `AER_FRESH_MS` (0.4); `IconButton` `tone="accent"`, `busy` (0.2).
- Produces: `aerScreenState` (above); `cardLine(view: AerView, timeZone: string, now: Date): { text: string; tone: 'ink2' | 'warn' | 'bad' }` (flat → `aer.cardFlat` bad; refill < 10% → `aer.cardLow` warn; no reading → `aer.notRead`; reading older than `AER_FRESH_MS` → `aer.lastRead`; else `formatNextSpray`); `AerCard(props: { card: HomeCard; index?: number; onOpen(id): void; onSettings(id): void }): ReactElement`. Second line `aer.levels` (tabular numbers), hidden without a reading. Spray key: `testID="aer-spray-<id>"`, label `aer.sprayLabel`, disabled when flat, busy while `sprayNow` runs, then the sent ring (`SentRing` from `@/ui/tv/SentRing`) and toast `aer.sprayed` (ok); a failure toasts `aer.prob<Problem>`. The card does not open on Spray. Long press opens settings, as `DeviceCard`.

- [ ] **Step 1: Write the failing tests:** `screenState.test.ts` `it.each` over the precedence (e.g. op `spraying` with problem `away` → `spraying`; no op, reading at 2350 mV → `flat`; `spraysSinceRefill: 2100` → `low`). `aerCard.test.tsx`: `it('shows next spray and the levels')` (fresh reading 2900 mV, 700 sprays → `'Battery 71% · Refill 68%'`); `it('says when it last read instead of a next spray')` (reading 2 h old → `'Last read 2 h ago'`); `it('flat disables Spray and reads red')`; `it('Spray sprays without opening')` (fake `hold('sprayNow')` → busy state, release → toast `'Sprayed'`, `onOpen` not called, `calls` has `{ op: 'sprayNow', deviceId }`); `it('a failed spray says why')` (`failNext('sprayNow', new AerError('busy'))` → toast `aer.probBusy`); dark and reduced-motion renders.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/screens/aer tests/screens/home.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it again. Expected: PASS, `home.test.tsx` unchanged.
- [ ] **Step 5: Commit** `feat(aer): add the air freshener card with a Spray key`.

### Task D.2: The dispenser screen

**Files:**
- Create: `src/screens/aer/AerScreen.tsx`, `src/screens/aer/useAerDevice.ts`, `src/ui/aer/SprayDisc.tsx`, `src/ui/aer/LevelTile.tsx`
- Modify: `app/device/[id].tsx` (`case 'aer': return <AerScreen deviceId={id} />;`)
- Test: `tests/screens/aer/aerScreen.test.tsx`, `tests/ui/aerScreenKit.test.tsx`

**Interfaces:**
- Produces: `SprayDisc(props: { onPress(): void; spraying: boolean; disabled: boolean; label: string }): ReactElement` (136 px accent disc; spinner and "Spraying…" while spraying; two mist rings every `ambient` ms, as `PulseRings`; none under reduced motion; pressed scale .94); `LevelTile(props: { icon: IconName; label: string; percent?: number; tone: 'accent' | 'warm' | 'danger'; loading: boolean; testID?: string }): ReactElement` (mock `.stat`; skeletons while loading). `useAerDevice(deviceId: string): { view: AerView; state: AerScreenState; problem: AerProblem | null; spray(): Promise<void>; setAuto(i: AerInterval | null): Promise<void>; retry(): Promise<void> }` — refreshes on mount (op `connecting`), ignores results after unmount (port of AR `useDispenser`).
- Layout per `S.aer`: bar title = device name, subtitle `aer.readNow` / `aer.lastRead` / `aer.sub<State>` with the mock's dot; problem banner + buttons (Open Settings for btoff and denied, via `openBluetoothSettings` from `src/screens/aer/openSettings.ts` — **Lane F owns that file; until it merges, D imports nothing from it and passes `onOpenSettings` from props defaulting to a no-op, W.1 wires it**); low banner; `SprayDisc`; Auto spray group (`Toggle` disabled unless live; `SegmentedControl` 10/20/40 shown only when on, fade 260 ms; `aer.autoNote`); Status with two `LevelTile`s (battery tone danger under 10%, refill tone warm under 10%) and `aer.firmwareLine`; Schedules header with `aer.scheduleCount` (max `MAX_SCHEDULES`), rows `aer.scheduleWindow` / `aer.scheduleLine` opening `/aer/schedule/<id>?index=<i>`, empty line, Add schedule (disabled at 10 or not live) and `aer.scheduleFull` under it at 10; everything but the banner dimmed when cached; `LinkLine` with icon `bt`/`btoff`, kind `fellBack` when btoff/away/busy/denied, opening `/device-sheet/<id>`. Auto spray refused for a running schedule toasts `aer.probScheduleRunning`.

- [ ] **Step 1: Write the failing tests:** `it('connects on open, then shows what it read')` (hold `refresh` → skeleton tiles and `'Connecting…'`; release → `'Read just now'`, `'Firmware 2.1.4 · Read just now'`); `it.each(['btoff','away','busy','flat','denied'])` → banner text `aer.prob…`, Spray disabled except never for ready, cached content keeps `'Last read 2 h ago'`; `it('Try again connects again')`; `it('auto spray off hides the intervals')`; `it('picking 40 min sets auto spray')` (`calls` has `{ op: 'setAutoSpray', arg: 40 }`); `it('10 schedules disables Add schedule and says why')`; `it('unmount while spraying')` (hold `sprayNow`, unmount, release → no `console.error`, no toast); dark + reduced-motion renders; `aerScreenKit`: `SprayDisc` shows no rings when `reducedMotion`.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/screens/aer/aerScreen.test.tsx tests/ui/aerScreenKit.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(aer): add the dispenser screen`.

### Task D.3: The schedule editor

**Files:**
- Create: `src/screens/aer/ScheduleEditor.tsx`, `src/screens/aer/useScheduleDraft.ts` (port of AR `src/screens/schedule/useScheduleDraft.ts` without the steppers), `src/ui/aer/TimeCard.tsx`, `src/ui/aer/timePicker.ts`
- Modify: `app/aer/schedule/[id].tsx` (renders `<ScheduleEditor deviceId={id} index={index === undefined ? undefined : Number(index)} />`)
- Test: `tests/screens/aer/scheduleEditor.test.tsx`

**Interfaces:**
- Produces: `TimeCard(props: { label: string; time: TimeOfDay; error?: boolean; onPress(): void; testID?: string })` (mock `.tcard`; a11y label `aer.timeLabel`); `openTimePicker(value: TimeOfDay): Promise<TimeOfDay | null>` (Android `DateTimePickerAndroid.open({ mode: 'time', value })`; iOS an inline `display="spinner"` picker in `Sheet`); `useScheduleDraft(deviceId, index?)` returns AR's `ScheduleDraft` with `save(): Promise<'done' | 'rounded' | 'failed'>` and `remove(): Promise<boolean>`. New schedule default: AR's (08:00-20:00, every day, 20 min). Problems: `endNotAfterStart` → End card red + `aer.endBeforeStart`; `noDays` under the chips; `noSprays` → `aer.tooShort` in place of the estimate; `tooManySprays` → `aer.tooManySprays`; `tooMany` (new at 10) → banner `aer.scheduleFull`; Save disabled with any problem. Saving shows `StepList` with `aer.stepSaving` done and `aer.stepReading` active; read-back equal → back + toast `aer.saved`; the dispenser changed only the end → back + toast `aer.rounded`; anything else → steps fail, `aer.notKept`, button `aer.tryAgain`, draft kept. Delete asks in place (`aer.deleteTitle`/`deleteBody`, Yes/Cancel), saves the list without it, toast `aer.deleted`.

- [ ] **Step 1: Write the failing tests:** `it('estimates the sprays as you edit')` (18:00-22:00, 40 min → `'About 7 sprays a day'`; toggling chips updates `aria-pressed`); `it('end before start blocks Save')`; `it('no day picked says so under the chips')`; `it('a window shorter than the interval says so')` (18:00-18:30, 40 min); `it('saves, reads back and says Saved')` (`calls` has `saveSchedules` with the whole list, the edited one replaced); `it('tells when the dispenser rounded the end time')` (fake returns end 21:40 → toast `'The dispenser rounded the end time to 9:40 pm.'`); `it('a read-back mismatch keeps the draft and offers Try again')`; `it('deletes after asking')`; `it('10 already shows the banner before anything is typed')`; dark + reduced renders. Mock `@react-native-community/datetimepicker` in this file.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/screens/aer/scheduleEditor.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it again, then `bunx jest --maxWorkers=2 tests/screens`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(aer): add the schedule editor with save and read-back`.

## Wave 1, Lane E: the add flow (`lane/aer-e`)

### Task E.1: Air freshener in the kind picker

**Files:**
- Modify: `src/screens/add/KindPicker.tsx`
- Create: `src/screens/add/aer/AddAerFlow.tsx` (first version: the Android 12 gate only), `app/add/aer.tsx` (replace the stub: `<AddAerFlow />`)
- Test: `tests/screens/kindPicker.test.tsx`, `tests/screens/add/aer/addAer.test.tsx`

**Interfaces:**
- Produces: a fourth `OptionCard` (`icon="aer"`, `t('add.kindAer')`, href `/add/aer`); when `!aer.supported()` it is `disabled` with `subtitle={t('add.needsAndroid12')}`; `AddAerFlow()` renders, when unsupported, an `EmptyState` with icon `aer`, title `add.kindAer`, body `add.needsAndroid12`, and a back button; it never calls `aer.scan`.

- [ ] **Step 1: Write the failing tests:** `it('offers the air freshener')`; `it('needs Android 12')` (`createFakeAerService({ supported: false })`: the card is disabled with `'Needs Android 12'`; rendering `AddAerFlow` shows the same and `calls` is empty).
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/screens/kindPicker.test.tsx tests/screens/add/aer`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(aer): add the air freshener to the kind picker`.

### Task E.2: Looking nearby and the blink

**Files:**
- Create: `src/screens/add/aer/ScanStep.tsx`, `src/screens/add/aer/useAerScan.ts` (port of AR `src/screens/add/useScan.ts`), `src/screens/add/aer/BlinkStep.tsx`, `src/ui/aer/BlinkArt.tsx`
- Modify: `src/screens/add/aer/AddAerFlow.tsx`
- Test: `tests/screens/add/aer/addAer.test.tsx`

**Interfaces:**
- Produces: `SCAN_MS = 15000`; `signalLabel(rssi: number | null): string` (≥ -60 `aer.signalClose`, ≥ -80 `aer.signalNear`, else or null `aer.signalFar`); `BlinkArt(props: { on: boolean })` (mock `.blinkart`, LED blink 700 ms, still under reduced motion). The flow's steps: `scan` → `blink` (`{ bleId, name, deviceId: newId() }`) → `name` → `zone` (E.3). Scan per `S.addAer`: btoff → `EmptyState` (`aer.btOffTitle`/`btOffBody`, Open Settings, Try again); denied → `aer.deniedTitle`/`deniedBody` likewise; scanning → `Radar icon="bt"` + rows (`OptionCard`, icon `bt`, title name or `aer.unnamed`, subtitle `signalLabel`, `testID="aer-found-<bleId>"`), caption `aer.looking` / `aer.stillLooking`; done with none → still radar, `aer.nothingYet`, Look again. Blink per `S.addAerBlink`: `connect` (`aer.checkTitle`, name, `aer.blinking`) while `aer.blink(deviceId, { bleId, timeZone: phoneZone() })`; then `ask` (Yes → name step; Blink again → blink + toast `aer.blinkToast`; No → back to scan, scan restarts); `notAer` problem → `ResultDisc kind="bad"`, `aer.notAerTitle`/`notAerBody`, Choose another; any other problem → `aer.checkTitle`, `BlinkArt on={false}`, `ErrorLine` `aer.prob<Problem>`, Try again, Choose another. Open Settings uses the local `openBluetoothSettings` passed in by props (W.1 wires Lane F's helper).

- [ ] **Step 1: Write the failing tests:** `it('lists first found first')` (fake `found` `[{bleId:'B'},{bleId:'A'}]` → rows in that order); `it('says Bluetooth is off instead of searching')` (`failNext('scan', new AerError('bluetoothOff'))`); `it('nothing found offers Look again')`; `it('picking a device blinks it, then asks')` (`calls` has `{ op: 'blink', arg: { bleId: 'B', timeZone: <phone zone> } }`); `it('not a Smart Matic offers another')` (`failNext('blink', new AerError('notDispenser'))`); `it('busy says another phone has it')`; `it('No goes back to the list')`; dark + reduced renders.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/screens/add/aer`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(aer): find the air freshener nearby and blink it`.

### Task E.3: Name it, the home time zone, and saving

**Files:**
- Create: `src/screens/add/newDevice.ts`, `src/screens/add/aer/ZoneStep.tsx`, `src/screens/add/aer/zones.ts` (port of AR `src/screens/settings/zones.ts`)
- Modify: `src/screens/add/NameRoomStep.tsx`, `src/screens/add/aer/AddAerFlow.tsx`, `app/aer/zone/[id].tsx` (replace the stub: `<ZoneStep edit deviceId={id} />`)
- Test: `tests/screens/nameRoom.test.tsx`, `tests/screens/add/aer/zone.test.tsx`, `tests/screens/add/newDevice.test.ts`

**Interfaces:**
- Produces: `type NamePick = { name: string; room: { id: string } | { newName: string } }`; `planNewDevice(data: { rooms: Room[]; devices: Device[] }, draft: NameRoomStepProps['draft'], pick: NamePick, id: string): { device: Device; newRoom?: Room }` (the order rules NameRoomStep uses today, moved here unchanged). `NameRoomStepProps` gains `stepLabel?: string` and `onNext?: (pick: NamePick) => void`: with `onNext` the button reads `t('aer.next')` and hands the pick over instead of saving. `ZoneStep(props: { edit?: boolean; deviceId: string; onDone?(zone: string): Promise<void> })`: search field filters `listTimeZones()` (`filterZones`), the phone's zone first with badge `aer.thisPhone`, each row `zoneLabel` + `offsetLabel`, the current zone selected; add mode: title `aer.zoneTitle`, step `aer.zoneStep`, button Done; edit mode: bar title, button Save → `aer.setTimeZone`, back, toast `aer.saved`. Add flow Done: `newRoom` first (`store.upsertRoom`), then `aer.add(device)` with `device.id` = the blink step's `deviceId`, `links: [{ kind: 'aer', bleId, timeZone }]`; button loading meanwhile; success → Home (as `AddApplianceFlow`'s `home()`); failure → `ErrorLine` `aer.zoneFailed` with `problem: t('aer.prob<Problem>')`, Done again retries.

- [ ] **Step 1: Write the failing tests:** `newDevice.test.ts` — same orders as the existing NameRoomStep cases (first in an empty room is 0, next is max + 1, a new room gets order max + 1); `nameRoom.test.tsx` gains `it('hands the pick over with Next')` (existing cases unchanged); `zone.test.tsx`: `it('picks the phone zone and saves the device with it')` (`calls` has `add` with `links[0].timeZone === <phone zone>`, then the device is in the store); `it('search narrows the zones')` (`'kolk'` → only `India · Kolkata`); `it('a failed add says why and keeps the step')` (`failNext('add', new AerError('unreachable'))` → `"Couldn't add it. Can't reach it. Move closer and try again."`); `it('edit saves the new zone')`; dark + reduced renders.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/screens/nameRoom.test.tsx tests/screens/add`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it again, then `bunx jest --maxWorkers=2 tests/screens`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(aer): name the air freshener and set its home time zone`.

## Wave 1, Lane F: device sheet, Settings and app glue (`lane/aer-f`)

### Task F.1: Device settings for the air freshener

**Files:**
- Create: `src/screens/aer/AerSheetActions.tsx`, `src/screens/aer/openSettings.ts`
- Modify: `src/screens/device/DeviceSheet.tsx`, `src/screens/device/linkActions.tsx`
- Test: `tests/screens/aer/aerSheet.test.tsx`

**Interfaces:**
- Produces: `openBluetoothSettings(): Promise<void>` (Android `Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS')`, iOS `Linking.openSettings()`), `openNotificationSettings(): Promise<void>` (`Linking.openSettings()`); `DeviceActionProps` gains `takeOver(node: ReactElement | null): void` (a non-null node replaces the sheet's body, as the remove confirm does); `aerSheetAction` in the `// aer lane` slot of `DEVICE_ACTIONS`: a `Group` with I refilled it (`aer.refilledSub` with the cached refill %), Find it (spinner while `aer.blink(id)`; toast `aer.blinkToast`; failure toast `aer.prob…`), Home time zone (`aer.zoneSub` with `zoneLabel`/`offsetLabel`, opens `/aer/zone/<id>`); I refilled it takes over with `aer.refillTitle`/`refillBody`, Yes → `aer.resetRefill`, toast `aer.refillDone`, Cancel restores. `linkDetail` for an aer link → `t('aer.linkSub')`. The remove confirm body for `kind === 'aer'` is `t('aer.removeBody')`.

- [ ] **Step 1: Write the failing tests:** `it('shows the aer rows and Bluetooth as the link')`; `it('I refilled it asks once, then resets')` (`calls` has `resetRefill`; toast `'Refill set to 100%'`); `it('Find it blinks the light')`; `it('the time zone row opens the zone screen')` (router push `/aer/zone/d1`); `it('remove says the dispenser keeps its schedules')` and `services.removeDevice` runs → fake `forget` called; dark + reduced renders; the existing `deviceSheet.test.tsx` stays green.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/screens/aer/aerSheet.test.tsx tests/screens/deviceSheet.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(aer): add the air freshener's device settings`.

### Task F.2: Alerts in Settings

**Files:**
- Create: `src/screens/settings/AlertsGroup.tsx`
- Modify: `src/screens/settings/SettingsScreen.tsx`
- Test: `tests/screens/settings.test.tsx`

**Interfaces:**
- Produces: `AlertsGroup()` between the toggles group and the Rooms/Privacy/About group (mock `alertsGroup`): section `settings.alerts`; three `ListItem`s with `Toggle` (`testID="alerts-<group>"`) reading `aerAlerts.switches()` and writing `setSwitch`; permission `denied` → `Banner` icon `bell` `settings.notificationsOff`, a small Open Settings button (`openNotificationSettings`), switches dimmed and disabled; permission re-read when the app becomes active (`AppState` `change` → `active`).

- [ ] **Step 1: Write the failing tests:** `it('shows the three alert switches, on by default')`; `it('turning one off turns off only that group')` (fake records `setSwitch('battery', false)`); `it('notifications refused dims the switches and says where')`; `it('privacy names Bluetooth')` (`'Home network and Bluetooth only'` and the body); dark + reduced renders.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/screens/settings.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(aer): add the alert switches to Settings`.

### Task F.3: App glue: alerts start, alert taps, background close

**Files:**
- Create: `src/screens/aer/useAerAlertOpen.ts`
- Modify: `src/screens/AppProviders.tsx`, `app/_layout.tsx`
- Test: `tests/screens/aer/appGlue.test.tsx`

**Interfaces:**
- Produces: `AppProviders` runs `services.aerAlerts.start()` once (stop on unmount) and calls `services.aer.closeAll()` on `AppState` `'background'`; `useAerAlertOpen()` (called in `RootStack`) pushes `/device/<id>` for a tapped alert, or `router.replace('/')` when the id is null.

- [ ] **Step 1: Write the failing tests:** `it('starts the alerts once')`; `it('closes every session in the background')` (emit `AppState` `'background'` → `calls` has `closeAll`; `'inactive'` does not); `it('a tapped alert opens its device')` (`fakeAlerts.opened('d1')` → push `/device/d1`; `opened(null)` → replace `/`).
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/screens/aer/appGlue.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it again, then the full `bunx jest --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(aer): start the alerts and free the dispenser in the background`.

---

## Wave 2: integration and release (one agent, `lane/aer`)

### Task W.1: Merge the lanes and wire the real aer

**Files:**
- Modify: `src/services/createServices.ts` (replace `createAerOff` in the `// aer lane` slots), `src/screens/aer/AerScreen.tsx` and `src/screens/add/aer/ScanStep.tsx` (pass `openBluetoothSettings`), `eslint.config.js` (`'app/dev/aer-spike.tsx'` under `// aer lane`), the mock (every edit the lane reports listed)
- Delete: `src/services/aerOff.ts`
- Create: `app/dev/aer-spike.tsx`
- Test: `tests/services/aerServices.test.ts`

**Interfaces:**
- Consumes: `createAer` (A.4), `createAlerts`, `createAlertStateStore` (B.1), `createExpoScheduler` (B.2), `createRnTransport`, `bleSupported` (C.1).
- Produces: in `createServices`, `// aer lane`: `const aerParts = createAer({ transport: createRnTransport(), home: store, storage: AsyncStorage, supported: bleSupported() })`; `aer: deps.aer ?? aerParts.service`; `aerAlerts: deps.aerAlerts ?? createAlerts({ store: aerParts.dispenserStore, scheduler: createExpoScheduler(), state: createAlertStateStore(AsyncStorage) })`; the aer store's `load()` runs once at start (errors logged). `app/dev/aer-spike.tsx` (redirects to `/` unless `__DEV__`): pick an added dispenser, "Plan a refill alert now" writes a cached reading with `spraysSinceRefill: 2190` and `at: now` through `aerParts.dispenserStore.upsert`, so the engine plans `refillLow` and `refillOut`.

- [ ] **Step 1: Merge** `lane/aer-a` … `lane/aer-f` in that order (`chore: merge <lane> (lane/aer-<x>)`); resolve only slot-comment adjacency.
- [ ] **Step 2: Write the failing test** `tests/services/aerServices.test.ts`: `it('wires the aer to the home store and the alerts')` (`createServices` with a memory home store, a fake transport passed through a new `deps.bleTransport?: BleTransport` field, and a fake scheduler through `deps.aerScheduler?: AlertScheduler`: adding a dispenser through `services.aer.add` puts it on `services.store.devices()`, and a cached reading under 10% refill leads `aerAlerts.pendingKeys()` to contain `'<id>:refillLow'`; `removeDevice(id)` empties it).
- [ ] **Step 3: Run** `bunx jest --maxWorkers=2 tests/services/aerServices.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the wiring, the two optional deps, the spike, the reported mock edits.
- [ ] **Step 5: Run** the full `bunx jest --maxWorkers=2`, `bunx tsc --noEmit`, `bunx eslint . --max-warnings=0`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(aer): wire the air freshener into the app`.

### Task W.2: Release: privacy, Play notes and the manifest check

**Files:**
- Modify: `PRIVACY.md`, `docs/store/google-play.md`; `plugins/withNoGoogleTelemetry.js` / `plugins/withNoPush.js` and their tests only if Step 3 finds a leak
- Test: `tests/plugins/aerConfig.test.ts` (one assertion per leak found)

**Interfaces:**
- Produces: `PRIVACY.md`: the short version and "What stays on your phone" add the air freshener over Bluetooth (its Bluetooth address, readings and schedules, kept on the phone); permissions table adds `Nearby devices (Bluetooth)` — "To find and control your air freshener in the room. Android 12 and newer; never used for location." and `Notifications` — "For refill, battery and check-in alerts, planned on the phone. No push messages."; a line that alerts never run Bluetooth in the background. `docs/store/google-play.md`: reviewer note "needs a TV, AC, fan or aer dispenser"; Data safety row adds "Bluetooth stays in the room; no data collected or shared"; a new "Permissions" table listing every permission in the release manifest with its reason; a "Release manifest check" section with the commands below.

- [ ] **Step 1: Write the docs.**
- [ ] **Step 2: Build** `bunx expo prebuild -p android --clean`, then in `android/`: `ANDROID_HOME=$HOME/Android/Sdk ./gradlew :app:assembleRelease -q`.
- [ ] **Step 3: Check the release manifest:** `$HOME/Android/Sdk/cmdline-tools/latest/bin/apkanalyzer manifest print android/app/build/outputs/apk/release/app-release.apk > /tmp/aer-manifest.xml` (scratchpad path in practice). Expected, each by `grep`: `BLUETOOTH_SCAN` with `neverForLocation`, `BLUETOOTH_CONNECT`, `POST_NOTIFICATIONS` present; absent: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `c2dm.permission.RECEIVE`, `FirebaseMessagingService`, `ExpoFirebaseMessagingService`, `FirebaseInstanceIdReceiver`, `TransportBackendDiscovery`. Then list every `com.google` `service|receiver|provider` and compare with the list from `main`'s release build (build `main` the same way first): each new one is removed by a plugin (add it to `withNoPush` or `withNoGoogleTelemetry`, with a test) or written into `docs/store/google-play.md` with why it cannot reach the network.
- [ ] **Step 4: Run** `bunx jest --maxWorkers=2 tests/plugins`. Expected: PASS.
- [ ] **Step 5: Commit** `docs(aer): add Bluetooth and notifications to the privacy policy and Play notes`.

## Wave 3: on the real dispenser

### Task H.1: Hardware check (manual, the author, iQOO Z10x)

**Files:** none; the results go in the hand-off report (and any mock or copy fix becomes a follow-up task).

- [ ] **Step 1:** Install the W.2 release APK (`adb install -r android/app/build/outputs/apk/release/app-release.apk`) and close the Godrej app and Aer Remote.
- [ ] **Step 2: Add:** Plus → Air freshener → the Nearby devices prompt names no location → the dispenser is listed → it blinks → Name it → Home time zone (India · Kolkata) → Done. Expected: it is on Home with its battery and refill.
- [ ] **Step 3: Control:** Spray from the card and from the screen (it sprays, "Sprayed"); Auto spray on at 20 min, then off (the screen reads back the same); add a schedule, Save (Saved after the read-back), edit its end to an odd minute (the rounding toast if the dispenser rounds), delete it; Find it blinks; I refilled it shows 100%.
- [ ] **Step 4: Status and release:** firmware and "Read just now" show; 10 s after the last action Aer Remote on another phone (or this one) can connect. With Aer Remote holding the dispenser, open it in One Remote and note which banner shows (busy or away); record it, since the phone may not tell the two apart.
- [ ] **Step 5: Alert:** in a debug build, `app/dev/aer-spike.tsx` → "Plan a refill alert now" between 09:00 and 21:00. Expected: the notification permission prompt once, then "Refill running low" on the phone; tapping it opens the dispenser.
- [ ] **Step 6: Report** each step as pass or fail with what was seen.
