# One Remote Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the skeleton of One Remote: tooling, theme, the frozen device and link interfaces, the
local-network-only guard, the device hub with link fallback, local storage, and the app shell. The
shell has Home grouped by room, the welcome screen, the name-and-room step, the device sheet and
Settings. All of it runs against fake devices, so the TV, IR and Matter lanes can then run in
parallel.

**Architecture:**

- **Pure core.** Pure-TypeScript modules (`src/core` types, `src/device` hub, `src/transport/localOnly`)
  sit under a thin React Native shell.
- **Link drivers.** Every way of reaching a device (webOS, IR, Matter) is a `LinkDriver` plugged into
  the `DeviceHub`. The hub picks a link per command, falls back to the next one, and backs off a link
  that failed.
- **Fakes.** This plan ships fake drivers only. The real ones come from the lane plans (TV, IR,
  Matter), which code against the interfaces fixed here.

**Tech Stack:**

- Expo SDK 58 (dev client) with TypeScript strict, Bun and expo-router.
- `@react-native-async-storage/async-storage`, `expo-secure-store`.
- Jest (jest-expo), ESLint flat config, Prettier, lefthook.

**Spec:** `docs/superpowers/specs/2026-10-30-one-remote-design.md`. Mockups:
`docs/design/one-remote-mockup-v3.html` (main screens) and `docs/design/one-remote-mockup-v4.html`
(flows). Executors read the spec first.

**Reference project:** Aer Remote, at `/media/devansh/Experiment/playground/godrejapp` (GitHub
`DevanshChoubey/aer-remote`), called **AR** below. "Copy from AR" means copy the file, then rename
folders and names as the task says.

**Follow-on plans** (written after this one lands, each a parallel lane):

- `2026-10-30-one-remote-tv.md`: webOS driver, TV screen, Add TV flow.
- `…-ir.md`: IR native module, encoders, AC and fan screens, IR test flow.
- `…-matter.md`: Matter spike, then the driver.

## Global Constraints

- **Rules:** `docs/ENGINEERING.md` (created in Task 1) applies in full: layering, primitives,
  tokens only in `src/theme/tokens.ts`, copy only in `src/i18n/en/<ns>.ts`, strict TS, no `any`, no
  `!`, typed errors, TDD.
- **Bun only** (`bun install`, `bun add`, `bunx`, `bun run`). Use `bunx expo install` for anything
  native. Never npm, yarn or pnpm.
- **Pure folders:** `src/core`, `src/device`, `src/ir`, `src/webos` and `src/matter` (except
  `src/matter/native/`) must not import `react-native*`, `expo*` or `@react-native-async-storage/*`.
- **Sockets:** `fetch` and `XMLHttpRequest` are banned everywhere. `WebSocket` and `dgram` are allowed
  only in `src/transport/**`.
- **Local network only:** every unicast connect goes through `assertLocal()` (Task 4). Multicast is
  allowed only to `239.255.255.250`, `224.0.0.251`, `ff02::fb` and other `ff02::/16` addresses.
  Broadcast is allowed only to the phone's subnet broadcast address.
- **Screens:** screens reach services only through `useServices()`. Touch targets are at least 48dp,
  and every touchable has a label and a role.
