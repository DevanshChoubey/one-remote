# One Remote TV Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Control the LG OLED C4 from One Remote: an SSAP client, the LAN transport (WebSocket, SSDP,
subnet probe, Wake-on-LAN), the `webos` link driver that stays connected and finds the TV again, the
TV screen, Android volume keys, the Add TV flow, and the TV hardware spike.

**Requires:** `lane/foundation` merged into `main` first. Work on `lane/tv`, branched from that `main`.
Runs in parallel with `lane/ir` and `lane/matter`.

**Architecture:**

- **Pure client.** `src/webos` holds the SSAP protocol, the client, discovery logic and the driver.
  It is pure TypeScript and talks to the network only through the `TvTransport` interface (Task 1),
  so it is tested against a fake TV and a fake LAN.
- **Thin transport.** `src/transport/tv*.ts` implements `TvTransport` with React Native's `WebSocket`
  and `react-native-udp`. Every unicast connect goes through `assertLocal()`.
- **Through services.** Screens reach the driver through the `DeviceHub`, and reach discovery and
  pairing through a new `services.tv` (`TvSetup`, typed in `src/core/tvSetup.ts`).

**Tech Stack:** Expo SDK 58 dev client, TypeScript strict, Bun, expo-router,
`react-native-udp`, `expo-network`, `react-native-gesture-handler`, `expo-haptics`, Jest (jest-expo).
SSAP message shapes follow `lgtv2` (MIT); we write our own client.

**Spec:** `docs/superpowers/specs/2026-10-30-one-remote-design.md` (§3 goals 3–5, §6 "TV (LG
webOS)", §8 risk 2). Foundation interfaces: `docs/superpowers/plans/2026-10-30-one-remote-foundation.md`
Tasks 3–9. Mockups: `docs/design/one-remote-mockup-v3.html` ("TV", "TV, D-pad") and
`docs/design/one-remote-mockup-v4.html` ("Add a TV", "When something is wrong"). Research:
`docs/research/2026-10-30-market-and-validation.md` §5 "LG webOS". Executors read the spec first.

## Global Constraints

- Everything in the foundation plan's Global Constraints applies (rules, Bun only, pure folders,
  sockets only in `src/transport/**`, `assertLocal()` on every unicast connect, screens use
  `useServices()` only, 48dp targets with label and role, commit rules, 80% coverage).
- Foundation names, used verbatim: `Device`, `Link`, `Command`, `TvKey`, `TvState`, `Reported`,
  `Capabilities`, `DeviceError`/`DeviceErrorCode`, `LinkDriver`, `Unsubscribe` (`src/core`);
  `Prefix`, `assertLocal`, `isSubnetBroadcast`, `isAllowedMulticast` (`src/transport/localOnly.ts`); `DeviceHub`,
  `DeviceView` (`src/device/hub.ts`); `SecretStore`, `HomeStore`, `PreferenceStore`
  (`get()`, `set(partial)`, `subscribe(cb)`), `Preferences.tvPad` (`src/store`); `Services`,
  `createServices`, `useServices` (`src/services/services.tsx`, `src/services/createServices.ts`);
  `NameRoomStep`, `DeviceSheet`.
- The frozen `Link` for a TV is `{ kind: 'webos'; host; mac?; secure; clientKeyRef }`. Do not
  change it. The client key lives in `SecretStore` under `clientKeyRef`; the SSDP USN lives under
  `${clientKeyRef}:usn`.
- Ports: SSAP `3000` (`ws://`), secure `3001` (`wss://`). SSDP `239.255.255.250:1900`, search target
  `urn:lge-com:service:webos-second-screen:1`. Wake-on-LAN to the subnet broadcast, UDP port `9`.
