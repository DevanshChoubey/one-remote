# Android TV / Google TV Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pair with and control every Android TV and Google TV (and Android TV boxes such as the
author's Airtel Xstream) through the existing remote, using Google's "Android TV Remote Service" v2.

**Architecture:**

- A new pure-TypeScript folder `src/androidtv`, shaped like `src/webos`: a protobuf codec, the
  pairing handshake on port 6467, a remote-session client on port 6466, discovery, rediscovery, a
  `BrandSetup` and a `LinkDriver`, plus a fake TV in `src/androidtv/testing`.
- All bytes go through the `TvTransport` stream, mDNS and identity features that `lane/tv-core`
  adds. This lane adds no native code.
- The phone has one client identity (`certRef = 'androidtv:identity'`) for every Android TV. The
  TV's certificate SHA-256 is pinned in the link.

**Tech Stack:** Expo SDK 58 and TypeScript, Jest, Bun. `@noble/hashes@1.8.0` (MIT, pure JS) for
SHA-256.

**Spec:** `docs/superpowers/specs/2026-11-01-every-tv-design.md` (§2 goal 1.1, §5.1–5.6, §6, §7 and
§8 item 2). Protocol facts: `docs/research/2026-11-01-tv-protocols.md` §1. It builds on
`docs/superpowers/plans/2026-11-01-tv-core.md`, which must be merged first. Its Interfaces blocks are
consumed here unchanged.

## Global Constraints

- **Toolchain:** Bun only (`bun install`, `bunx`, `bun run`); never npm, yarn or pnpm.
- **Git:**
  - Commit as `Devansh Choubey <devanshc13@gmail.com>`, with Conventional Commits.
  - End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Never `merge:` as a type. Never push.
- **Purity:** `src/core`, `src/device`, `src/tv`, `src/webos` (and later `src/androidtv` and
  `src/samsung`) are pure TypeScript, with no React Native or Expo imports. ESLint enforces this; add
  `src/tv` to that rule.
- **Networking:**
  - Only `src/transport` imports `modules/lan-socket`. `fetch` and `XMLHttpRequest` stay banned.
  - Every outgoing address is a literal private, link-local or loopback IP, checked in native code
    before dialling (`LocalHost.isLocalLiteral` on Android, and its Swift twin).
- **TLS:**
  - It is trust-on-first-use: `pairing: true` accepts and reports the leaf certificate's SHA-256.
  - `pinSha256` accepts only that certificate. Neither means refused.
  - Private keys never cross into JavaScript.
- **Tests:**
  - Existing tests may be edited for renames and moves. What they check must not get weaker.
  - `bun run test`, `bun run lint` and `bun run typecheck` stay green after every task.
- **UI:** the UI is fixed. Only the changes in spec §6 are allowed, and they are built from `@/ui`
  primitives and `t()` strings in `src/i18n/en`.

## Lane Constraints

- Work in the `lane/androidtv` worktree. It merges to `main` only on the author's go-ahead.
- `src/androidtv` imports only `@/core`, `@/tv` and its own files. Its transport is
  `AtvTransport` (Task 2), a `Pick` of `TvTransport`.
- **Licence:** the messages and the code check follow `tronikos/androidtvremote2` (Apache-2.0).
  The repo root gets a `NOTICE` file (Task 3). Nothing from LGPL code.
- **Frozen from tv-core**, consumed exactly as written there:
  - `BrandSetup`, `createCompositeTvSetup`;
  - `TvLink` `{ kind: 'androidtv'; host; mac?; certRef; pinSha256 }`;
  - `TvCaps`, `PairPrompts.askCode`;
  - `TvTransport.openStream`, `mdnsBrowse`, `ensureIdentity`, `deleteIdentity`;
  - `magicPacket`, `tvHostChanged`.

## Plan calls (rulings on the spec)

1. **Code check bytes.** Research §1 says "ASCII bytes of `hex(...)`". The reference
   (`pairing.py`) hashes `bytes.fromhex(...)` of each string, and so does AOSP's polo. So this plan
   hashes **the bytes the hex strings decode to**. The `"0"` before the exponent hex makes
   `10001` even-length (`01 00 01`). The test vector in Task 3 pins this. The ASCII reading gives
   another first byte (`DD`), and the tests reject it.