- **Commits:**
  - Conventional Commits, author `Devansh Choubey <devanshc13@gmail.com>`, ending with
    `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - `bun run test`, `bun run typecheck` and `bun run lint` pass before every commit.
  - Coverage is at least 80% lines for `src/core`, `src/device`, `src/store` and `src/transport`.
- **Branches:** work on `lane/foundation`. Never push to `main`; the pre-push hook blocks it.
  Pushing needs the author's OK.

## Review Focus

1. **A press that may already have reached the device is never resent on another link.** A TV key
   that timed out after being written must not also go out over IR (Mi Remote's "double key press"
   complaint). The hub falls back only on errors that mean "not sent", or for idempotent commands.
   Test in Task 6.
2. **A link that hangs never hangs the UI.** Each send has a 2,000 ms timeout and then falls back or
   throws `DeviceError('timeout')`. Test in Task 6.
3. **Addresses that dodge the local-only check:**
   - `::ffff:8.8.8.8` (IPv4-mapped), `0.0.0.0`, `255.255.255.255` and public IPv4 are rejected;
   - a global IPv6 address inside the phone's own on-link /64 is allowed.

   Test in Task 4.
4. **Phone with no IR:** a device with only an IR link is shown greyed out on Home with "Needs a
   phone with IR". Sending to it throws `DeviceError('noIrEmitter')`, not `unreachable`. Tests in
   Task 6 and Task 8.
5. **Removing a room that still has devices:** this is refused with copy ("Move or remove its devices
   first"). Devices never end up with a dangling `roomId`. Test in Task 7.

---

### Task 1: Scaffold, tooling and engineering rules

**Files:**
- Create: the Expo app at the repo root (`bunx create-expo-app@latest . --template default`; then
  delete the template's example screens, components, hooks and constants).
- Copy from AR, then adapt: `eslint.config.js`, `.prettierrc`, `.prettierignore`, `lefthook.yml`,
  `scripts/check-commit-msg.js`, `scripts/check-push-target.js`, `jest.config.js`, `tsconfig.json`,
  `.github/workflows/ci.yml`, `babel.config.js`.
- Create: `docs/ENGINEERING.md`, copied from AR's `docs/ENGINEERING.md` with these changes:
  - the domain module list is `src/core`, `src/device`, `src/store`, `src/transport`, `src/ir`,
    `src/webos` and `src/matter`;
  - the Privacy section is replaced with the spec's "local network only" rule (§6) and the socket
    rules from Global Constraints.
- Test: `tests/lint-rules.test.ts` (copy AR's harness), `tests/smoke.test.ts`.

**Interfaces:**
- Produces:
  - scripts `test`, `typecheck`, `lint`, `format`, `prepare`, as in AR;
  - path alias `@/* → src/*`.

- [ ] **Step 1: Scaffold, install the dev tooling, copy the config files.**
  - In `eslint.config.js`:
    - `SERVICE_MODULES = ['core/hub', 'device', 'store', 'transport', 'ir', 'webos', 'matter']`
      (blocked from screens);
    - `DOMAIN_FOLDERS = ['core', 'device', 'store', 'transport', 'ir', 'webos', 'matter']`;
    - the pure-folder block covers `src/core/**`, `src/device/**`, `src/ir/**`, `src/webos/**` and
      `src/matter/**`, but not `src/matter/native/**`;
    - add `no-restricted-globals` for `XMLHttpRequest` everywhere, and for `WebSocket` everywhere
      except `src/transport/**`;
    - add `no-restricted-imports` for `dgram` and `react-native-udp` outside `src/transport/**`.
  - In `jest.config.js`, set the coverage folders to `['core', 'device', 'store', 'transport']`.
- [ ] **Step 2: Write the failing lint-rule tests** in `tests/lint-rules.test.ts`:

```ts
it('bans react-native in src/webos', () => {
  expect(errorsFor("import { Platform } from 'react-native';\nexport const p = Platform;\n", 'src/webos/x.ts')).toContain('no-restricted-imports');
});
it('bans WebSocket outside src/transport', () => {
  expect(errorsFor('export const s = new WebSocket("ws://x");\n', 'src/webos/x.ts')).toContain('no-restricted-globals');
});
it('allows WebSocket in src/transport', () => {
  expect(errorsFor('export const s = new WebSocket("ws://x");\n', 'src/transport/ws.ts')).not.toContain('no-restricted-globals');
});
it('bans XMLHttpRequest everywhere', () => {
  expect(errorsFor('export const x = new XMLHttpRequest();\n', 'src/transport/x.ts')).toContain('no-restricted-globals');
});
it('bans screens importing @/device', () => {
  expect(errorsFor("import '@/device/hub';\nexport const x = 1;\n", 'src/screens/x.tsx')).toContain('no-restricted-imports');
});
it('allows react-native in src/matter/native', () => {
  expect(errorsFor("import { Platform } from 'react-native';\nexport const p = Platform;\n", 'src/matter/native/x.ts')).not.toContain('no-restricted-imports');
});
```

- [ ] **Step 3: Run the tests.** Run `bun run test tests/lint-rules.test.ts`. Expect PASS once the
  config from Step 1 is in. If a test fails, fix the config, not the test.
- [ ] **Step 4: Run all the checks.** Run `bun run typecheck && bun run lint && bun run test`. Expect
  all green.
- [ ] **Step 5: Commit** `chore: scaffold Expo app with Aer Remote tooling and engineering rules`.

### Task 2: Theme, primitives, UI kit and i18n

**Files:**
- Copy from AR, then adapt:
  - `src/theme/**` and `src/ui/primitives/**`;
  - `src/ui/{Button,Card,Chip,EmptyState,Screen,Toggle,index}.tsx`;
  - `src/i18n/index.ts`, `src/i18n/en/common.ts`;
  - `src/store/themePreferenceStore.ts`.
- Test: copy AR's `tests/theme/tokens.test.ts`, `tests/theme-centralized.test.ts`,
  `tests/ui/primitives.test.tsx`, `tests/ui/kit.test.tsx` and `tests/i18n.test.ts`.

**Interfaces:**
- Produces:
  - `lightTokens` and `darkTokens` (same keys);
  - `Box`, `Row`, `Column`, `Txt`, `Touchable`, `Input`, `Spacer`;
  - `Button`, `Card`, `Chip`, `Toggle`, `Screen`, `EmptyState`;
  - `t(key, params?)`.

- [ ] **Step 1: Replace AR's palette and fonts with the mockup's neutral tokens.**
  - Light: bg `#eef0f3`, surface `#ffffff`, surface2 `#f1f3f6`, ink `#15181d`, ink2 `#5d6470`,
    line `#e2e5ea`, accent `#2f6df6`, accentInk `#ffffff`, cool `#2f8ff6`, warm `#f2793a`,
    ok `#1f9d63`, danger `#e5484d`.
  - Dark: bg `#0d0f12`, surface `#1c2027`, surface2 `#232832`, ink `#eef1f5`, ink2 `#9aa3b2`,
    line `#2b313b`, accent `#6a96ff`, accentInk `#0d0f12`. The other dark colours keep the light
    values.
  - Fonts: the system font only. Drop the Google fonts.
- [ ] **Step 2: Copy the tests and adapt the token names.** Run `bun run test tests/theme tests/ui`
  and expect PASS.
- [ ] **Step 3: Commit** `feat(ui): add theme tokens, primitives and UI kit`.

### Task 3: Core device model (frozen interfaces)

**Files:**
- Create: `src/core/model.ts`, `src/core/errors.ts`, `src/core/index.ts`.
- Test: `tests/core/model.test.ts`.

**Interfaces:**
- Produces (exact; every lane imports these):

```ts
export type DeviceKind = 'tv' | 'ac' | 'fan';
export type LinkKind = 'webos' | 'matter' | 'ir';
export type Link =
  | { kind: 'webos'; host: string; mac?: string; secure: boolean; clientKeyRef: string }
  | { kind: 'matter'; nodeId: string }
  | { kind: 'ir'; remoteId: string }; // catalogue id, e.g. 'panasonic-ac/dke'
export interface Room { id: string; name: string; order: number }
export interface Device { id: string; kind: DeviceKind; name: string; roomId: string; order: number; links: Link[] }

export type AcMode = 'cool' | 'dry' | 'fan' | 'auto';
export type AcFan = 'auto' | 1 | 2 | 3;
export interface AcState { power: boolean; mode: AcMode; setpoint: number; fan: AcFan; swing: boolean; sleep: boolean }
export type FanSpeed = 1 | 2 | 3 | 4 | 5;
export interface FanState { power: boolean; speed: FanSpeed; boost: boolean; sleep: boolean; timerHours: 0 | 1 | 2 | 4 | 8; light?: boolean }
export type TvKey = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'home' | 'mute'
  | 'volumeUp' | 'volumeDown' | 'playPause' | 'input' | 'power';
export interface TvState { power: boolean; app?: string; volume?: number; muted?: boolean }

export type Command =
  | { kind: 'tv.key'; key: TvKey }
  | { kind: 'tv.text'; text: string }
  | { kind: 'tv.powerOn' }
  | { kind: 'ac.set'; state: AcState }
  | { kind: 'fan.set'; state: FanState };

export type Reported =
  | { kind: 'tv'; state: TvState }
  | { kind: 'ac'; state: AcState; roomTemp?: number };

export interface Capabilities {
  acModes?: AcMode[];
  acFan?: AcFan[];
  setpoint?: { min: number; max: number };
  swing?: boolean;
  sleep?: boolean;
  fanLight?: boolean;
}

export type DeviceErrorCode = 'notSent' | 'timeout' | 'notPaired' | 'noIrEmitter' | 'noLink'
  | 'notLocal' | 'unsupported';
export class DeviceError extends Error { constructor(readonly code: DeviceErrorCode, message?: string) }

export function isIdempotent(cmd: Command): boolean;   // true for ac.set, fan.set, tv.powerOn
export function defaultAcState(): AcState;             // { power: false, mode: 'cool', setpoint: 24, fan: 'auto', swing: false, sleep: false }
export function clampSetpoint(n: number, caps?: Capabilities): number; // default range 16..30
```

- [ ] **Step 1: Write the failing tests:**
  - `isIdempotent({kind:'tv.key',key:'ok'}) === false`;
  - `isIdempotent({kind:'ac.set',state:defaultAcState()}) === true`;
  - `clampSetpoint(40) === 30`;
  - `clampSetpoint(10) === 16`;
  - `clampSetpoint(20, {setpoint:{min:18,max:28}}) === 20`;
  - `new DeviceError('timeout').code === 'timeout'`, and it is an `instanceof Error`.
- [ ] **Step 2: Run it.** `bun run test tests/core/model.test.ts`. Expect FAIL (module not found).
- [ ] **Step 3: Implement** `src/core/model.ts` and `errors.ts` to the block above.
- [ ] **Step 4: Run it.** Expect PASS.
- [ ] **Step 5: Commit** `feat(core): add device, link, state and command model`.

### Task 4: Local-network-only guard

**Files:**
- Create: `src/transport/localOnly.ts`.
- Test: `tests/transport/localOnly.test.ts`.

**Interfaces:**
- Produces:
  - `type Prefix = { address: string; bits: number }`;
  - `isLocalAddress(ip: string, onLink: Prefix[]): boolean`;
  - `isAllowedMulticast(ip: string): boolean`;
  - `isSubnetBroadcast(ip: string, onLink: Prefix[]): boolean`;
  - `assertLocal(ip: string, onLink: Prefix[]): void`, which throws `DeviceError('notLocal')`.

  Pure TypeScript with no dependencies. Parse IPv4 and IPv6 by hand, including `::` compression
  and IPv4-mapped addresses.

- [ ] **Step 1: Write the failing tests** (`const lan = [{address:'192.168.1.7',bits:24},{address:'2401:4900:1c3a:5e10::7',bits:64}]`):
  - `true` for `192.168.1.23`, `10.0.0.5`, `172.20.1.1`, `169.254.3.3`, `127.0.0.1`, `fd12::1`,
    `fe80::1`, `::1` and `2401:4900:1c3a:5e10::abcd` (on-link global);
  - `false` for `8.8.8.8`, `172.32.0.1`, `::ffff:8.8.8.8`, `0.0.0.0`, `255.255.255.255`,
    `2401:4900:1c3a:5e11::1` (another /64) and `not-an-ip`;
  - `isAllowedMulticast`: `true` for `239.255.255.250`, `224.0.0.251`, `ff02::fb` and `ff02::1`;
    `false` for `239.1.1.1` and `ff0e::1`;
  - `isSubnetBroadcast('192.168.1.255', lan) === true`, `isSubnetBroadcast('255.255.255.255', lan) === false`;
  - `expect(() => assertLocal('8.8.8.8', lan)).toThrow(expect.objectContaining({ code: 'notLocal' }))`.
- [ ] **Step 2: Run it.** `bun run test tests/transport/localOnly.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement** `src/transport/localOnly.ts`. An IPv4-mapped IPv6 address is judged as
  its IPv4 part. Invalid input returns `false`.
- [ ] **Step 4: Run it.** Expect PASS.
- [ ] **Step 5: Commit** `feat(transport): add local-network-only address guard`.

### Task 5: Link driver interface and fake drivers

**Files:**
- Create: `src/core/driver.ts`, `src/device/testing/fakeDriver.ts`.
- Test: `tests/device/fakeDriver.test.ts`.

**Interfaces:**
- Produces:

```ts
export type Unsubscribe = () => void;
export interface LinkDriver {
  readonly kind: LinkKind;
  /** Quick, synchronous: false when this phone can't use the link at all (e.g. no IR emitter). */
  available(): boolean;
  supports(device: Device, link: Link, cmd: Command): boolean;
  capabilities(device: Device, link: Link): Capabilities;
  /** Resolves once the command was handed to the device. Throws DeviceError:
   *  'notSent' when it surely did not go out (socket closed, host unreachable),
   *  'timeout' when it may have gone out. */
  send(device: Device, link: Link, cmd: Command): Promise<void>;
  /** Optional live state (webOS, Matter). */
  observe?(device: Device, link: Link, cb: (r: Reported) => void): Unsubscribe;
}
// testing/fakeDriver.ts
export function createFakeDriver(kind: LinkKind, opts?: { available?: boolean }): LinkDriver & {
  sent: { deviceId: string; cmd: Command }[];
  failNext(code: DeviceErrorCode): void;   // next send throws
  hangNext(): void;                        // next send never settles
  emit(deviceId: string, r: Reported): void;
};
```

- [ ] **Step 1: Write the failing tests:**
  - a send records `{deviceId, cmd}` in `sent`;
  - after `failNext('notSent')` the next send rejects with code `notSent` and the one after it
    succeeds;
  - `emit` reaches the `observe` callbacks for that device only;
  - `available()` reflects `opts.available` (default `true`).
- [ ] **Step 2: Run it.** `bun run test tests/device/fakeDriver.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run it.** Expect PASS.
- [ ] **Step 5: Commit** `feat(device): add LinkDriver interface and fake driver`.