- Timings (tuned in the spike, Task 5): driver connect budget `1500` ms (below the hub's `2000` ms),
  heartbeat every `5000` ms with a `3000` ms reply limit, reconnect backoff
  `[250, 500, 1000, 2000, 5000]` ms, SSDP window `3000` ms, probe `1500` ms per host with 32 in
  flight, pairing prompt `60` s, turn-on wait `20` s.
- The TV IR remote id is the string `'lg-tv/nec'` (the IR lane's catalogue uses the same id).
- Copy only in `src/i18n/en/tv.ts` and `src/i18n/en/addTv.ts`.
- **Shared files** (one-line edits, so merges with the other lanes are trivial):
  - `src/services/services.tsx`: one `import type { TvSetup } from '@/core/tvSetup';` line and one
    `tv: TvSetup;` field in `Services`.
  - `src/services/createServices.ts`: one import block, one `const tvTransport = …` line, the
    `webos` entry in the default `drivers` array (replace the `createFakeDriver('webos')` line; if
    the array holds no webos entry, add one line), and one `tv: deps.tv ?? …` property.
  - `src/i18n/index.ts`: two import lines and two namespace entries (`tv`, `addTv`).
  - `app/device/[id].tsx`: the `tv` branch only, one line rendering `<TvScreen deviceId={id} />`.
  - `src/screens/device/DeviceSheet.tsx`: one import line and one line rendering
    `<TvLinkActions deviceId={deviceId} />` in "How it's connected" when the device is a TV.
  - `app.json` / `app.config.ts`: the iOS `NSLocalNetworkUsageDescription` entry and one
    `plugins` entry `./plugins/withVolumeKeys`.
  - `eslint.config.js`: add `app/dev/tv-spike.tsx` to the dev-spike override's `files` (create the
    override as in AR if it does not exist).
  - `package.json` / `bun.lock`: on a conflict take both sides and re-run `bun install`.
- Constructing services opens nothing: no socket, no UDP bind, no native call until first use.

## Review Focus

1. **A key press is never sent twice.** When the socket is down, `send` either writes the button
   or throws `notSent` within the `1500` ms connect budget. It never lets the hub's `2000` ms timeout
   fire for a press that was not written, so IR can take a volume press without a double. Test in
   Task 4.
2. **The TV's IP changes:** the driver finds it again by MAC and saves the new host. It never adopts
   another TV (a different MAC), even if that TV answers on the old address. Test in Task 4.
3. **The user taps "Deny" on the TV, or never sees the prompt:** the pair step ends with plain copy
   and "Try again" within `60` s. It never waits forever. Test in Task 2 (setup) and Task 8 (screen).
4. **The TV is off, or the phone is on another network:** the screen shows "The TV is off" or "Can't
   reach it" instead of a spinner. "Turn on" stops waiting after `20` s and explains "Turn on via
   Wi-Fi". Test in Task 6.
5. **Phone locked and unlocked mid-use:** the screen re-subscribes when the app returns to the
   foreground. Presses during the reconnect are written once or rejected with `notSent`, never
   queued and sent late. Test in Task 4 and Task 6.

---

### Task 1: SSAP protocol, transport interface and fake TV

**Files:**
- Create: `src/webos/transport.ts`, `src/webos/ssap.ts`, `src/webos/manifest.ts`,
  `src/webos/testing/fakeTv.ts`, `src/webos/testing/fakeLan.ts`.
- Test: `tests/webos/ssap.test.ts`, `tests/webos/fakeTv.test.ts`.

**Interfaces:**
- Consumes: `DeviceError` (foundation Task 3).
- Produces:

```ts
// transport.ts (pure types; implemented in Task 3, faked here)
export interface TvSocket { send(text: string): void; close(): void;
  onMessage(cb: (text: string) => void): void; onClose(cb: () => void): void }
export interface TvTransport {
  /** Rejects DeviceError('notSent') on refusal or after timeoutMs; 'notLocal' from assertLocal. */
  open(url: string, timeoutMs: number): Promise<TvSocket>;
  ssdpSearch(message: string, windowMs: number, onReply: (text: string, fromHost: string) => void): Promise<void>;
  probe(ports: number[], perHostMs: number, onOpen: (host: string, port: number) => void): Promise<void>;
  sendWol(packet: Uint8Array): Promise<void>;   // to the subnet broadcast, port 9
  onWifi(): Promise<boolean>;
}
// ssap.ts
export type SsapOut =
  | { type: 'register'; id: string; payload: { forcePairing: false; pairingType: 'PROMPT'; 'client-key'?: string; manifest: object } }
  | { type: 'request' | 'subscribe'; id: string; uri: string; payload?: object }
  | { type: 'unsubscribe'; id: string };
export type SsapIn =
  | { type: 'response'; id: string; payload: Record<string, unknown> }
  | { type: 'registered'; id: string; payload: { 'client-key': string } }
  | { type: 'error'; id: string; error: string; payload?: Record<string, unknown> };
export function encodeSsap(m: SsapOut): string;
export function decodeSsap(text: string): SsapIn | null;   // null for anything malformed
export const URI: { pointer: string; turnOff: string; insertText: string; volume: string;
  foreground: string; launchPoints: string; power: string; netInfo: string; launch: string };
export function buttonFrame(name: string): string;        // `type:button\nname:${name}\n\n`
export const KEY_BUTTON: Record<Exclude<TvKey, 'playPause' | 'input' | 'power'>, string>;
export function parseVolume(p: Record<string, unknown>): { volume?: number; muted?: boolean };
export function isPoweredOn(p: Record<string, unknown>): boolean | undefined;
export function parseMac(p: Record<string, unknown>): string | undefined;   // lower-case aa:bb:…
// testing/fakeTv.ts
export function createFakeTv(opts: { host: string; mac: string; secure?: boolean; usn?: string;
  prompt?: 'allow' | 'deny' | 'never'; knownKeys?: string[] }): FakeTv;
export interface FakeTv { host: string; mac: string; buttons: string[]; requests: { uri: string; payload?: object }[];
  setVolume(v: number, muted?: boolean): void; setApp(appId: string): void; setPower(on: boolean): void;
  drop(): void; stopAnswering(): void; moveTo(host: string): void; }
// testing/fakeLan.ts
export function createFakeLan(opts: { tvs: FakeTv[]; wifi?: boolean; hang?: string[] }): TvTransport & {
  wolPackets: Uint8Array[]; ssdpEnabled: boolean };
```

- URIs, exact: `ssap://com.webos.service.networkinput/getPointerInputSocket`, `ssap://system/turnOff`,
  `ssap://com.webos.service.ime/insertText`, `ssap://audio/getVolume`,
  `ssap://com.webos.applicationManager/getForegroundAppInfo`,
  `ssap://com.webos.applicationManager/listLaunchPoints`,
  `ssap://com.webos.service.tvpower/power/getPowerState`,
  `ssap://com.webos.service.connectionmanager/getinfo`, `ssap://system.launcher/launch`.
- `KEY_BUTTON`: up `UP`, down `DOWN`, left `LEFT`, right `RIGHT`, ok `ENTER`, back `BACK`, home `HOME`,
  mute `MUTE`, volumeUp `VOLUMEUP`, volumeDown `VOLUMEDOWN`.
- `manifest.ts`: the `manifest` object copied from `lgtv2`'s `lib/lgtv2.js`, with an MIT attribution
  comment naming `lgtv2` and its licence.
- The fake TV speaks the same SSAP as a real one: register (prompt per `opts.prompt`, then
  `registered` with a new key; a key in `knownKeys` registers silently), request and subscribe for
  every URI above, `socketPath` `ws://<host>:3000/resources/fake/netinput.pointer.sock`, and a
  pointer socket that records button names. `fakeLan.open` routes by host, rejects `notSent` for
  unknown hosts at once and for `hang` hosts after `timeoutMs`.

- [ ] **Step 1: Write the failing tests.**
  - `decodeSsap('{"type":"registered","id":"r0","payload":{"client-key":"k"}}')` returns that object;
    `decodeSsap('nope')` and `decodeSsap('{"type":"x"}')` return `null`.
  - `buttonFrame('UP') === 'type:button\nname:UP\n\n'`.
  - `parseVolume({volume:18,muted:false})` and `parseVolume({volumeStatus:{volume:18,muteStatus:false}})`
    both give `{volume:18,muted:false}` (older and newer firmware shapes).
  - `isPoweredOn({state:'Active'}) === true`, `isPoweredOn({state:'Screen Off'}) === true`,
    `isPoweredOn({state:'Active Standby'}) === false`, `isPoweredOn({}) === undefined`.
  - `parseMac({wifiInfo:{macAddress:'AA:BB:CC:00:11:22'}})` and the same under `wiredInfo` give
    `'aa:bb:cc:00:11:22'`.
  - fake TV: a register with `prompt:'allow'` yields a `response` with `pairingType:'PROMPT'`, then
    `registered`; with `'deny'` yields `error` `'403 User denied access'`; a pointer socket records
    `['UP']` after `buttonFrame('UP')`.
- [ ] **Step 2: Run it.** `bun run test tests/webos`. Expect FAIL (modules not found).
- [ ] **Step 3: Implement** the five files to the block above.
- [ ] **Step 4: Run it.** Expect PASS.
- [ ] **Step 5: Commit** `feat(webos): add SSAP messages, TV transport interface and fake TV`.

### Task 2: SSAP client and pairing

**Files:**
- Create: `src/webos/client.ts`, `src/webos/pair.ts`, `src/core/tvSetup.ts`.
- Test: `tests/webos/client.test.ts`, `tests/webos/pair.test.ts`.

**Interfaces:**
- Consumes: Task 1.
- Produces:

```ts
// client.ts
export class SsapClient {
  static connect(t: TvTransport, link: { host: string; secure: boolean }, timeoutMs: number): Promise<SsapClient>;
  register(clientKey: string | undefined, onPrompt: () => void, timeoutMs: number): Promise<string>; // resolves the key
  request(uri: string, payload?: object, timeoutMs?: number): Promise<Record<string, unknown>>;
  subscribe(uri: string, cb: (p: Record<string, unknown>) => void): Unsubscribe;
  button(name: string): Promise<void>;     // opens the pointer socket once, then reuses it
  onClose(cb: () => void): void;
  close(): void;
}
// core/tvSetup.ts (types the screens may import)
export interface FoundTv { host: string; name: string; secure: boolean; usn?: string }
export type PairErrorCode = 'denied' | 'timeout' | 'unreachable';
export class PairError extends Error { constructor(readonly code: PairErrorCode) }
export interface PairedTv { link: Extract<Link, { kind: 'webos' }>; suggestedName: string }
export interface TvSetup {
  discover(onFound: (tv: FoundTv) => void): Unsubscribe;          // Task 3
  probeHost(host: string): Promise<FoundTv | null>;                // Task 3; throws DeviceError('notLocal')
  pair(tv: FoundTv, onPrompt: () => void, clientKeyRef?: string): Promise<PairedTv>;
  findAgain(device: Device): Promise<string | null>;               // Task 4; the new host, or null
}
// pair.ts
export function pairTv(t: TvTransport, secrets: Pick<SecretStore, 'get' | 'set'>, tv: FoundTv,
  onPrompt: () => void, opts?: { clientKeyRef?: string; promptMs?: number /* 60000 */ }): Promise<PairedTv>;
```

- Requests carry ids `${prefix}_${n}`; a reply is matched by id; an `error` reply rejects with
  `DeviceError('notSent', error)`. `request` default timeout is `1500` ms, then `DeviceError('timeout')`.
- `pairTv` connects to `secure ? wss://host:3001 : ws://host:3000`, registers with `PROMPT`, stores
  the key under a new ref `webos:<random>` (or `opts.clientKeyRef` when re-pairing), stores
  `tv.usn` under `${ref}:usn`, reads the MAC from `URI.netInfo`, and suggests the SSDP name with a
  leading `[LG] ` removed, or `'LG TV'`.

- [ ] **Step 1: Write the failing tests** against `createFakeLan`:
  - `request resolves the matching reply only`: two requests in flight resolve with their own payloads.
  - `subscribe delivers every update until unsubscribed`: `setVolume(10)`, `setVolume(11)` → two
    callbacks; after unsubscribe, `setVolume(12)` → none, and an `unsubscribe` frame was sent.
  - `button reuses one pointer socket`: three `button()` calls → `buttons` `['UP','UP','ENTER']`,
    one `URI.pointer` request.
  - `pair allows`: `prompt:'allow'` → `onPrompt` called once; the result link is
    `{kind:'webos', host:'192.168.1.23', mac:'aa:bb:cc:00:11:22', secure:false, clientKeyRef}`; the
    secret store holds the key under `clientKeyRef`.
  - `pair denied`: rejects `PairError` code `'denied'`.
  - `pair times out`: `prompt:'never'`, advance `60000` ms → rejects code `'timeout'`.
  - `pair unreachable`: unknown host → rejects code `'unreachable'`.
  - `re-pair keeps the ref`: `clientKeyRef:'webos:abc'` → the result uses `'webos:abc'`.
- [ ] **Step 2: Run it.** `bun run test tests/webos/client.test.ts tests/webos/pair.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement** `client.ts`, `pair.ts` and `tvSetup.ts` to the block above.
- [ ] **Step 4: Run it.** Expect PASS.
- [ ] **Step 5: Commit** `feat(webos): add SSAP client and TV pairing`.

### Task 3: LAN transport, discovery and Wake-on-LAN

**Files:**
- Create: `src/webos/discovery.ts`, `src/webos/wol.ts`, `src/transport/netInfo.ts`,
  `src/transport/tvTransport.ts`.
- Test: `tests/webos/discovery.test.ts`, `tests/webos/wol.test.ts`, `tests/transport/tvTransport.test.ts`.

**Interfaces:**
- Consumes: Tasks 1–2; `assertLocal`, `isSubnetBroadcast`, `Prefix` (foundation Task 4).
- Produces:

```ts
// discovery.ts (pure)
export const SSDP_SEARCH: string;   // M-SEARCH * HTTP/1.1, HOST 239.255.255.250:1900, MAN "ssdp:discover", MX 2, ST urn:lge-com:service:webos-second-screen:1
export function parseSsdpReply(text: string, fromHost: string): FoundTv | null;
export function discoverTvs(t: TvTransport, onFound: (tv: FoundTv) => void,
  opts?: { ssdpMs?: number /* 3000 */; probeMs?: number /* 1500 */ }): Unsubscribe; // SSDP and probe, de-duplicated by host
export function probeHost(t: TvTransport, host: string): Promise<FoundTv | null>;
// wol.ts (pure)
export function magicPacket(mac: string): Uint8Array;   // 6 × 0xff then the MAC 16 times; 102 bytes
// transport/netInfo.ts
export function getOnLinkPrefixes(): Promise<Prefix[]>;  // expo-network IPv4 with bits 24; [] when not on Wi-Fi
export function subnetHosts(p: Prefix): string[];        // every host of an IPv4 /24, minus the phone itself
export function subnetBroadcast(p: Prefix): string;
// transport/tvTransport.ts
export function createRnTvTransport(deps?: { prefixes?: () => Promise<Prefix[]> }): TvTransport;
```

- `parseSsdpReply` accepts a reply only if its `ST` or `USN` contains
  `urn:lge-com:service:webos-second-screen:1`. It takes `usn` from `USN` up to `::`, and `name` from
  the URL-decoded `DLNADeviceName.lge.com` header, falling back to `'LG TV'`. `secure` is `false`
  from SSDP. The probe marks a host `secure: true` only when `3000` is closed and `3001` is open.
- `createRnTvTransport`: `open` parses the host from the URL and calls `assertLocal` before opening
  a `WebSocket`. `ssdpSearch`, `probe` and `sendWol` use `react-native-udp` (bind on demand, close
  after). The multicast target passes `isAllowedMulticast`, and the WoL target passes
  `isSubnetBroadcast`. `probe` opens `ws://host:port` and closes as soon as it opens.
- iOS uses the probe only (SSDP is skipped when `Platform.OS === 'ios'`, since the multicast
  entitlement is optional; spec §7).
- **Ruling:** the phone's prefix is taken as its IPv4 address with `/24`. `expo-network` gives no
  netmask, and home routers in India use `/24`. The Matter lane brings its own IPv6 prefixes.

- [ ] **Step 1: Write the failing tests.**
  - `parseSsdpReply` on a C4-style reply (`HTTP/1.1 200 OK`, `ST: urn:lge-com:service:webos-second-screen:1`,
    `USN: uuid:1234::urn:lge-com:…`, `DLNADeviceName.lge.com: %5BLG%5D%20webOS%20TV%20OLED55C4`) →
    `{host:'192.168.1.23', name:'webOS TV OLED55C4', secure:false, usn:'uuid:1234'}`; a Roku reply
    → `null`.
  - `discoverTvs` with SSDP and the probe both finding `192.168.1.23` → `onFound` called once.
  - `magicPacket('aa:bb:cc:00:11:22')` has length 102, bytes 0–5 are `0xff`, bytes 6–11 are the
    MAC, and the last 6 bytes are the MAC; `magicPacket('nope')` throws `DeviceError('unsupported')`.
  - `subnetHosts({address:'192.168.1.7',bits:24})` has 253 entries, excluding `.0`, `.7` and `.255`;
    `subnetBroadcast` gives `'192.168.1.255'`.
  - `tvTransport.open('ws://8.8.8.8:3000', 1500)` rejects with code `notLocal`, and no `WebSocket`
    is constructed (mock the global).
- [ ] **Step 2: Run it.** `bun run test tests/webos/discovery.test.ts tests/webos/wol.test.ts tests/transport/tvTransport.test.ts`.
  Expect FAIL.
- [ ] **Step 3: Implement.** Run `bunx expo install expo-network` and `bun add react-native-udp`.
  If importing `react-native-udp` breaks existing Jest suites, add a `jest.mock('react-native-udp')`
  line to the Jest setup file. This lane is the only one that touches that line.
- [ ] **Step 4: Run it.** Expect PASS, with `src/transport` coverage at least 80% (the RN glue is
  covered through mocked `WebSocket` and udp).
- [ ] **Step 5: Commit** `feat(transport): add TV LAN transport, SSDP, subnet probe and Wake-on-LAN`.

### Task 4: The `webos` link driver

**Files:**
- Create: `src/webos/driver.ts`, `src/webos/rediscover.ts`.
- Test: `tests/webos/driver.test.ts`.

**Interfaces:**
- Consumes: Tasks 1–3; `LinkDriver`, `Reported`, `DeviceError` (foundation).
- Produces:

```ts
export interface WebosDriverOpts {
  transport: TvTransport;
  secrets: Pick<SecretStore, 'get' | 'set'>;
  onHostChanged(deviceId: string, host: string): Promise<void>;
  connectMs?: number; heartbeatMs?: number; heartbeatTimeoutMs?: number;
  reconnectMs?: number[]; idleCloseMs?: number /* 10000 */;
}
export function createWebosDriver(o: WebosDriverOpts): LinkDriver & { kind: 'webos' };
export function rediscover(t: TvTransport, secrets: Pick<SecretStore, 'get'>, link: Extract<Link, { kind: 'webos' }>,
  opts?: { maxCandidates?: number /* 3 */ }): Promise<string | null>;
```

- `available()` is `true`. `capabilities()` is `{}`.
- `supports`: every `tv.key` and `tv.text`; `tv.powerOn` only when `link.mac` is set **and** the
  device has no `ir` link. With IR on the phone, power-on goes over IR, the reliable path (spec §6
  "Power-on", mockup "TV off").
- `send`:
  - `tv.key` uses `client.button(KEY_BUTTON[key])`, except `power` (`URI.turnOff`), `input`
    (`URI.launch` with `{id:'com.webos.app.inputpicker'}`) and `playPause`, which alternates
    `PAUSE` and `PLAY` per device, starting with `PAUSE`.
  - `tv.text` sends `URI.insertText` with `{text, replace: true}`. The keyboard sheet mirrors the
    TV's field.
  - `tv.powerOn` sends `magicPacket(link.mac)`.
  - With no open connection, the driver connects within `connectMs` (1500) or throws `notSent`.
    A missing client key throws `notPaired`.
- `observe`: connects and subscribes to `URI.power`, `URI.volume` and `URI.foreground`. It emits
  `{kind:'tv', state:{power, app, volume, muted}}`. `app` is the launch-point title for the appId
  (one `URI.launchPoints` per connection).
  - Heartbeat: a `URI.power` request every `heartbeatMs`. No reply within `heartbeatTimeoutMs` →
    close and reconnect with `reconnectMs` backoff. Observers see no error.
  - The connection closes `idleCloseMs` after the last observer leaves.
- When the saved host fails:
  - not on Wi-Fi (`transport.onWifi()` false) → emit nothing, keep retrying;
  - on Wi-Fi → run `rediscover`. On a match, call `onHostChanged(deviceId, newHost)`, reconnect and
    emit the real state.
  - With no LG reply to SSDP within `3000` ms, emit `{kind:'tv', state:{power:false}}` while the
    probe keeps looking. The TV leaves Wi-Fi when it is off.
- `rediscover` gathers candidates through `discoverTvs`, preferring a USN equal to the stored
  `${clientKeyRef}:usn`. For at most `maxCandidates`, it registers with the stored key. A reply that
  is a prompt instead of `registered` means "another TV": close and skip it. Accept a candidate only
  when `parseMac(getinfo)` equals `link.mac`.

- [ ] **Step 1: Write the failing tests** (fake LAN with fake timers):
  - `sends keys as pointer buttons`: each of `up down left right ok back home mute volumeUp volumeDown`
    → the matching `KEY_BUTTON` name.
  - `power turns off over SSAP`; `input launches the input picker`; `playPause alternates PAUSE, PLAY`.
  - `text replaces the field`: `tv.text 'tom'` → request `insertText` `{text:'tom',replace:true}`.
  - `observe reports power, app title and volume`: `setApp('netflix')` with a launch point titled
    `'Netflix'`, `setVolume(18)` → last report `{kind:'tv',state:{power:true,app:'Netflix',volume:18,muted:false}}`.
  - `heartbeat reconnects silently`: `stopAnswering()`, advance `8000` ms → a new socket opens, the
    observer gets no error, and later reports still arrive.
  - `reconnects after a drop`: `drop()` → reconnected within `250` ms of fake time.
  - `notSent within the connect budget` (Review Focus 1): TV host in `hang`, send `tv.key volumeUp`
    → rejects `notSent` at `1500` ms, before `2000`, and nothing was written.
  - `no late presses` (Review Focus 5): `drop()`, send `tv.key ok` while reconnecting, and the
    reconnect fails → rejects `notSent`; after the TV is back, `buttons` has no `ENTER`.
  - `rediscovers by MAC` (Review Focus 2): the TV `moveTo('192.168.1.40')` → `onHostChanged(id,'192.168.1.40')`
    called once, and the next key reaches the TV.
  - `never adopts another TV`: the old host now serves a fake TV with another MAC (`prompt:'never'`)
    and the real TV is gone → `onHostChanged` not called; the other TV's `buttons` stays empty.
  - `TV off`: on Wi-Fi with no TV anywhere → after `3000` ms the observer gets `{power:false}`.
  - `off network`: `wifi:false` → no `{power:false}` report.
  - `powerOn sends WoL`: device `[webos(mac)]` → one packet equal to `magicPacket(mac)`;
    `supports(powerOn)` is `false` for `[webos(mac), ir]` and for a link without `mac`.
  - `not paired`: no key in secrets → send rejects `notPaired`.
- [ ] **Step 2: Run it.** `bun run test tests/webos/driver.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement** `driver.ts` and `rediscover.ts`. Keep one connection per device. A
  per-device promise chain orders connects, so a press never opens a second socket.
- [ ] **Step 4: Run it.** Expect PASS, with `src/webos` coverage at least 80%.
- [ ] **Step 5: Commit** `feat(webos): add webos link driver with heartbeat, reconnect and rediscovery`.

### Task 5: Wiring, spike screen and TV hardware spike (gate)

**Files:**
- Create: `src/webos/setup.ts`, `app/dev/tv-spike.tsx`, `docs/spike/tv-results.md`.
- Modify (shared, see Global Constraints): `src/services/services.tsx`,
  `src/services/createServices.ts`, `app.json`/`app.config.ts` (iOS local network string),
  `eslint.config.js`.
- Test: `tests/services/tvServices.test.ts`.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `createTvSetup(o: { transport: TvTransport; secrets: SecretStore }): TvSetup` in `src/webos/setup.ts`;
  - `services.tv: TvSetup`;
  - the real `webos` driver in `services.drivers`. Its `onHostChanged` reads the device from
    `store`, replaces the webos link's `host`, and calls `store.upsertDevice`.

- iOS `NSLocalNetworkUsageDescription`: "One Remote finds and controls your TV on your home Wi-Fi."
- The spike screen is dev-only (it redirects to `/` unless `__DEV__`) and drives `services.tv` and
  the hub directly. It has: Discover (lists hits with timings); Pair; keys; a 100-step "touchpad
  burst" (100 `right`/`left` presses as fast as the hub accepts, with the elapsed time shown); Text
  "hello"; Input; Play/Pause; WoL; and a live log of every SSAP frame in and out.

- [ ] **Step 1: Write the failing test:**
  - `createServices()` with a fake `tvTransport` gives `services.tv`, and a `webos` driver in
    `drivers`;
  - building it calls no transport method;
  - `onHostChanged('tv1','192.168.1.40')` updates the stored device's link host.
- [ ] **Step 2: Run it.** `bun run test tests/services/tvServices.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement** the wiring and the spike screen.
- [ ] **Step 4: Run it.** Expect PASS. Then `bun run typecheck && bun run lint && bun run test`.
- [ ] **Step 5: Commit** `feat(tv): wire webos driver and TV setup into services, add TV spike screen`.
- [ ] **Step 6 (author, on hardware):** Build Android (`bunx expo prebuild --clean && bunx expo run:android`
  on the iQOO and the S21 FE) and iPhone (on the Mac: `bun install && bunx expo run:ios --device`).
  On each phone, run the spec §8 pass bar:
  - pair with the C4;
  - 100 touchpad moves with no visible lag;
  - lock and unlock the phone 10 times, reconnecting within 1 s each time;
  - change the TV's IP (DHCP reservation or router reboot) and recover by itself;
  - power on from off over Wake-on-LAN, with "Turn on via Wi-Fi" on.
  - Power-on over IR is checked once `lane/ir` is merged (IR lane Task 6 records it).
- [ ] **Step 7: Record** in `docs/spike/tv-results.md`:
  - phones and OS versions, and the C4 firmware;
  - which port answered (3000 or 3001), and whether React Native's `WebSocket` accepted `wss://3001`;
  - whether `react-native-udp` built under the new architecture, and whether SSDP replied on
    Android;
  - the C4's SSDP headers;
  - whether the `getinfo` MAC matched the TV's settings;
  - whether the input picker opened, whether `insertText` `replace:true` replaced the field, and
    whether `PAUSE`/`PLAY` worked;
  - reconnect times, and the result against each pass-bar line.

  Commit `docs(spike): record TV hardware results`.

**Gate:**
- **`wss://3001` only, and `WebSocket` rejects the TV's self-signed certificate:** add a task before
  Task 6. It is a local Expo module `modules/lan-socket` (OkHttp on Android, `URLSessionWebSocketTask`
  on iOS). It implements `TvSocket` and pins the certificate's SHA-256 seen at pairing
  (trust on first use). The pin is stored under `${clientKeyRef}:cert`.
- **`react-native-udp` fails to build:** the same module gains `udpSend` and `udpListen`, behind the
  same `TvTransport`.
- **Reconnect over 1 s:** tune the Task 4 timings and retest.

Tasks 6–8 use fakes and can run in parallel with the hardware run.

### Task 6: TV screen

**Files:**
- Create: `src/screens/tv/{TvScreen,TouchPad,DPad,VolumeRocker,KeyboardSheet,TvOffPanel,UnreachablePanel}.tsx`,
  `src/screens/tv/touchpad.ts`, `src/screens/tv/tvMode.ts`,
  `src/screens/tv/pressFeedback.ts`, `src/i18n/en/tv.ts`.
- Modify (shared): `app/device/[id].tsx` (the `tv` branch), `src/i18n/index.ts`.
- Test: `tests/screens/tv/touchpad.test.ts`, `tests/screens/tv/tvMode.test.ts`, `tests/screens/tv/tvScreen.test.tsx`.

**Interfaces:**
- Consumes: `useServices()` (`hub`, `prefs`), `DeviceView`, `DeviceSheet`.
- Produces:

```ts
// touchpad.ts (pure)
export interface TouchpadOpts { stepPx: number /* 48 */; tapSlopPx: number /* 10 */; tapMs: number /* 250 */;
  holdMs: number /* 400 */; repeatMs: number /* 120 */ }
export function createTouchpad(o?: Partial<TouchpadOpts>): {
  start(x: number, y: number, t: number): void;
  move(x: number, y: number, t: number): TvKey[];   // one key per stepPx along the dominant axis
  tick(t: number): TvKey[];                          // hold after a swipe repeats the last key
  end(x: number, y: number, t: number): TvKey[];     // ['ok'] for a tap
};
// tvMode.ts (pure)
export type TvMode = 'ready' | 'connecting' | 'off' | 'waking' | 'wakeFailed' | 'unreachable';
export function tvMode(v: DeviceView, env: { onWifi: boolean; openedAt: number; wakeSentAt?: number; now: number }): TvMode;
export function TvScreen(props: { deviceId: string }): React.JSX.Element;
```

- `tvMode` rules, in order:
  - `!onWifi` → `unreachable`;
  - reported `power: true` → `ready`;
  - `wakeSentAt` set and `now - wakeSentAt < 20000` → `waking`; `wakeSentAt` set and later →
    `wakeFailed`;
  - reported `power: false` → `off`;
  - no report and `now - openedAt < 5000` → `connecting`, with the pad usable;
  - otherwise → `unreachable`.
- Layout to mockup v3 "TV" and "TV, D-pad":
  - the header has ‹, the name, the status line, ⏻ and ⋯ (opens `DeviceSheet`);
  - a Touchpad / D-pad segment, with the choice saved by
    `prefs.set({ tvPad: { ...prefs.get().tvPad, [deviceId]: mode } })` (default `'touchpad'`);
  - the pad;
  - the volume rocker (＋ VOL －);
  - a row with ↩ Back, ⌂ Home and Mute;
  - a row with ⌨ Keyboard, ⇄ Input and ▶❚❚.
- The touchpad hint is "Swipe to move · Tap to select". The two-finger hint is dropped (spec §6).
- The screen subscribes through `hub.subscribe(deviceId)` while focused and the app is `active`. It
  unsubscribes on blur or background and re-subscribes on `active` (Review Focus 5).
- `pressFeedback()` calls `Haptics.selectionAsync()` when `prefs.get().haptics`.
- Keyboard sheet: a text field. Each change, debounced `300` ms, sends `tv.text` with the whole
  field. "Done" closes the sheet.
- Status line copy, `tv.*`: "Wi-Fi · connected", "Connecting…", "Sent over IR". The last one shows
  when `status.fellBack` and `via === 'ir'`.
- Error panels, copy from mockup v4:
  - **Off:** "The TV is off", "Tap power to turn it on.", "⏻ Turn on", "Uses IR on this phone, or
    Wi-Fi wake if the TV allows it". "Turn on" sends `tv.powerOn` and sets `wakeSentAt`.
  - **wakeFailed:** "Didn't turn on? On the TV, turn on Settings › General › Devices › TV Management
    › Turn on via Wi-Fi, or use the TV's remote once."
  - **Unreachable:** "Can't reach it", "Not on the same Wi-Fi as the TV, or the TV's address
    changed. Looking again…", with the buttons "Wi-Fi settings" (`Linking.sendIntent`
    `android.settings.WIFI_SETTINGS` on Android, `Linking.openSettings()` on iOS) and "Find TV
    again" (`services.tv.findAgain(device)`).