2. **Finding the TV again: by certificate pin; MAC from the certificate subject.** The TV's MAC is
   in its certificate's subject (androidtvremote2 `async_get_name_and_mac`: the last `/` part of
   the CN). tv-core's stream result carries `serverSubject`, so pairing parses the MAC from it into
   `link.mac` when the CN has one (the Task 1 spike records whether the Airtel box's CN does), and WoL
   can use it. Rediscovery takes candidates from mDNS and the 6466 probe, and accepts the one that
   completes TLS against `link.pinSha256`. That is stricter than a MAC match: each TV has its own
   self-signed certificate. Duplicates are caught by MAC, or else by the same pin (Task 9).
3. **Turn on.** `tv.powerOn` sends `KEYCODE_POWER` only when the session is up and the last
   `remote_start` said `started: false`. If the TV is already on, nothing is sent (power is a
   toggle). Otherwise WoL is used when there is a MAC, and else the send fails `notSent`.
   `TvCaps.powerOn` is `!!link.mac || hasIr || answersWhenOff`. `answersWhenOff` is set once this
   run sees a live session report `started: false`.
4. **Volume level.** `TvState.volume = Math.round(100 * level / max)`, left out when `max` is 0.
   `muted` comes from the TV as it is.
5. **App.** `app_package` from `remote_ime_key_inject` is mapped to a title through a small table
   (Task 5). An unknown package is left out, as LG does with unknown ids. No guessed names.
6. **Test vector source.** Spec §7 asks for a vector "taken from the reference implementation".
   The reference publishes none, so Task 3's vector is computed with the reference's exact
   statements. The Python snippet is in Task 3, so anyone can derive it again.

## Review Focus

1. **Typing with no text field open on the TV.** `tv.text` must fail at once with
   `DeviceError('notSent', 'No text field is open on the TV')`, and never hang or queue. Test in
   Task 8.
2. **Turn on while the TV is already on.** No `KEYCODE_POWER` may be sent, because that would turn
   it off. Test in Task 8.
3. **Bytes split or merged across `data` events, or a garbage length prefix.** Frames must come out
   whole and in order. A length over 65536 closes the stream (the driver then reconnects), with no
   crash and no unbounded buffer. Test in Task 2.
4. **The code typed in lower case, with spaces, or with a non-hex letter.** `" 2a 3a7f "` must pair.
   `"2A3A7G"` must call `askCode(true)` again without sending anything to the TV. Test in Task 6.
5. **Two Android TVs in one home.** Removing one keeps the shared identity for the other. An IP
   change never lands on the other TV, because rediscovery goes by pin. Test in Tasks 7 and 8.

---

### Task 1: Hardware spike on the Airtel Xstream box (throwaway)

**Files:**

- Modify: `app/dev/tv-spike.tsx` (an "Android TV" block; it is already in `DEV_SPIKE_FILES`).
- Modify: `docs/spike/tv-results.md` (new section "Android TV spike (Airtel Xstream)").

**Interfaces:**

- Consumes, from tv-core Tasks 5, 7 and 8, through `createRnTvTransport()` (`@/transport/tvTransport`):
  - `mdnsBrowse('_androidtvremote2._tcp', windowMs, onService)`;
  - `probe(ports, perHostMs, onOpen)`;
  - `ensureIdentity(ref, commonName)` and `deleteIdentity(ref)`;
  - `openStream(host, port, timeoutMs, { pairing: true, identity })`.
- Produces: nothing that later tasks build on (the buttons stay dev-only).

- [ ] **Step 1:** Add the block to the spike screen:
  - a host `Input`, filled from the last mDNS hit;
  - the buttons below, each one logging a single line through `add()`:

  | Button | Does | Logs |
  | --- | --- | --- |
  | ATV browse | `mdnsBrowse` for 5000 ms | `mdns <name> <host>:<port> txt=<json>` per service |
  | ATV probe | `probe([6466, 6467], 1500)` | `open <host>:<port>` |
  | ATV TLS 6467 | `ensureIdentity('androidtv:spike', 'One Remote spike')`, then `openStream(host, 6467, 3000, {pairing: true, identity: 'androidtv:spike'})` | `6467 cert=<sha> mod=<len> exp=<hex>`, or the error code |
  | ATV TLS 6466 | the same on 6466, kept open 3 s | `6466 cert=<sha>` plus `closed after <ms>` if a `close` event comes, or the error |
  | ATV forget | `deleteIdentity('androidtv:spike')` | `identity deleted` |

- [ ] **Step 2:** Run `bun run lint && bun run typecheck`. Expected: green.
- [ ] **Step 3:** Get the box ready:
  - the box is on (not standby) and on the same Wi-Fi as the Realme X;
  - Settings › Apps › See all apps › Show system apps lists "Android TV Remote Service". Record its
    version: v2 needs version 5 or later.
  - If it is missing or older, ask the author to install or update it from the Play Store on the
    box. Do not do it yourself.
- [ ] **Step 4:** Cross-check from the laptop, on the same Wi-Fi:
  - `avahi-browse -rt _androidtvremote2._tcp`;
  - `openssl s_client -connect <ip>:6467 </dev/null 2>/dev/null | openssl x509 -noout -subject -fingerprint -sha256`.

  Record the subject. It shows whether the CN carries the MAC (plan call 2).
- [ ] **Step 5:** Build and run on the phone (`bunx expo run:android`). Open the dev screen and press
  the buttons in order: browse, probe, TLS 6467, TLS 6466, forget. Record in
  `docs/spike/tv-results.md`:
  - each log line;
  - whether the 6466 and 6467 certificate SHA-256 values are equal;
  - what an unpaired identity gets on 6466: an error code, or a `close` after N ms. Task 4's fake
    copies this behaviour.
- [ ] **Step 6: Go / no-go** (spec §7):
  - **Go:** TLS 6467 completes and reports a modulus. This holds even if mDNS shows nothing, since
    the 6466 probe is the fallback.
  - **No-go:** no Remote Service, or 6466/6467 don't answer.
    - Write "Android TV: untested on hardware (Airtel box failed the spike: <reason>)" in
      `tv-results.md`.
    - Continue with Tasks 2–9 on the fakes.
    - Tell the author, and ask which other Google TV or Android TV device can be used (spec §9).
- [ ] **Step 7:** Commit: `docs(spike): Android TV reachability on the Airtel box`.

### Task 2: Protobuf framing and the message codec

**Files:**

- Create: `src/androidtv/proto.ts`, `src/androidtv/messages.ts`, `src/androidtv/constants.ts`.
- Modify: `eslint.config.js` (add `'androidtv'` to `SERVICE_MODULES`, `DOMAIN_FOLDERS`,
  `PURE_FOLDERS` and the purity message).
- Test: `tests/androidtv/proto.test.ts`, `tests/androidtv/messages.test.ts`.

**Interfaces:**

- Produces:

  ```ts
  // constants.ts
  export const PAIR_PORT = 6467, REMOTE_PORT = 6466;
  export const SERVICE_TYPE = '_androidtvremote2._tcp';
  export const CERT_REF = 'androidtv:identity';
  export const CLIENT_NAME = 'One Remote';
  export const DEFAULT_NAME = 'Android TV';
  /** PING|KEY|IME|POWER|VOLUME = 1+2+4+32+64. No VOICE, APP_LINK (non-goals). */
  export const FEATURES = 103;
  export type AtvTransport = Pick<TvTransport,
    'openStream' | 'mdnsBrowse' | 'probe' | 'sendWol' | 'onWifi' | 'ensureIdentity' | 'deleteIdentity'>;

  // proto.ts
  export class ProtoWriter {
    varint(field: number, v: number): this;      // negative → 10-byte two's complement
    bool(field: number, v: boolean): this;
    string(field: number, s: string): this;      // UTF-8, own encoder (no TextEncoder)
    bytes(field: number, b: Uint8Array): this;
    message(field: number, m: ProtoWriter): this;
    finish(): Uint8Array;
  }
  /** Field number → values in order: bigint for varints, Uint8Array for length-delimited.
   *  Wire types 1 and 5 are skipped. Throws Error('malformed') on truncation or wire types 3/4. */
  export function readFields(b: Uint8Array): Map<number, (bigint | Uint8Array)[]>;
  export function int32(f: Map<number, (bigint | Uint8Array)[]>, n: number): number | undefined; // BigInt.asIntN(32)
  export function uint(f: …, n: number): number | undefined;
  export function bool(f: …, n: number): boolean | undefined;
  export function str(f: …, n: number): string | undefined;
  export function sub(f: …, n: number): Map<number, (bigint | Uint8Array)[]> | undefined;
  export function frame(msg: Uint8Array): Uint8Array;           // varint length + msg
  export const MAX_FRAME = 65536;
  export class FrameReader {
    /** Whole frames completed by this chunk, in order. Throws Error('frameTooLarge') when a
     *  length prefix exceeds MAX_FRAME; the caller closes the stream. */
    push(chunk: Uint8Array): Uint8Array[];
  }
  ```

  ```ts
  // messages.ts — pairing (OuterMessage: protocol_version=1, status=2, pairing_request=10,
  // pairing_request_ack=11, options=20, configuration=30, configuration_ack=31, secret=40, secret_ack=41)
  export const STATUS_OK = 200;
  export type PairingOut =
    | { kind: 'pairingRequest'; clientName: string }  // service_name=1 "atvremote", client_name=2
    | { kind: 'options' }        // input_encodings=1 {type=1: 3 HEX, symbol_length=2: 6}, preferred_role=3: 1 INPUT
    | { kind: 'configuration' }  // encoding=1 {3, 6}, client_role=2: 1
    | { kind: 'secret'; secret: Uint8Array };                     // secret=1
  export type PairingIn =
    | { kind: 'pairingRequestAck'; serverName?: string }          // server_name=1
    | { kind: 'options' } | { kind: 'configurationAck' } | { kind: 'secretAck' } | { kind: 'other' };
  export function encodePairing(m: PairingOut): Uint8Array;       // always version 2, status 200; unframed
  export function decodePairing(b: Uint8Array): { status: number; msg: PairingIn };

  // remote (RemoteMessage: remote_configure=1, remote_set_active=2, remote_error=3,
  // remote_ping_request=8, remote_ping_response=9, remote_key_inject=10, remote_ime_key_inject=20,
  // remote_ime_batch_edit=21, remote_start=40, remote_set_volume_level=50)
  export type RemoteIn =
    | { kind: 'configure'; features: number; vendor?: string; model?: string }
        // code1=1; device_info=2 {model=1, vendor=2}
    | { kind: 'setActive' }
    | { kind: 'ping'; val1: number }                               // val1=1 (int32)
    | { kind: 'start'; started: boolean }                          // started=1
    | { kind: 'volume'; level: number; max: number; muted: boolean } // volume_max=6, volume_level=7, volume_muted=8
    | { kind: 'imeKeyInject'; appPackage?: string }                // app_info=1 {app_package=12}
    | { kind: 'imeBatchEdit'; imeCounter: number; fieldCounter: number } // 1, 2
    | { kind: 'error' } | { kind: 'other' };
  export type RemoteOut =
    | { kind: 'configure'; features: number }
        // code1=1; device_info=2 {model=1 'One Remote', vendor=2 'One Remote', unknown1=3: 1,
        // unknown2=4: '1', package_name=5: 'atvremote', app_version=6: '1.0.0'}
    | { kind: 'setActive'; active: number }                        // active=1
    | { kind: 'pong'; val1: number }                               // val1=1
    | { kind: 'key'; code: number; direction: 3 }                  // key_code=1, direction=2 (SHORT=3)
    | { kind: 'imeText'; imeCounter: number; fieldCounter: number; text: string };
        // ime_counter=1, field_counter=2, edit_info=3 {insert=1: 1,
        // text_field_status=2 {start=1, end=2, value=3}}, start = end = text.length - 1
  export function encodeRemote(m: RemoteOut): Uint8Array;          // unframed
  export function decodeRemote(b: Uint8Array): RemoteIn;           // first known field wins
  ```

- [ ] **Step 1: Write failing tests**

  ```ts
  // proto.test.ts
  test('varint 300 frames as AC 02', () =>
    expect([...frame(new Uint8Array(300)).slice(0, 2)]).toEqual([0xac, 0x02]));
  test('a frame split across chunks comes out whole', () => {
    const r = new FrameReader();
    expect(r.push(Uint8Array.of(0x04, 0x4a))).toEqual([]);
    expect(r.push(Uint8Array.of(0x02, 0x08, 0x05, 0x01, 0x00)).map((f) => [...f]))
      .toEqual([[0x4a, 0x02, 0x08, 0x05], [0x00]]);
  });
  test('two frames in one chunk come out in order', …);
  test('a length over 65536 throws frameTooLarge, and nothing is buffered', () =>
    expect(() => new FrameReader().push(Uint8Array.of(0x81, 0x80, 0x04))).toThrow('frameTooLarge'));
  test('readFields skips wire types 1 and 5 and throws on truncation', …);
  test('int32 -1 writes ten bytes and reads back -1', () => {
    const b = new ProtoWriter().varint(1, -1).finish();
    expect([...b]).toEqual([0x08, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01]);
    expect(int32(readFields(b), 1)).toBe(-1);
  });
  test('strings round-trip as UTF-8', () => /* 'Sony – BRAVIA 📺' */ …);
  ```

  ```ts
  // messages.test.ts — exact bytes
  test('configuration', () => expect(hex(encodePairing({ kind: 'configuration' })))
    .toBe('08 02 10 C8 01 F2 01 08 0A 04 08 03 10 06 10 01'));
  test('options', () => expect(hex(encodePairing({ kind: 'options' })))
    .toBe('08 02 10 C8 01 A2 01 08 0A 04 08 03 10 06 18 01'));
  test('pairing request carries atvremote and the client name', …); // decode back: fields 1, 2
  test('key DPAD_UP short', () =>
    expect(hex(encodeRemote({ kind: 'key', code: 19, direction: 3 }))).toBe('52 04 08 13 10 03'));
  test('pong echoes val1', () =>
    expect(hex(encodeRemote({ kind: 'pong', val1: 5 }))).toBe('4A 02 08 05'));
  test('decodes ping, start, volume, configure, ime messages', …);
    // built with ProtoWriter at the field numbers above; e.g. volume {6:100, 7:23, 8:false}
    // → { kind: 'volume', level: 23, max: 100, muted: false }
  test('a pairing reply with status 402 decodes status 402', …);
  test('an unknown RemoteMessage field decodes as other', …);
  ```

- [ ] **Step 2:** Run `bunx jest tests/androidtv`. Expected: FAIL (modules not found).
- [ ] **Step 3:** Implement `proto.ts`, `messages.ts` and `constants.ts` with the signatures above,
  and the ESLint lists.
- [ ] **Step 4:** Run `bunx jest tests/androidtv && bun run lint && bun run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(androidtv): protobuf framing and remote/pairing messages`.

### Task 3: Pairing code check

**Files:**

- Create: `src/androidtv/secret.ts`, `NOTICE`.
- Modify: `package.json` / `bun.lock` (`bun add @noble/hashes@1.8.0`).
- Test: `tests/androidtv/secret.test.ts`.

**Interfaces:**

- Produces:

  ```ts
  export interface RsaPublic { modulusHex: string; exponentHex: string } // upper-case, no leading zeros
  /** Upper-cases and drops spaces; null unless exactly 6 characters of 0-9A-F. */
  export function normaliseCode(typed: string): string | null;
  /** The 32-byte secret for `code`, or null when its first byte doesn't match (wrong code). */
  export function pairingSecret(client: RsaPublic, server: RsaPublic, code: string): Uint8Array | null;
  ```

- Algorithm (the one body this plan fixes):

  ```ts
  const bytesOf = (h: string) => hexToBytes(h.length % 2 ? '0' + h : h); // left-pad odd length
  const d = sha256(concat(
    bytesOf(client.modulusHex), bytesOf('0' + client.exponentHex),
    bytesOf(server.modulusHex), bytesOf('0' + server.exponentHex),
    hexToBytes(code.slice(2)),             // last 4 hex digits = 2 bytes
  ));                                      // sha256 from '@noble/hashes/sha2'
  return d[0] === parseInt(code.slice(0, 2), 16) ? d : null;
  ```

- `NOTICE`:

  ```text
  One Remote
  src/androidtv follows the message layout and pairing code check of androidtvremote2
  (https://github.com/tronikos/androidtvremote2), Copyright tronikos, Apache License 2.0.
  ```

- [ ] **Step 1: Write the failing test**, with this fixed vector:

  ```ts
  const client = { modulusHex: 'B1C2D3E4F5061728394A5B6C7D8E9FA0', exponentHex: '10001' };
  const server = { modulusHex: 'E5D4C3B2A19080706F5E4D3C2B1A0918', exponentHex: '10001' };
  test('the right code gives the reference digest', () =>
    expect(hex(pairingSecret(client, server, '2A3A7F')!)).toBe(
      '2A022F5AE10B20BB054691D3D27BF3D4B9E0F12C98CD68E887B4FD61C122ED5A'));
  test('a wrong first byte is null', () => expect(pairingSecret(client, server, '2B3A7F')).toBeNull());
  test('the ASCII-hash reading (first byte DD) is rejected', () =>
    expect(pairingSecret(client, server, 'DD3A7F')).toBeNull());
  test('suffix 0000 gives first byte DE', () =>
    expect(pairingSecret(client, server, 'DE0000')?.[0]).toBe(0xde));
  test('an odd-length modulus is left-padded', () =>
    expect(pairingSecret({ modulusHex: 'ABC', exponentHex: '10001' }, server, '253A7F')?.[0]).toBe(0x25));
  test.each([[' 2a 3a7f ', '2A3A7F'], ['2A3A7G', null], ['2A3A7', null], ['2A3A7F0', null]])(
    'normaliseCode(%p) = %p', (typed, want) => expect(normaliseCode(typed)).toBe(want));
  ```

  Where it came from (do not commit the script): it was computed with the reference's statements
  (`h.update(bytes.fromhex(f"{n:X}"))`, `bytes.fromhex(f"0{e:X}")`, …, `bytes.fromhex(code[2:])`).
  For example,
  `python3 -c "import hashlib;h=hashlib.sha256();[h.update(bytes.fromhex(x)) for x in ['B1C2…9FA0','010001','E5D4…0918','010001','3A7F']];print(h.hexdigest())"`.

- [ ] **Step 2:** Run `bunx jest tests/androidtv/secret.test.ts`. Expected: FAIL.
- [ ] **Step 3:** `bun add @noble/hashes@1.8.0` (it ships CommonJS, so Jest needs no transform
  change). Implement `secret.ts`. Add `NOTICE`.
- [ ] **Step 4:** Run the test. Expected: PASS. Then run `bun run lint && bun run typecheck`.
- [ ] **Step 5:** Commit: `feat(androidtv): pairing code check`.

### Task 4: Fake Android TV and fake LAN

**Files:**

- Create: `src/androidtv/testing/fakeAtv.ts`, `src/androidtv/testing/fakeAtvLan.ts`.
- Test: `tests/androidtv/fakeAtv.test.ts`.

**Interfaces:**

- Consumes: `messages.ts`, `proto.ts` (`frame`, `FrameReader`) and `secret.ts`.
- Produces:

  ```ts
  export interface FakeAtv {
    host: string; readonly name: string; readonly certSha256: string;   // default `atv-${host}`
    readonly server: RsaPublic;                  // default E5D4…0918 / 10001
    /** The 6-character code on screen during pairing, else null. Suffix default '3A7F'. */
    shownCode(): string | null;
    /** Client moduli the TV trusts on 6466 (added by a good secret). */
    readonly trusted: Set<string>;
    setPower(on: boolean): void;                 // pushes remote_start
    setVolume(level: number, max: number, muted?: boolean): void;
    setApp(pkg: string): void;                   // pushes remote_ime_key_inject
    openTextField(imeCounter: number, fieldCounter: number): void; // pushes remote_ime_batch_edit
    ping(val1: number): void;
    refusePairing(): void;                       // pairing_request answered with status 400
    rejectNextSecret(): void;                    // the next right secret still gets status 402
    stopAnswering(): void;                       // stops sending anything (no pings, no replies)
    drop(): void;                                // closes every stream from the TV side
    moveTo(host: string): void;
    standby(o: { answers: boolean }): void;      // off; with answers:false, nothing connects
    readonly keys: { code: number; direction: number }[];
    readonly imeEdits: { imeCounter: number; fieldCounter: number; value: string }[];
    readonly pongs: number[];
    connections(port: 6466 | 6467): number;
  }
  export function createFakeAtv(o: { host: string; name?: string; certSha256?: string;
    server?: RsaPublic; codeSuffix?: string; features?: number /* default 615 */ }): FakeAtv;

  export type FakeAtvLan = AtvTransport & {
    wifi: boolean; mdnsEnabled: boolean;
    readonly wolPackets: Uint8Array[];
    readonly streams: { host: string; port: number; tls: TvTls & { identity?: string } }[];
    readonly identities: Map<string, RsaPublic>;  // ref → current identity
  };
  export function createFakeAtvLan(o: { tvs: FakeAtv[]; wifi?: boolean; hang?: string[] }): FakeAtvLan;
  ```

- The fake's behaviour:
  - **openStream:**
    - neither a pin nor `pairing` → `notPaired`;
    - a pin other than `tv.certSha256` → `notPaired`;
    - an unknown host or no Wi-Fi → `notSent` at once;
    - a `hang` host → `notSent` after `timeoutMs`.
  - **6466** needs an `identity` whose modulus is in `trusted`. Otherwise it fails as Task 1 found
    (default until then: `notSent` with "handshake failed").
  - **On a 6466 stream,** the TV sends `configure{features}`, waits for the client's configure,
    then sends `setActive`, `start{power}` and `volume`.
  - **Pairing on 6467** follows research §1 steps 1–4:
    - a matching secret gives `secretAck` and adds the client modulus to `trusted`;
    - a wrong one gives status 402, then the TV closes.
  - **`ensureIdentity(ref)`** is deterministic per ref and generation; `deleteIdentity` starts a new
    generation. **`mdnsBrowse`** reports each up TV as `{ name, host, port: 6466, txt: {} }`.
  - **`open`, `ssdpSearch` and `request`** reject `notSent`.

- [ ] **Step 1: Write failing tests** in `fakeAtv.test.ts`, driving the fake with raw
  `encodePairing`/`encodeRemote` frames:
  - a full good pairing ends with `secretAck` and a trusted modulus;
  - a bad secret gives status 402 and a close;
  - 6466 without trust fails "handshake failed";
  - a ping is answered from `pongs`;
  - `moveTo` makes the old host `notSent`;
  - a wrong pin is `notPaired`.
- [ ] **Step 2:** Run `bunx jest tests/androidtv/fakeAtv.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement both fakes.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit: `test(androidtv): fake Android TV and LAN`.

### Task 5: Remote session client (port 6466) and key table

**Files:**

- Create: `src/androidtv/remote.ts`, `src/androidtv/keys.ts`.
- Test: `tests/androidtv/remote.test.ts`.

**Interfaces:**

- Produces:

  ```ts
  // keys.ts
  export const KEYCODE: Record<TvKey, number> = {
    up: 19, down: 20, left: 21, right: 22, ok: 23, back: 4, home: 3,
    mute: 164, volumeUp: 24, volumeDown: 25, playPause: 85, input: 178, power: 26,
  };
  /** Package → title. Unknown packages have no title. */
  export const APP_TITLES: Record<string, string> = {
    'com.google.android.youtube.tv': 'YouTube', 'com.netflix.ninja': 'Netflix',
    'com.amazon.amazonvideo.livingroom': 'Prime Video', 'in.startv.hotstar': 'JioHotstar',
    'tv.accedo.airtel.wynk': 'Airtel Xstream', 'com.android.tv.settings': 'Settings',
    'com.google.android.tvlauncher': 'Home', 'com.google.android.apps.tv.launcherx': 'Home',
  };

  // remote.ts
  export interface AtvLive { power?: boolean; volume?: number; muted?: boolean; app?: string }
  export class AtvRemote {
    /** Opens REMOTE_PORT with `{ identity: certRef, pinSha256 }` (or `{ identity: certRef, pairing: true }`), answers
     *  configure with `FEATURES & tv.features`, and setActive with the same value. Resolves on the
     *  first `start`, rejects `DeviceError('notSent')` after timeoutMs (`notPaired` and `notLocal`
     *  pass through). */
    static connect(t: Pick<AtvTransport, 'openStream'>,
      link: { host: string; certRef: string; pinSha256?: string },
      timeoutMs: number, opts?: { pairing?: boolean; silentMs?: number /* 16000 */ }): Promise<AtvRemote>;
    readonly certSha256: string;
    readonly vendor?: string; readonly model?: string;
    readonly live: Readonly<AtvLive>;
    /** Writes one SHORT key. Throws DeviceError('notSent') once closed. */
    key(code: number): void;
    /** IME batch edit with the last counters. Throws DeviceError('notSent',
     *  'No text field is open on the TV') when no imeBatchEdit was seen on this session. */
    text(value: string): void;
    onLive(cb: (l: AtvLive) => void): Unsubscribe;
    onClose(cb: () => void): void;   // once; not after own close()
    close(): void;
  }
  ```

- Rules:
  - every `ping` is answered with `pong` with the same `val1`;
  - no message from the TV for `silentMs` → close (fires `onClose`);
  - `FrameReader` throwing → close;
  - `volume` → `{ volume: round(100 * level / max), muted }` when `max > 0`;
  - `imeKeyInject.appPackage` → `app: APP_TITLES[pkg]`, removed when it is unknown;
  - `onLive` fires only when the value changed (JSON compare).
- [ ] **Step 1: Write failing tests**, against the fake with a trusted identity:
  - `connect` resolves with `live.power === true` and sends configure `103 & 615 = 103`;
  - `ping(7)`, then `ping(-1)`, give `pongs` `[7, -1]`;
  - `key(KEYCODE.up)` records `{ code: 19, direction: 3 }`;
  - after `openTextField(4, 9)`, `text('news')` records
    `{ imeCounter: 4, fieldCounter: 9, value: 'news' }`; without it, `text` throws the
    no-text-field error;
  - `setVolume(23, 50, false)` gives `live.volume 46`, and `onLive` fires once for a repeat;
  - `setApp('com.netflix.ninja')` gives `'Netflix'`; `setApp('x.y')` gives no `app`;
  - `stopAnswering()` → `onClose` after 16000 ms (fake timers), not before 15999;
  - `drop()` → `onClose` once; `key` after close throws `notSent`;
  - an untrusted identity → rejects; a wrong pin → `notPaired`.
- [ ] **Step 2:** Run `bunx jest tests/androidtv/remote.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(androidtv): remote session with ping, keys, IME and live state`.

### Task 6: Pairing (port 6467)

**Files:**

- Create: `src/androidtv/pair.ts`.
- Test: `tests/androidtv/pair.test.ts`.

**Interfaces:**

- Consumes: `AtvTransport`, `pairingSecret`/`normaliseCode`, the codec, `AtvRemote.connect` (Task 5,
  for the last step), and `PairPrompts`, `PairError`, `FoundTv`, `PairedTv` and `TvLink` from `@/core`.
- Produces:

  ```ts
  export async function pairAndroidTv(
    t: Pick<AtvTransport, 'openStream' | 'ensureIdentity'>,
    tv: FoundTv, prompts: PairPrompts,
    opts?: { stepMs?: number /* 10000 */; connectMs?: number /* 3000 */ },
  ): Promise<PairedTv>;
  ```

- Flow:
  1. Run `ensureIdentity(CERT_REF, CLIENT_NAME)` and open `PAIR_PORT` with
     `{ pairing: true, identity: CERT_REF }`.
     - `notLocal` is rethrown;
     - any other failure is `PairError('unreachable')`.
  2. Send `pairingRequest` → `pairingRequestAck`, then `options` → `options`, then
     `configuration` → `configurationAck`. Each step waits at most `stepMs`; past it the error is
     `'timeout'`. A status other than 200 at `pairingRequest` is `'denied'`.
  3. Loop on `askCode(wrong)`, with `wrong` false the first time:
     - `null` → close, `PairError('cancelled')`;
     - a `normaliseCode` null, or a `pairingSecret` null → `askCode(true)` on the same stream,
       sending nothing;
     - otherwise send `secret`. `secretAck` with 200 means paired. Status 402 or a close means
       start again from step 1 (the TV shows a new code), then `askCode(true)`.
     - The stream closing while the user types → `PairError('timeout')` once the code arrives.
  4. Run `AtvRemote.connect(t, { host, certRef: CERT_REF }, connectMs, { pairing: true })` on
     `REMOTE_PORT`. Its `certSha256` is the pin. A failure is `'unreachable'`.
  5. Return:
     - `link: { kind: 'androidtv', host, certRef: reuse?.certRef ?? CERT_REF, pinSha256, mac? }`,
       where `mac` is `macFromSubject(stream.serverSubject)`: the last `/` part of the CN, accepted
       only when it matches `MAC_RE` from `@/tv/wol`, lower-cased with `:` separators; it is left
       out otherwise (plan call 2);
     - `suggestedName`: `tv.name` unless it is `DEFAULT_NAME`, else `serverName`, else
       `${vendor} ${model}`.trim(), else `DEFAULT_NAME`.

  The setup passes `reuse` through. Both streams are always closed.
- [ ] **Step 1: Write failing tests**, against `createFakeAtvLan` with a single TV:
  - **MAC from the subject:** a fake TV whose subject is `CN=atvremote/BRAVIA/AA-BB-CC-DD-EE-FF`
    gives `mac: 'aa:bb:cc:dd:ee:ff'`; a subject `CN=atvremote` gives no `mac`;
  - **good code:** `askCode` resolves `fake.shownCode()`. Expect a link equal to
    `{ kind: 'androidtv', host: '192.168.1.20', certRef: 'androidtv:identity', pinSha256: 'atv-192.168.1.20' }`,
    and `askCode` called once with `false`.
  - **wrong code locally** (first byte flipped): `askCode` is called with `[false]`, then `[true]`.
    The fake's 6467 connection count stays 1, and no secret is sent.
  - **Review Focus 4:** `' ' + code.toLowerCase().replace(/(..)/, '$1 ') + ' '` pairs. `'2A3A7G'`
    calls `askCode(true)` and sends nothing.
  - **The TV refuses the secret** (`rejectNextSecret()`): a second 6467 stream, then
    `askCode(true)`, then success with the new code.
  - **denied:** `refusePairing()` gives `PairError('denied')`.
  - **timeout:** `stopAnswering()` after the request gives `'timeout'` after `stepMs` (fake timers).
  - **cancelled:** `askCode` resolving `null` gives `'cancelled'`, and the stream is closed.
  - **unreachable:** an unknown host gives `'unreachable'`. A public IP's `notLocal` is rethrown.
  - **name:** the mDNS name is kept. With `DEFAULT_NAME`, the vendor and model from configure are
    used.
- [ ] **Step 2:** Run `bunx jest tests/androidtv/pair.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `pairAndroidTv`.
- [ ] **Step 4:** Re-run, together with `tests/androidtv/remote.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(androidtv): code pairing on port 6467`.

### Task 7: Discovery, rediscovery by pin, and the brand

**Files:**

- Create: `src/androidtv/discovery.ts`, `src/androidtv/rediscover.ts`, `src/androidtv/setup.ts`.
- Modify: `src/services/createServices.ts` (one line under `// androidtv brand`).
- Test: `tests/androidtv/discovery.test.ts`, `tests/androidtv/rediscover.test.ts`,
  `tests/tv/setup.test.ts` (one added case).

**Interfaces:**

- Consumes: `BrandSetup` and `createCompositeTvSetup` (tv-core Task 3).
- Produces:

  ```ts
  // discovery.ts
  export function discoverAndroidTvs(t: Pick<AtvTransport, 'mdnsBrowse'>,
    onFound: (tv: FoundTv) => void, opts?: { browseMs?: number /* 3000 */ }): Unsubscribe;
      // → { kind: 'androidtv', host, name: service name || DEFAULT_NAME, secure: true }; errors end quietly
  export function androidTvFromProbe(host: string, open: ReadonlySet<number>): FoundTv | null;
      // open.has(6466) → { kind: 'androidtv', host, name: DEFAULT_NAME, secure: true }
  export function probeAndroidTv(t: Pick<AtvTransport, 'openStream' | 'ensureIdentity'>,
    host: string): Promise<FoundTv | null>;
      // TLS to 6467 within 1500 ms, with the identity; notLocal rethrown; other failures → null

  // rediscover.ts
  /** Candidates: mDNS hits first, then hosts with 6466 open (probe), each once, the link's own
   *  host last. The first that completes TLS on 6466 against link.pinSha256 (identity certRef) wins.
   *  At most maxCandidates TLS checks; null after giveUpMs. */
  export function findAndroidTvByPin(t: Pick<AtvTransport, 'mdnsBrowse' | 'probe' | 'openStream'>,
    link: Extract<TvLink, { kind: 'androidtv' }>,
    opts?: { checkMs?: number /* 1500 */; maxCandidates?: number /* 5 */; giveUpMs?: number /* 20000 */;
             browseMs?: number /* 3000 */; probeMs?: number /* 1500 */ }): Promise<string | null>;

  // setup.ts
  export function createAndroidTvBrand(o: { transport: AtvTransport }): BrandSetup;
    // kind 'androidtv', labelKey 'addTv.brandAndroidTv', pairing 'code', probePorts [6466];
    // discover/fromProbe/probeHost above; pair → pairAndroidTv(…, reuse);
    // findAgain(device, link) → link.kind === 'androidtv' ? findAndroidTvByPin(t, link) : null
  ```

  In `createServices`, the brands array gets
  `createAndroidTvBrand({ transport: tvTransport }),` on the line under `// androidtv brand`, after
  the LG entry. LG stays first in priority.
- [ ] **Step 1: Write failing tests:**
  - **discovery:** an mDNS service `{ name: 'Living Room TV', host: '192.168.1.20' }` gives one
    `FoundTv` with that name; a browse error gives nothing and no throw; `androidTvFromProbe`
    gives `{6466}` → found, `{6467}` → null.
  - **probeAndroidTv:** an up fake gives a found TV; an unknown host gives null; `8.8.8.8` rethrows
    `notLocal`.
  - **rediscover** (Review Focus 5): two fake TVs A and B. A moves to `.31`, and B stays at `.30`.
    - A's link finds `.31` and never `.30`; B's TLS check is refused by the pin.
    - mDNS off: found through the probe.
    - A is gone: null after at most 5 checks.
    - A hanging candidate costs at most `checkMs`.
  - **tests/tv/setup.test.ts:** a host that both LG and Android TV report (LG first in the
    registry) is listed once, as webos.
- [ ] **Step 2:** Run `bunx jest tests/androidtv tests/tv`. Expected: FAIL.
- [ ] **Step 3:** Implement, and add the registry line.
- [ ] **Step 4:** Run `bun run test && bun run typecheck`. Expected: green (the `addTv` screen tests
  now list the Android TV brand row).
- [ ] **Step 5:** Commit: `feat(androidtv): discovery, rediscovery by pin and brand entry`.

### Task 8: The `androidtv` link driver

**Files:**

- Create: `src/androidtv/driver.ts`.
- Modify: `src/services/createServices.ts` (one line under `// androidtv lane`).
- Test: `tests/androidtv/driver.test.ts`.

**Interfaces:**

- Consumes: `AtvRemote`, `KEYCODE`, `findAndroidTvByPin`, `magicPacket` (`@/tv/wol`) and
  `tvHostChanged` (`@/tv/hostChanged`).
- Produces:

  ```ts
  type AndroidTvLink = Extract<TvLink, { kind: 'androidtv' }>;
  export interface AndroidTvDriverOpts {
    transport: AtvTransport;
    /** The stored devices, read when forgetting (is the shared identity still used?). */
    devices(): Promise<Device[]>;
    onHostChanged(deviceId: string, host: string): Promise<void>;
    connectMs?: number;      // 1500
    reconnectMs?: number[];  // [250, 500, 1000, 2000, 5000]
    idleCloseMs?: number;    // 10000
    silentMs?: number;       // 16000
  }
  export function createAndroidTvDriver(o: AndroidTvDriverOpts):
    LinkDriver & { kind: 'androidtv'; clearNotPaired(deviceId: string, link?: AndroidTvLink): void };
  ```

  The driver line in `laneDrivers`, under `// androidtv lane`:

  ```ts
  createAndroidTvDriver({ transport: ctx.tvTransport, devices: () => ctx.store.devices(),
                          onHostChanged: tvHostChanged(ctx.store) }),
  ```

- Behaviour. Mirror `src/webos/driver.ts`'s entry and lifecycle: one session per device; backoff;
  `OFF_AFTER_MS = 3000`; rediscover at most every 30 s, one at a time across TVs; idle close;
  `refuseIfAborted`. The differences are:
  - **`supports`:**
    - `tv.key` and `tv.text`: true;
    - `tv.input`: false;
    - `tv.powerOn`: `!hasIr && (!!link.mac || answersWhenOff(device.id))`.
  - **`capabilities`:**
    `{ tv: { inputList: false, text: true, powerOn: !!link.mac || hasIr || answersWhenOff(device.id) } }`.
  - **`send`:**
    - `tv.key` sends `remote.key(KEYCODE[key])`;
    - `tv.text` sends `remote.text(text)`;
    - `tv.powerOn` follows plan call 3. Connected and `live.power === false` → `KEYCODE.power`.
      `true` → resolve without sending. Can't connect within `connectMs` → `sendWol(magicPacket(mac))`
      when there is a MAC, else `notSent`.
  - **`observe`** reports `{ kind: 'tv', state: { power, volume?, muted?, app? } }`:
    - only after the first `start`;
    - again on each `onLive` change;
    - `power: false` after `OFF_AFTER_MS` of failed connects, and only while on Wi-Fi.
  - **Not paired:** a 6466 failure where a 6467 `pairing: true` open to the same host succeeds means
    the TV is up but no longer trusts this phone. It latches `notPaired` (no retries, and sends throw
    `notPaired`) until `clearNotPaired`.
  - **Pin mismatch on the own host:** run `findAndroidTvByPin`. Found → `onHostChanged` once, and
    reconnect at once. Not found → `notPaired`.
  - **`forget`:**
    - close and drop the entry;
    - then `deleteIdentity(link.certRef)` only if no device in `o.devices()` still has an `androidtv`
      link with that `certRef`. The device is already gone from the store, since
      `removeDeviceWith` removes it first.
    - Idempotent; a failure is rethrown.
- [ ] **Step 1: Write failing tests** (fake timers, `createFakeAtvLan`; one `describe` per group):
  - **keys:** every `TvKey` sends its code, for example `input` → 178, `playPause` → 85,
    `power` → 26, `mute` → 164, and `supports(tv.input)` is false.
  - **capabilities:** `{inputList: false, text: true, powerOn: false}` with no MAC and no IR;
    `powerOn: true` with an `ir` link; `powerOn: true` after a session reported `started: false`.
  - **text:** after `openTextField`, the IME edit is recorded. Review Focus 1: without a field,
    `send` rejects `notSent` 'No text field is open on the TV' within 1 ms of connect.
  - **power on** (Review Focus 2):
    - `standby({answers: true})` → `powerOn` sends 26 once;
    - the TV on → `powerOn` sends nothing and resolves;
    - `standby({answers: false})` with `mac: 'aa:bb:cc:dd:ee:ff'` → one WoL packet;
    - with no MAC → `notSent`.
  - **observe:** reports power, volume 46 and `'Netflix'`; a second observer gets the last state at
    once; the same state is not reported twice.
  - **reconnect:** `drop()` gives a new 6466 connection after 250 ms with no off report.
    `stopAnswering()` closes after 16000 ms and reconnects.
  - **off:** `standby({answers: false})` gives `power: false` after 3000 ms; off Wi-Fi gives no
    report.
  - **pin mismatch then rediscovery:** the TV `moveTo('192.168.1.31')`, and another fake with a
    different cert takes `.20`. Expect `onHostChanged('tv1', '192.168.1.31')` once, a reconnect,
    and nothing ever sent to `.20`.
  - **not paired:** `trusted.clear()` then `drop()` gives one `notPaired`, no retries for 300 s, and
    `clearNotPaired` connects again.
  - **forget** (Review Focus 5):
    - two androidtv devices: removing one (the store holds the other) does not call
      `deleteIdentity`;
    - removing the last one calls `deleteIdentity('androidtv:identity')` once;
    - a second `forget` is fine.
  - **abort:** an aborted signal sends nothing.
- [ ] **Step 2:** Run `bunx jest tests/androidtv/driver.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the driver, and add the `laneDrivers` line.
- [ ] **Step 4:** Run `bun run test && bun run lint && bun run typecheck`. Expected: green.
- [ ] **Step 5:** Commit: `feat(androidtv): link driver with live state, reconnect and power on`.

### Task 9: App wiring — brand copy and duplicate by pin

**Files:**

- Modify:
  - `src/i18n/en/tv.ts`, `src/i18n/en/addTv.ts`;
  - `src/screens/tv/TvOffPanel.tsx`, `src/screens/tv/TvLinkActions.tsx`;
  - `src/screens/add/tv/PairTvStep.tsx` (or wherever tv-core's flow shows `addTv.unreachable`);
  - `src/screens/add/tv/AddTvFlow.tsx`.
- Test: `tests/screens/tv/tvScreen.test.tsx`, `tests/screens/add/addTv.test.tsx`.

**Interfaces:**

- Consumes: `tvLinkOf`, `TvLinkKind`, and tv-core Task 9's code step.
- Produces: `src/i18n/en` keys:
  - `tv.wakeFailedAndroidTv`: "Didn't turn on? Some Android TVs and boxes can't be woken over Wi-Fi.
    Look for Wake on LAN or Remote start in the TV's settings, or use its remote once."
  - `addTv.unreachableAndroidTv`: "Couldn't reach the TV. Check that it is on, on the same Wi-Fi, and
    has Android TV Remote Service."

  The wake line is added as `androidtv: 'tv.wakeFailedAndroidTv'` in tv-core Task 9's `wakeHintKey`
  map (`src/screens/tv/wakeHint.ts`). The unreachable line uses a map in the same style beside it,
  `unreachableHintKey`, with the LG key as the default.
- Duplicate check in `AddTvFlow`: a new pairing is a duplicate when any existing TV link has the same
  `mac`, or the same `pinSha256` when both have one (plan call 2).
- [ ] **Step 1: Write failing tests:**
  - an androidtv device in `wakeFailed` shows the Android TV line, and a webos one still shows the LG
    line;
  - a code-pairing `unreachable` shows `addTv.unreachableAndroidTv`;
  - pairing the same Android TV twice (same pin, no MAC) is caught as a duplicate and saves one
    device.
- [ ] **Step 2:** Run `bunx jest tests/screens`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun run test && bun run lint && bun run typecheck`. Expected: green.
- [ ] **Step 5:** Commit: `feat(androidtv): brand copy and duplicate check by certificate pin`.

### Task 10: Airtel box pass bar on hardware

- [ ] **Step 1:**
  - If Task 1 was a no-go, skip to Step 3.
  - Otherwise build and install on the Realme X (`bunx expo run:android`, Metro from this worktree).
    The box is on and on the same Wi-Fi.
  - Follow the session rules: confirm One Remote is in front, tap by label, and let the user unlock
    the phone.
- [ ] **Step 2:** Run the pass bar (spec §7):
  1. **Pair:** Add TV, then Find my TV. The box shows "Google TV / Android TV · <ip>". Type the code;
     also try one wrong code first, and "Show a new code".
  2. **Keys and touchpad** in four directions, OK, Back and Home. 100 touchpad moves with no visible
     lag.
  3. **Keyboard:** open a search field on the box and type "news". Then type with no field open:
     expect the error line, not a hang.
  4. **Volume** ± and mute from the screen and from the phone's volume keys. Check whether the level
     is shown live; the box may not push it if it has no audio control.
  5. **Input:** the button sends `KEYCODE_TV_INPUT`. Record whether the box shows a picker (a set-top
     box may ignore it).
  6. **Power off,** then on. Record which path worked: the power key in standby, IR, or none (then the
     off panel shows the Android TV line).
  7. **IP change:** give the box a new address (router DHCP reservation, or Wi-Fi off and on). The app
     finds it again by itself (by pin).
  8. **Remove the device:** the box asks to pair again on the next add.
- [ ] **Step 3:** Record the run in `docs/spike/tv-results.md` under "Android TV run 1 (Airtel
  Xstream)":
  - each item as pass or fail, with times;
  - the box model, Android version and Remote Service version.

  If Task 1 was a no-go, or the bar was not reached, write "Android TV: untested on hardware" with
  the reason, and ask the author for another Google TV or Android TV device. Update the fake (Task 4)
  if the hardware differed from it (the 6466 refusal shape, or whether the certificates are the
  same), and fix the tests.
- [ ] **Step 4:** Commit: `docs(spike): Android TV pass bar on the Airtel box`.