### Task 6: Device hub (link choice, fallback, backoff)

**Files:**
- Create: `src/device/hub.ts`.
- Test: `tests/device/hub.test.ts`.

**Interfaces:**
- Consumes: `LinkDriver`, the model types and `DeviceError` (Tasks 3 and 5).
- Produces:

```ts
export interface LinkStatus { via: LinkKind | null; fellBack: boolean; problem?: DeviceErrorCode }
export interface DeviceView { device: Device; usable: boolean; status: LinkStatus;
  state?: Reported | { kind: 'ac'; state: AcState; lastSent: true } | { kind: 'fan'; state: FanState; lastSent: true };
  capabilities: Capabilities }
export class DeviceHub {
  constructor(opts: { drivers: LinkDriver[]; now?: () => number; timeoutMs?: number /* 2000 */;
    backoffMs?: number[] /* [1000, 2000, 4000, 8000, 16000, 30000] */ });
  setDevices(devices: Device[]): void;
  view(deviceId: string): DeviceView;
  send(deviceId: string, cmd: Command): Promise<{ via: LinkKind; fellBack: boolean }>;
  subscribe(deviceId: string, cb: (v: DeviceView) => void): Unsubscribe; // starts observe() on links that have it
}
```

- The rules (an algorithm the tests pin):
  - candidates are `device.links`, in order, filtered by `driver.available()` and `supports()`;
  - a link that failed is skipped until its backoff runs out, then tried again first. Success
    resets its backoff;
  - on `notSent`, try the next candidate;
  - on `timeout`, try the next candidate only if `isIdempotent(cmd)`, otherwise rethrow;
  - other codes rethrow;
  - with no candidates: `noIrEmitter` if every link is IR and the IR driver is unavailable,
    otherwise `noLink`;
  - `usable` is `false` exactly when there are no available drivers for any link;
  - `capabilities` come from the first available link;
  - `ac.set` and `fan.set` sent over a link without `observe` are stored as
    `{ state, lastSent: true }`.