- Send errors map to one line: `notSent` "Can't reach the TV right now", `timeout` "The TV didn't
  answer", `notPaired` "Pair the TV again from ⋯".

- [ ] **Step 1: Write the failing tests.**
  - touchpad:
    - a 100 px right move → `['right','right']`;
    - a 60 px up, 20 px right move → `['up']`;
    - a tap (4 px in 100 ms) → `['ok']`;
    - a swipe that holds still for `400` ms, then `tick` at +120 ms and +240 ms → two more of the
      last key;
    - a slow 8 px move over `600` ms → `[]` (not a tap).
  - `tvMode`:
    - every rule above, one case each;
    - `wakeSentAt: 0, now: 20001` → `wakeFailed` (Review Focus 4).
  - screen, with fake services and a fake `webos` driver:
    - opens on the touchpad;
    - choosing D-pad calls `prefs.set` with `tvPad: {tv1:'dpad'}`, and a re-render for `tv1` opens
      on the D-pad while `tv2` opens on the touchpad;
    - ▲ sends `tv.key up`, OK sends `ok`, and the rocker sends `volumeUp` and `volumeDown`;
    - typing "tom" in the keyboard sheet, then advancing `300` ms → one `tv.text` `'tom'`;
    - a reported `power:false` → "The TV is off"; "Turn on" sends `tv.powerOn`; advancing `20000` ms
      with no report → the "Turn on via Wi-Fi" hint;
    - `onWifi:false` → "Can't reach it", and "Find TV again" calls `tv.findAgain`;
    - a status with `fellBack:true, via:'ir'` → "Sent over IR";
    - the app going to the background unsubscribes, and returning to `active` re-subscribes.
