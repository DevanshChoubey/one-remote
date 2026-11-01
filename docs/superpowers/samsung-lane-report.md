# Samsung lane report

Branch `lane/samsung`. All 8 plan tasks committed. `bunx jest` 792 pass (51 suites), `bun run lint` and
`bunx tsc --noEmit` clean. `git diff a7f999a -- src/webos src/tv` is empty. No native code changed.
No Samsung hardware: every hardware item is pending in `docs/spike/tv-results.md`.

## Commits
- 570060f feat(samsung): key map, frames and info-page parsing (earlier agent)
- 8b6725e test(samsung): fake Samsung TV and LAN
- 9a2131d feat(samsung): wss client and Allow pairing
- afdace1 feat(samsung): SSDP discovery, probe and rediscovery by MAC
- 02a7c40 feat(samsung): link driver with power polling and WoL
- 12ed4a3 feat(samsung): register the Samsung brand and driver
- 83d6c1b feat(tv): Power on with mobile hint for Samsung
- docs(spike): record Samsung lane as untested on hardware

## Decisions (plan ambiguities)
- The leftover `tests/samsung/fakeTv.test.ts` matched Task 2 exactly; kept as is (prettier only).
- `laneDrivers` already had `// tv lane`, `// ir lane`, `// matter lane` but no samsung slot: added
  `// samsung lane` after the webos driver. The brand goes under the existing `// samsung brand`.
- Wake hint: `TvScreen` already used `wakeHintKey(brandKind)`; only the `samsung` map line and the
  `tv.wakeFailedSamsung` string were added. `addTv.brandSamsung` already existed.
- Updated shared tests: `tests/screens/tv/wakeHint.test.ts` (samsung now has its own line; the
  fallback is checked with `androidtv`) and `tests/services/services.test.ts` (default drivers are
  `['webos','samsung']`). The Android TV lane will touch the same lines (expect a trivial merge conflict).
- `probeSamsungHost` returns the info page's real TV name (SSDP/probe results stay "Samsung TV").
- Rediscovery treats the link's own host as a last resort (other candidates first), not excluded.
- A rotated token (ms.channel.connect with a different non-empty token) is written back to secrets.
- The fake TV's `connect`, `matches`, `infoBody`, `ssdpReply`, `isUp` are extra members for the fake LAN.
- `infoRequests()` counts every request addressed to the TV, including ones that fail while off.

## Concerns
- A revoked token: the TV shows a new Allow prompt and stays silent. If a non-empty stored token was
  sent and `ready` times out, the press is `notPaired` and the latch is set, so later presses do
  not reopen the socket and prompt again. Confirm real behaviour on hardware (item 12).
- A pin mismatch during a press runs rediscovery in the background; that press reports `notSent`
  (or `notPaired` at once when the link has no MAC to search by), and later ones `notPaired` once
  rediscovery found nothing or the same host still has a changed certificate.
- UNCONFIRMED protocol choices remain per the plan: play/pause alternation, text append vs replace,
  info page on 8001, `wifiMac` vs wired MAC, `ms.channel.timeOut` spelling (both spellings parsed).