- [ ] **Step 1: Write the failing tests**, with fake drivers `webos`, `ir` and `matter` and a fake
  clock:
  - `sends on the first link`: device `[matter, ir]` → `via: 'matter'`, `fellBack: false`.
  - `falls back on notSent`: matter `failNext('notSent')` → `via: 'ir'`, `fellBack: true`, and the
    status shows `fellBack: true`.
  - `does not resend a non-idempotent key after timeout`: TV `[webos, ir]`, webos
    `failNext('timeout')`, send `tv.key ok` → rejects `timeout`, and `ir.sent` is empty.
  - `falls back on timeout for idempotent ac.set`.
  - `times out a hung send`: `hangNext()`, advance 2000 ms → falls back (idempotent) or rejects
    `timeout`.
  - `backs off a failed link, then retries it`: after a matter failure, sends within 1000 ms go to
    IR; at 1001 ms matter is tried first again.
  - `no IR phone`: device `[ir]` with the IR driver `available:false` → `view().usable === false`,
    and send rejects `noIrEmitter`.
  - `last sent state`: an `ac.set` over IR → `view().state` deep-equals
    `{kind:'ac', state, lastSent:true}`.
  - `reported state wins`: matter `emit(id, {kind:'ac', state, roomTemp:27})` reaches subscribers,
    and `view().state.roomTemp === 27`.