- [ ] **Step 2: Run it.** `bun run test tests/screens/tv`. Expect FAIL.
- [ ] **Step 3: Implement** the screen to the mockups. Use `react-native-gesture-handler` `Gesture.Pan()`
  feeding `createTouchpad`. All copy goes in `src/i18n/en/tv.ts`.
- [ ] **Step 4: Run it.** Expect PASS.
- [ ] **Step 5: Commit** `feat(tv): add TV remote screen with touchpad, D-pad and error states`.

### Task 7: Android volume keys

**Files:**
- Create: `modules/volume-keys/{expo-module.config.json,index.ts}`,
  `modules/volume-keys/android/src/main/java/expo/modules/volumekeys/VolumeKeysModule.kt`,
  `plugins/withVolumeKeys.js`, `src/screens/tv/useVolumeKeys.ts`.
- Modify (shared): the `plugins` entry in `app.json`/`app.config.ts`.
- Test: `tests/screens/tv/useVolumeKeys.test.tsx`, `tests/plugins/withVolumeKeys.test.ts`.

**Interfaces:**
- Produces:
  - the module (Android only, loaded with `requireOptionalNativeModule('VolumeKeys')`, so it is
    `null` on iOS and in Jest): `setEnabled(on: boolean): void`, and the event
    `onVolumeKey: { direction: 'up' | 'down' }`;
  - `useVolumeKeys(deviceId: string, active: boolean): void`. It enables the module only when
    `Platform.OS === 'android' && prefs.get().volumeKeys && active`, maps `up`/`down` to `tv.key
    volumeUp`/`volumeDown`, and disables on cleanup.
