## What this changes

<!-- One or two sentences. Link the issue if there is one. -->

## Why

## How it was tested

<!-- Tests added or changed. For UI, IR, Wi-Fi, Bluetooth or Matter changes, say whether you tried it
on a real phone and device, and which ones. If you could not, say so. -->

## Checklist

- [ ] `bun run test` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] Follows [docs/ENGINEERING.md](https://github.com/DevanshChoubey/one-remote/blob/main/docs/ENGINEERING.md) (layering, tokens, copy in `src/i18n/en/`)
- [ ] Screen changes are in the central mock, `docs/design/one-remote-mockup.html`
- [ ] Local network only: no new internet hosts, telemetry or permissions
- [ ] No vendor code, APKs, decompiled files or secrets
- [ ] Code derived from IRremoteESP8266 stays in `src/ir/lgpl/`, with its `NOTICE.md` updated