- [ ] **Step 2: Run it.** `bun run test tests/device/hub.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement** `src/device/hub.ts`. Serialise sends per device with a promise chain,
  so presses keep their order.
- [ ] **Step 4: Run it.** Expect PASS, with coverage of `src/device` at least 80%.
- [ ] **Step 5: Commit** `feat(device): add device hub with link fallback and backoff`.

### Task 7: Local storage (devices, rooms, secrets, preferences)

**Files:**
- Create: `src/store/types.ts`, `src/store/memoryStore.ts`, `src/store/asyncStorageStore.ts`,
  `src/store/secrets.ts`, `src/store/preferences.ts`.
- Test: `tests/store/store.test.ts`, `tests/store/preferences.test.ts`.

**Interfaces:**
- Produces:

```ts
export interface HomeStore {
  devices(): Promise<Device[]>; rooms(): Promise<Room[]>;
  upsertDevice(d: Device): Promise<void>; removeDevice(id: string): Promise<void>;
  upsertRoom(r: Room): Promise<void>;
  removeRoom(id: string): Promise<void>; // throws StoreError('roomNotEmpty') if any device uses it
  moveDevice(id: string, toIndex: number): Promise<void>; // reorders within its room
  subscribe(cb: () => void): Unsubscribe;
}
export class StoreError extends Error { constructor(readonly code: 'roomNotEmpty' | 'notFound') }
export interface SecretStore { get(ref: string): Promise<string | null>; set(ref: string, v: string): Promise<void>; delete(ref: string): Promise<void> }
export interface Preferences { theme: 'system' | 'light' | 'dark'; volumeKeys: boolean; haptics: boolean;
  tvPad: Record<string, 'touchpad' | 'dpad'> }