- `withVolumeKeys` injects into `MainActivity.kt` an override of `dispatchKeyEvent` that calls
  `expo.modules.volumekeys.VolumeKeys.handle(event)`. It returns `true` (consumed) only while
  enabled and only for `KEYCODE_VOLUME_UP`/`KEYCODE_VOLUME_DOWN` `ACTION_DOWN` (repeats included),
  so the system volume does not change while the TV screen is open.

- [ ] **Step 1: Write the failing tests:**
  - with a mocked module on Android, `volumeKeys: true` and `active` → `setEnabled(true)`, and an
    `up` event sends `tv.key volumeUp`;
  - with `volumeKeys: false` → `setEnabled` never `true`;
  - with `Platform.OS = 'ios'` → no module call;
  - unmount → `setEnabled(false)`;
  - the plugin run on a fixture `MainActivity.kt` adds exactly one `dispatchKeyEvent` override, and
    running it twice still leaves one.
- [ ] **Step 2: Run it.** `bun run test tests/screens/tv/useVolumeKeys.test.tsx tests/plugins/withVolumeKeys.test.ts`.
  Expect FAIL.
- [ ] **Step 3: Implement** the module, the plugin and the hook. Call the hook from `TvScreen`.
- [ ] **Step 4: Run it.** Expect PASS. On the iQOO dev build, the volume keys change the TV volume
  only while the TV screen is open.
