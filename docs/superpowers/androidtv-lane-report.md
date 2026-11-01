# Android TV lane report

Branch `lane/androidtv`. No native code was changed, so no prebuild or gradle run. iOS: not
compiled or claimed; this lane is pure TypeScript over the `TvTransport` the core lane built, and
the Swift side of that transport was not built here.

## Tasks
- 1 (spike code, c.f. 02f1f87) and 2 (c0c7379) were already committed. Their tests pass.
- 3 secret check, 4 fakes, 5 remote, 6 pairing, 7 discovery/rediscovery/brand, 8 driver,
  9 copy + duplicate by pin: committed. 10: hardware, recorded as pending in
  `docs/spike/tv-results.md` ("Android TV run 1").
- Not done: Task 1 steps 3-6 and Task 10 steps 1-3 need the phone and the box.

## Decisions
- Pairing hash: both hex strings go through `bytesOf`, which left-pads odd-length hex to whole
  bytes. `ensureIdentity`'s exponent "10001" hashes as 01 00 01. The plan's `'0' + exponentHex` would
  break on an even-length exponent such as "03" ("003"), so the exponent is padded like the rest. The
  Task 3 vector was re-derived with Python and matches.
- `pairAndroidTv(t, tv, prompts, opts)` takes `reuse` inside `opts` (plan signature kept).
- `MAC_RE` is not exported from `@/tv/wol`, so `pair.ts` has its own copy (no edit to `src/tv`).
- `FakeAtvLan` is a Pick of the transport, so it has no `open`/`ssdpSearch`/`request`. It does
  reject non-local addresses with `notLocal` (needed by the Task 7 test). Extra fake fields:
  `configures`, `opened(port)`, `deleted`, `subject`, `omitServerName`, `vendor`, `model`.
  `connections(port)` counts streams open now; `opened(port)` counts all ever.
- Wake hint: `wakeHint.ts` maps androidtv to `tv.wakeFailedAndroidTv`; `unreachableHintKey` sits
  beside it (LG default).
- A wrong typed code is caught locally (hash first byte), so a wrong code never reaches the TV.
- `tests/services/services.test.ts` now expects drivers `['webos', 'androidtv']` (one line).
  The Samsung lane will touch the same line.
- Off report: the 3000 ms count starts at the first failed connect, not at the drop (so about
  3250 ms after a drop with the 250 ms backoff).

## Concerns
1. The "not paired" latch is now narrow: it fires only when 6466 completed TLS and the TV then
   closed the stream before the session `start` (the shape the fake gives an unknown client
   certificate; real hardware unconfirmed). The transport reports a handshake alert, a refusal and a
   timeout all as `notSent`, so a handshake-alert signal is not available; a timeout never latches
   and the 6467 probe is gone. Risk left: a TV that hangs up before `start` for another reason
   (shutting down mid-connect) latches until the person pairs again.
2. Hardware unknowns the fakes guess: same cert on 6466 and 6467, the unpaired-6466 failure shape,
   whether the CN carries a MAC, and whether standby accepts a session. See `tv-results.md`.
3. Without a MAC (likely) and no IR, power on works only if the standby session answers.
4. `src/services/createServices.ts` and `tv-results.md` are shared with the Samsung lane: expect
   trivial merge conflicts at the slots.

## Review fixes
- Latch on hang-up after TLS only (see concern 1); timeouts keep the normal backoff and `powerOn`
  still falls back to Wake-on-LAN. The fake TV now completes TLS and then hangs up on an unknown
  client, and `onClose` on a closed fake stream fires at once.
- A pin mismatch with the pin found nowhere no longer latches: presses say `notPaired` for that
  attempt and the search repeats at most every 30 s while observed, so the TV is found when it
  returns at a new address.
- A connect started by a send that fails now schedules the observer's retry; an attempt does not
  start while a send's connect is in flight.
- A connect finishing after `forget` is closed at once, and no idle timer is armed for a forgotten
  entry.
- `AtvRemote.write` failure closes the stream.
- Pairing: an empty server modulus (non-RSA certificate) fails `unreachable` before asking for a
  code (before this it looped forever on "wrong code"); the 6466 connect after pairing retries once
  after 500 ms.
- Commits: findings 1, 2, 3 and 5 share one commit because they edit the same driver hunks;
  findings 4, and 6 with 7, have their own.
