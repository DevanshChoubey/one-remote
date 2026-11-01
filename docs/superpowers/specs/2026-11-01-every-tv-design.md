# One Remote: every TV, one remote (design)

Date: 2026-11-01. Extends `2026-10-30-one-remote-design.md`. Where the two disagree, this document wins
for TVs. Protocol research, with sources: `docs/research/2026-11-01-tv-protocols.md`.

## 1. Intent

The author's words: "this needs to work with all kind of tv including android/samsung and so on",
"with single interface", and "the UI is already fixed now, let's only work on making it work for all
kind of TVs".

So:

- **One remote.** The TV screen, the Home card and the device sheet look and behave the same whatever
  TV is behind them. The brand only changes how the app talks to the TV.
- **The UI is done.** This work is the connection layer underneath it. The few UI changes that a new
  TV needs are listed in §6, and each one reuses the existing primitives and layout.
- The bench LG OLED C4 keeps working exactly as it does today (the test suite stays green, and the
  LG pass bar from `docs/spike/tv-results.md` still holds).

This replaces two lines of the main spec: "TV: brand (LG only in v1)" (§3.5) and "TV brands other
than LG" (§4, Non-goals).

## 2. Goals

1. Add, pair and control these TVs over home Wi-Fi, in this order _(Claude's call, from the market
   research: Android/Google TV is most Indian smart TVs, Samsung is the biggest single brand, LG is
   done)_:
   1. **Android TV and Google TV**: Sony, TCL, Xiaomi/Redmi, OnePlus, Hisense (Google TV models),
     Acer, Vu, Kodak, Thomson, Motorola, Philips Android models, Chromecast with Google TV, and Android
     TV set-top boxes like the author's Airtel Xstream box. They are all one protocol (Google's
     "Android TV Remote Service", v2).
   2. **Samsung** Tizen TVs, 2016 and later.
   3. **Then, in small batches:**
      - Roku TVs;
      - older Sony Bravia TVs that are not Google TVs;
      - Philips (JointSPACE, for its non-Android models);
      - Panasonic Viera;
      - Amazon Fire TV (sticks and Fire TV Edition TVs), through the Fire TV app's own local protocol.
        It is undocumented, so this one is marked experimental.
2. **Find the TV without asking for the brand.** One search finds every supported TV on the Wi-Fi and
   names the brand itself. The brand list stays only as the way into "type the TV's address".
3. **Same remote, honest gaps.** Every button on the TV screen works on every brand, or is hidden on
   that TV when it truly can't work. Hidden, never broken (§5).
4. **The same "no connection trouble" rules as LG:**
   - connected in the background;
   - silent reconnect;
   - found again by MAC address when the IP changes;
   - one clear sentence and one action when it is down;
   - never a spinner that hangs.

## 3. Non-goals and anti-goals