export const defaultPreferences: Preferences; // { theme:'system', volumeKeys:true, haptics:true, tvPad:{} }
export function createMemoryStore(): HomeStore;
export function createAsyncStorageStore(storage: AsyncStorageLike): HomeStore; // key 'one-remote/home/v1'
export function createSecureSecretStore(): SecretStore; // expo-secure-store
export function createMemorySecretStore(): SecretStore;
```

- [ ] **Step 1: Write the failing tests**, run against both `memoryStore` and an in-memory
  `AsyncStorageLike`:
  - a device round-trips;
  - `removeDevice` removes it;
  - `removeRoom` of a room with a device rejects `roomNotEmpty`, and of an empty room succeeds;
  - `moveDevice(id, 0)` makes it first in its room, and `order` is renumbered 0..n;
  - `subscribe` fires after each write;
  - corrupt JSON in storage → `devices()` resolves `[]` and calls `console.warn` once.
- [ ] **Step 2: Run it.** `bun run test tests/store`. Expect FAIL.
- [ ] **Step 3: Implement.** Run `bunx expo install @react-native-async-storage/async-storage
  expo-secure-store`. Copy the AsyncStorage pattern from AR's `src/store/asyncStorageStore.ts`.
- [ ] **Step 4: Run it.** Expect PASS.
- [ ] **Step 5: Commit** `feat(store): add home, secret and preference stores`. The commit body
  gives `expo-secure-store` as the reason: TV client keys and Matter fabric secrets.

### Task 8: Services and Home

**Files:**
- Create:
  - `src/core/services.tsx`, `src/core/createServices.ts`;
  - `src/screens/AppProviders.tsx`;
  - `src/screens/home/{HomeScreen,DeviceCard,useHome}.tsx`, `src/screens/home/summary.ts`;
  - `src/i18n/en/home.ts`;
  - `app/_layout.tsx`, `app/index.tsx`, `app/device/[id].tsx` (placeholder remote per kind; the lane
    plans replace it).
- Test: `tests/screens/home.test.tsx`, `tests/screens/summary.test.ts`.

**Interfaces:**
- Consumes: `DeviceHub`, `HomeStore` and `Preferences`.
- Produces:
  - `Services = { hub: DeviceHub; store: HomeStore; secrets: SecretStore; prefs: PreferenceStore; drivers: LinkDriver[] }`;
  - `createServices(deps?: Partial<Services>)`;
  - `useServices()`;
  - `cardSummary(view: DeviceView): string` (keys into `home.*`).

- [ ] **Step 1: Write the failing tests** (render with `createServices` using fake drivers and the
  memory store):
  - empty store → shows `t('home.welcomeTitle')` "One Remote" and the button
    `t('home.addFirst')` "Add your first device";
  - devices in two rooms → the section headers are in room order, with cards in `order` inside each;
  - an IR-only device with the IR driver unavailable → its card is disabled, shows
    `t('home.needsIr')` "Needs a phone with IR", and the banner `t('home.noIrBanner')` "This phone
    has no IR blaster. Devices that only take IR can't be controlled from it." shows once;
  - tapping a usable card navigates to `/device/<id>`;
  - the power toggle on an AC card sends `ac.set` with `power` flipped from the last state;
  - `cardSummary` gives "Cool · 24°" for an AC that is on, "Off" for one that is off, "Speed 3" for
    a fan and "Netflix · Vol 18" for a TV with `app` and `volume`.
- [ ] **Step 2: Run it.** `bun run test tests/screens/home.test.tsx tests/screens/summary.test.ts`.
  Expect FAIL.
- [ ] **Step 3: Implement the screens to mockup v3 ("Home") and v4 ("Welcome").** The header has a
  gear (`/settings`) and + (`/add`).
- [ ] **Step 4: Run it.** Expect PASS.
- [ ] **Step 5: Commit** `feat(home): add Home grouped by room with welcome state`.

### Task 9: Name-and-room step, device sheet and Settings

**Files:**
- Create:
  - `src/screens/add/NameRoomStep.tsx`;
  - `src/screens/device/DeviceSheet.tsx`;
  - `src/screens/settings/SettingsScreen.tsx`;
  - `src/i18n/en/{add,device,settings}.ts`;
  - `app/add/name.tsx`, `app/settings.tsx`.
- Test: `tests/screens/nameRoom.test.tsx`, `tests/screens/deviceSheet.test.tsx`,
  `tests/screens/settings.test.tsx`.

**Interfaces:**
- Produces:
  - `NameRoomStep({ draft: Omit<Device,'id'|'name'|'roomId'|'order'>, suggestedName: string, onDone(d: Device): void })`.
    It is the shared last step of every add flow, which the lane plans call;
  - `DeviceSheet({ deviceId })`.

- [ ] **Step 1: Write the failing tests:**
  - NameRoomStep pre-fills `suggestedName`;
  - "＋ New room" creates a room inline and selects it;
  - Done saves a device with `order` = the end of its room, and calls `onDone`;
  - an empty name disables Done.
  - DeviceSheet: rename saves; changing the room saves; Remove asks for confirmation, then removes;
    "How it's connected" lists the links as `t('device.link.webos')` "Wi-Fi",
    `t('device.link.matter')` "Matter" and `t('device.link.ir')` "IR", with the first one marked
    "main" and the others "backup".
  - Settings: the theme switch persists; the volume keys row is hidden when `Platform.OS === 'ios'`;
    the rooms row opens rename and reorder; removing a non-empty room shows
    `t('settings.roomNotEmpty')` "Move or remove its devices first"; Privacy shows the
    local-network-only text; About lists the licences, including the LGPL notice placeholder for
    `src/ir/lgpl`.
- [ ] **Step 2: Run them.** `bun run test tests/screens/nameRoom.test.tsx tests/screens/deviceSheet.test.tsx tests/screens/settings.test.tsx`.
  Expect FAIL.
- [ ] **Step 3: Implement** to mockup v4 ("Name it", "Device sheet", "Settings").
- [ ] **Step 4: Run them.** Expect PASS. Then run `bun run typecheck && bun run lint && bun run test --coverage`
  and expect all green.
- [ ] **Step 5: Commit** `feat(app): add name-and-room step, device sheet and settings`.
- [ ] **Step 6: Build a dev build and smoke-test it.**
  - `bunx expo prebuild --clean && bunx expo run:android` on the emulator.
  - Expect the welcome screen. Settings opens and the theme switch works.
  - Report the result; do not push.