- [ ] **Step 5: Commit** `feat(tv): control TV volume with the phone's volume keys on Android`.

### Task 8: Add TV flow and TV link actions

**Files:**
- Create: `src/screens/add/tv/{AddTvFlow,TvBrandStep,FindTvStep,ManualIpStep,PairTvStep}.tsx`,
  `src/screens/tv/TvLinkActions.tsx`, `src/i18n/en/addTv.ts`.
- Modify (shared): `app/add/tv.tsx` (replace the placeholder with `<AddTvFlow />`),
  `src/screens/device/DeviceSheet.tsx` (one import, one line), `src/i18n/index.ts`.
- Test: `tests/screens/add/addTv.test.tsx`, `tests/screens/tv/tvLinkActions.test.tsx`.

**Interfaces:**
- Consumes: `services.tv` (`TvSetup`), `services.store`, `services.drivers`, and
  `NameRoomStep({ draft, suggestedName, onDone })`.
- Produces: `AddTvFlow(): React.JSX.Element` and `TvLinkActions({ deviceId }): React.JSX.Element | null`.

- Flow (mockup v4 "Add a TV"): brand → find → pair → `NameRoomStep`.
  - **Brand:** "LG", "webOS TVs, 2014 and later"; a disabled row "Samsung, Sony, Google TV…",
    "Not yet supported".
  - **Find:** "Looking for your TV", "On this Wi-Fi", "Turn the TV on and keep the phone on the same
    Wi-Fi as the TV.", rows as `discover` finds them, "Still looking…", and the link "Can't find it?
    Enter the TV's IP address". Discovery stops on leaving the step.
  - **Manual IP:**
    - IPv4 dotted quad only;
    - an invalid address → "That isn't an IP address";
    - `notLocal` → "That address isn't on your home network";
    - `probeHost` null → "No LG TV answered at that address".
  - **Pair:** "Check your TV", "Press "Allow" on the TV", "A prompt is showing on the TV screen. Use
    the TV's own remote to accept it. You only do this once.", "Waiting… (60 s)" counting down,
    and "Prompt didn't show? Try again". `denied` → "The TV said no. Try again and choose Allow.";
    `timeout` → the same "Try again".
  - **Draft:** `{ kind: 'tv', links: [webosLink] }`, plus `{ kind: 'ir', remoteId: 'lg-tv/nec' }`
    appended when the `ir` driver in `services.drivers` is `available()`.
  - **Duplicate:** a stored TV whose webos link has the same `mac` → "This TV is already added as
    {name}" and "Open it", which goes to `/device/<id>`. Nothing is saved.