- **Non-goals:**
  - **Hisense/Toshiba VIDAA TVs.** Their protocol needs a client certificate that ships inside
    Hisense's own app, which we can't make or redistribute. They get the honest "not supported yet"
    line, plus IR on phones with IR. (Hisense's Google TV models are covered by goal 1.1.)
  - **Samsung 2014–2015 TVs** (encrypted protocol) and anything older than its maker's current
    protocol.
  - **ADB** (Developer options, debugging) as a way in for Fire TV or anything else. It is too much to
    ask a normal user.
  - **Voice, casting, the Magic-Remote-style cursor, and app shortcuts.**
- **Anti-goals:**
  - A per-brand remote layout.
  - Asking the user which "protocol" or "mode".
  - Any connection outside the home network.
  - An account or a cloud step for any brand.

## 4. Constraints (unchanged from the main spec, restated because every new driver must meet them)

- **Expo SDK 58 + TypeScript. Bun only.** Domain code (`src/core`, `src/device` and each brand folder)
  is pure TypeScript and tested in Jest against fakes. All sockets live in `src/transport` and the
  native `lan-socket` module, under the existing local-only checks:
  - literal private, link-local or loopback IPs;
  - SSDP and mDNS multicast only;
  - `fetch` and XHR banned.
- **Trust.** TLS to a TV is trust-on-first-use, pinned to the certificate SHA-256 seen at pairing,
  exactly as for LG. Private keys never enter JavaScript.
- **Secrets.** Tokens, client keys and certificates go in secure storage, referenced from the link,
  and are deleted when the device is removed.
- **iPhone.** Every new mDNS service type goes in `NSBonjourServices`. Discovery must still work
  without the multicast entitlement, through the subnet port probe.
- **Licences.** Implement from the protocol descriptions; don't port copyleft code.
  - `tronikos/androidtvremote2` (Apache-2.0) and `louis49/androidtv-remote` (MIT) may be read and
    followed. Apache-2.0 needs a NOTICE line if code is adapted.
  - `xchwarze/samsung-tv-ws-api` is LGPL-3.0: read it for behaviour only, don't copy it.
    `tavicu/homebridge-samsung-tizen` (MIT) may be followed.
- Commits, branches and lanes follow the main spec (`lane/*` worktrees, Conventional Commits, no push
  unless asked).

## 5. How it works

### 5.1 One link kind per protocol

`LinkKind` grows from `'webos' | 'matter' | 'ir'` to add `'androidtv'`, `'samsung'`, and later `'roku'`,
`'bravia'`, `'philips'`, `'viera'` and `'firetv'`. Each has its own `Link` variant with what that
protocol must store:

- `androidtv`: `{ host, mac?, certRef, pinSha256 }`. The TV's certificate pin goes in the link. The
  phone's own key and certificate are in native secure storage under `certRef`.
- `samsung`: `{ host, mac?, tokenRef, pinSha256 }`.
- Later kinds are defined when their batch is planned.

Every TV link has `host` and optional `mac`, so the hub, rediscovery and WoL can treat them alike. The
device model already allows several links. A TV normally has one network link, plus `ir` where the
phone has IR, as today.

### 5.2 One driver per protocol, same contract

Each protocol is a folder like `src/webos`:

- `src/androidtv`;
- `src/samsung`;
- later `src/roku`, `src/bravia`, `src/philips`, `src/viera` and `src/firetv`.

Each has:

- a client;
- discovery and probe;
- pairing;
- rediscovery;
- a `LinkDriver` (`supports`, `send`, `observe`, `forget`, `capabilities`);
- a fake TV for tests.

The hub, the screens and the store don't learn any brand names. Shared pieces move out of `src/webos`
into `src/tv` (§5.6).

### 5.3 What the remote needs from each TV, and what we do when a TV can't

The screen's controls map to commands that already exist (`tv.key`, `tv.text`, `tv.powerOn` and
`tv.input`). A new `TvCaps` in `Capabilities` (`capabilities()` for each driver) tells the screen
what to show.