- `TvLinkActions` renders for a TV only:
  - "TV address" with the host;
  - "Find TV again", which calls `findAgain` and saves a new host through `store.upsertDevice`;
  - "Pair again", which runs `pair` with the existing `clientKeyRef`.

- [ ] **Step 1: Write the failing tests** (fake `TvSetup`):
  - LG is tappable and the "Not yet supported" row is disabled;
  - found TVs appear as `discover` emits them, and tapping one shows the pair step;
  - manual `'300.1.1.1'` → "That isn't an IP address"; `'8.8.8.8'` (setup throws `notLocal`) →
    "That address isn't on your home network";
  - pair `denied` → "The TV said no…", and "Try again" calls `pair` a second time;
  - pair succeeds on a phone with IR → `NameRoomStep` gets a draft with links `[webos, ir 'lg-tv/nec']`
    and `suggestedName` from setup; on a phone without IR, links are `[webos]`;
  - the same MAC already stored → "This TV is already added as LG OLED C4", and no device is saved;
  - `TvLinkActions` shows `192.168.1.23`; "Find TV again" returning `'192.168.1.40'` saves the new
    host.
- [ ] **Step 2: Run it.** `bun run test tests/screens/add/addTv.test.tsx tests/screens/tv/tvLinkActions.test.tsx`.
  Expect FAIL.
- [ ] **Step 3: Implement** to mockup v4.
- [ ] **Step 4: Run it.** Expect PASS. Then `bun run typecheck && bun run lint && bun run test --coverage`,
  all green.
- [ ] **Step 5: Commit** `feat(tv): add Add TV flow and TV connection actions`.
- [ ] **Step 6: Smoke-test** on the iQOO with the C4: add the TV from the welcome screen, use the
  touchpad, and switch to D-pad, leave and return (the D-pad is remembered). Report; do not push.