| Control | LG (today) | Android/Google TV | Samsung |
| --- | --- | --- | --- |
| D-pad, OK, Back, Home | ✓ | ✓ key codes | ✓ `KEY_*` |
| Volume ± and mute | ✓ | ✓ keys; level pushed live | ✓ keys |
| Play/Pause | ✓ | ✓ `MEDIA_PLAY_PAUSE` | ✓ `KEY_PLAY`/`KEY_PAUSE` toggle (builder's pick) |
| Keyboard (text) | ✓ | ✓ IME edit, when a text field is open | ✓ `SendInputString` |
| Input | list (§ inputs) | Input key (opens the TV's own picker) | Source key (opens the TV's own picker) |
| Power off | ✓ | ✓ power key | ✓ power key |
| Turn on | WoL | power key if it still answers; else WoL by MAC | WoL by MAC |
| Live state | power, app, volume, inputs | power, volume, app (when given) | power (from the info page); others not shown |

Rules:

- **Input:** when a TV has no input list (`TvCaps.inputList: false`), the Input button sends the
  TV's own input key, and the TV shows its picker. The in-app sheet appears only for TVs that list
  inputs. It is the same button either way.
- **Live state the TV doesn't report is not shown.** The Home card falls back to the TV's name, as LG
  does today before the state arrives. No guessed numbers.
- **Turn on:**
  - When neither the power key nor WoL can work (no MAC, or the box drops off Wi-Fi when off), the
    off panel says so in one sentence. It points to IR where the phone has it, as for LG.
  - The setting each brand needs ("Turn on via Wi-Fi", "Power on with mobile" and so on) is named in
    that brand's copy.
- **A command a TV can't do** is never shown as a button. `supports()` returning false for a shown
  button is a bug.

### 5.4 Finding and adding a TV

- **One search** runs every brand's discovery at once and lists what it finds, each with its brand
  word ("LG", "Samsung", "Google TV / Android TV", …):
  - SSDP: LG, Samsung, Roku, Sony, Fire TV;
  - mDNS: `_androidtvremote2._tcp`, Philips;
  - the subnet port probe as the fallback (3000/3001, 6466, 8001/8002, 8060, …).
- Duplicates (one TV seen by two methods) are merged by host.
- **Pairing**, by the kind of prompt the TV shows:
  - **"Allow" on the TV** (LG, Samsung): today's "Press Allow on the TV" step.
  - **A code on the TV** (Android/Google TV: 6 characters, 0–9 and A–F; Fire TV and Sony: 4 digits):
    a new step, "Type the code shown on the TV". It has a code field and the existing button styles. A
    wrong code says so and lets the user try again. A new code can be asked for.
- **Brand step:** the brand list (today "LG" and a disabled "Samsung, Sony, Google TV…") lists every
  supported brand, and is where "Type the TV's address instead" lives. The default path is the search.
  _(Claude's call: the author said the UI is fixed, so this keeps the screens and changes what they
  list.)_
- **Duplicates:**
  - The same TV added twice is caught by MAC across all kinds, as LG is today.
  - An Android TV box that also shows up as something else is kept as one device.
- **Two-router homes:** the search only sees the phone's own Wi-Fi. When nothing is found, the copy
  says "Make sure your phone is on the same Wi-Fi as the TV", and offers the address step.

### 5.5 Native work

1. **Android TV needs a raw TLS socket with a client certificate**, not a WebSocket. `lan-socket`
   gains a stream mode _(Claude's call over adding `react-native-tcp-socket`: it keeps the one place
   that enforces local-only and pinning, and that library is old-architecture with SDK 58 support
   unconfirmed)_:
   - open a TLS byte stream to a local IP and port;
   - present a client identity referenced by `certRef`;
   - pin or report the server leaf certificate as today;
   - return the server certificate's RSA modulus and exponent (the pairing code check needs them);
   - send and receive bytes as base64.

   The client key pair and its self-signed certificate (RSA-2048, about 10 years) are made and kept
   natively:
   - **Android:** Android Keystore.
   - **iOS:** Keychain, with a small DER certificate writer, since iOS has no certificate builder.

   The module returns the client's modulus and exponent too. Private keys never reach JavaScript.
2. **Samsung, Roku, Sony, Philips and Fire TV need local HTTP(S) requests** (TV info, MAC address,
   power state, Roku commands, Fire TV pairing). `lan-socket` gains a small `request()` with these
   rules:
   - local IPs only;
   - pinned-or-TOFU TLS;
   - no redirects;
   - size and time limits.

   `fetch` stays banned.
   Samsung's info page (`http://<ip>:8001/api/v2/`) is plain HTTP. That is acceptable: it is local,
   read-only, and carries no secret _(Claude's call)_. It is read once at pairing (MAC address, name,
   model) and then polled for power state every 5 s, only while that TV's screen or Home card is on
   screen _(Claude's call)_.
3. **Samsung's WebSocket** uses the existing `wss` path with TOFU, as LG does.
4. **mDNS browsing is new native work:**
   - **Android:** `NsdManager`.
   - **iOS:** `NWBrowser`. The service types also go in `NSBonjourServices`.
   - Results go through the same local-only check.
   - Today the app has SSDP and the port probe only. Until mDNS lands, Android TV is found by the probe
     on 6466.
5. **The phone has one Android TV client identity, shared by every Android TV it pairs with**, as
   Google's own app does _(Claude's call)_. `certRef` names it. Removing one TV deletes the identity
   only when no other link still uses it.
6. All new native features come with Kotlin unit tests. The parked "Swift tests for lan-socket"
   follow-up is picked up for the new Swift code.

### 5.6 Shared TV pieces (`src/tv`)

`src/tv` holds the pieces that every protocol uses:

- **Wake-on-LAN packet.**
- **Rediscovery by MAC.** It is the existing logic, made generic over a brand's "find" function.
- **The search.** It merges every brand's discovery.
- **The brand registry,** listing each kind with:
  - its label;
  - its pairing style (`allow` | `code`);
  - discovery;
  - probe ports;
  - its `TvSetup`.

`TvSetup` (`src/core/tvSetup.ts`) becomes brand-neutral:

- `FoundTv` gains `kind`.
- `pair` takes callbacks for "show Allow" or "ask for a code".
- `PairedTv.link` is any TV link.

The places that check `link.kind === 'webos'` today look the TV link up through one helper:

- `AddTvFlow`, `TvLinkActions`, `DeviceSheet`, `linkActions`;
- `createServices` (`webosHostChanged`, `removeDevice`, `clearNotPaired`).

## 6. UI changes this needs (and nothing else)

- **The brand step lists the supported brands** (§5.4).
- **The search list** shows a brand word under each TV's name.
- **A new code step**, made from existing primitives: a heading, one text field, Pair, "Show a new
  code", and Back.
- **TV screen:**
  - The Input button opens the sheet or sends the input key (§5.3).
  - Buttons a TV can't do are hidden. Today the only expected case is none, since all three brands do
    every button.
- **Copy:** each brand's "turn on via Wi-Fi" hint and "can't reach" lines, in `src/i18n/en`.

## 7. Testing and the pass bar

- **Jest, for each protocol:**
  - a fake TV in `src/<brand>/testing`, like `fakeTv.ts`;
  - tests for pairing (good code, wrong code, denied, timeout);
  - every command;
  - reconnect after a drop;
  - a pin mismatch, then rediscovery;
  - state reports;
  - `forget`.
- **The Android TV pairing code check** is tested against a fixed key pair and code taken from the
  reference implementation.
- **Hardware:**
  - **Android TV pass bar:** the author's Airtel Xstream box. It must be on, on the same Wi-Fi as the
    phone, with its "Android TV Remote Service" present. The LG pass bar items apply:
    - pairing;
    - keys and touchpad in four directions;
    - keyboard into a text field;
    - volume and phone volume keys;
    - Input;
    - power off and on;
    - IP change.
  - **First step of the Android TV lane:** a throwaway spike that checks the box advertises
    `_androidtvremote2._tcp` and answers on 6466 and 6467. The earlier subnet scan found nothing on
    6466, so this proves the box is reachable before the full driver is built.
  - **If the box fails the spike** (no Remote Service, or it can't be reached), the driver is still
    built and tested against the fake TV. It is marked "untested on hardware" until any Google TV or
    Android TV passes the bar. The author is asked for another device at that point _(Claude's call)_.
  - **Samsung:** no Samsung TV has been confirmed for testing (open question, §9). Without one, the
    Samsung driver ships after fake-TV tests and is marked "untested on hardware" in
    `docs/spike/tv-results.md`.
  - **LG:** the LG bench is re-run after the shared-code move.
  - **Existing tests may be edited** for renames and moves (for example `webosHostChanged` becoming
    generic). What they check must not get weaker.
  - **Brands not yet tested on hardware still show in the brand list.** Builds are installed directly,
    not from a store, and real users are how they get tested _(Claude's call)_. Samsung's Play/Pause
    key is the builder's pick, and is confirmed on the first Samsung run.

## 8. Build order and lanes _(Claude's call)_

1. **`lane/tv-core`: groundwork, with no new brand.**
   - Brand-neutral `TvSetup` and `Link` helpers.
   - The `src/tv` shared pieces.
   - `TvCaps`.
   - The registry, with LG as its only entry.
   - The `lan-socket` stream and request features.

   LG must pass unchanged.
2. **`lane/androidtv`:** the spike, then the driver, pairing with the code step, and the Airtel box pass
   bar.
3. **`lane/samsung`:** in parallel with 2 once 1 is merged (separate folders; only the registry line
   and copy collide).
4. **Later batches:** Roku, Sony Bravia (REST), Philips, Panasonic, Fire TV (experimental), each its own
   lane and plan.

Each lane merges to `main` on the author's go-ahead, as before.

## 9. Open questions for the author

- Which other TVs can be tested on: a Samsung TV, a Google TV, a Fire TV stick, at home or with family?
  This changes what can be called done on hardware.

## 10. Left to the builder

- Protobuf encoding: a small hand-written encoder/decoder for the handful of messages, or a generated
  one. The builder picks, keeping the bundle small.
- Exact key code tables, retry and backoff numbers within the existing hub rules, and the copy wording.
- How the native module stores the client identity, within "never leaves native secure storage".
