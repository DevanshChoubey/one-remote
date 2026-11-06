# Contributing to One Remote

Thank you for helping. The most useful thing right now is a **device test report**: which TVs, AC
and fan brands, and IR codes work on real devices, and which do not. Most AC encoders have only been
checked against the upstream test vectors, not against a real AC. Code, docs and bug reports are
welcome too.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Contents

- [Set up](#set-up)
- [The rules](#the-rules)
- [Checks](#checks)
- [Commits](#commits)
- [Pull requests](#pull-requests)
- [Licences of new code](#licences-of-new-code)
- [Never commit vendor code, APKs or secrets](#never-commit-vendor-code-apks-or-secrets)
- [Report a device result](#report-a-device-result)

## Set up

This project uses [Bun](https://bun.sh) only. Use `bun install`, `bun add`, `bunx` and
`bun run <script>`. Never use npm, yarn or pnpm, and never commit a `package-lock.json`.

```sh
git clone https://github.com/DevanshChoubey/one-remote.git
cd one-remote
bun install          # also installs the lefthook git hooks
bun run start        # Metro, for a development build
```

To run the app on a phone, see [Getting started](README.md#getting-started). IR needs an Android
phone with an IR blaster, and Bluetooth, Wi-Fi discovery and Matter need a real phone. For native
packages, use `bunx expo install` so versions match the Expo SDK.

## The rules

Read [docs/ENGINEERING.md](docs/ENGINEERING.md) before you change code. The short version:

| Rule       | Summary                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| Layering   | Imports only point downward. Screens reach services through `useServices()`.                         |
| Pure core  | `src/core`, `src/device`, `src/ir`, `src/webos` and `src/matter` never import React Native or Expo.  |
| Primitives | Only `src/ui/primitives/` imports `View`, `Text`, `Pressable` and the like.                          |
| Theme      | Colours, fonts, radii and shadows live only in `src/theme/tokens.ts`. Use token names.               |
| Copy       | Every user-facing string lives in `src/i18n/en/`.                                                    |
| TypeScript | Strict. No `any`, no non-null `!` outside tests, explicit return types on exports.                   |
| Errors     | Throw typed errors (`DeviceError` and the like). Screens show friendly copy, never raw messages.     |
| Privacy    | Local network only. Sockets live in `src/transport`, and every connect goes through `assertLocal()`. |
| Cloud      | The only internet use is the opt-in MirAIe connection, to its allowlisted hosts. Add no other.       |
| Tests      | Test first. Tests live in `tests/`, mirroring `src/`.                                                |

ESLint bans `XMLHttpRequest` everywhere, and `fetch` everywhere except the MirAIe client in
`src/transport/cloud.ts`. `WebSocket` and UDP are allowed only in `src/transport`. A pull request that adds analytics, crash reporting, remote config,
location or a new internet host will not be merged.

## Checks

All three must pass before each commit:

```sh
bun run test
bun run typecheck
bun run lint
```

The git hooks help: `pre-commit` runs Prettier and ESLint on staged files, and `pre-push` runs the
typecheck and tests and refuses pushes to `main`. CI runs the same checks, plus coverage and
`bunx expo-doctor`. `bun run format` formats the whole repo with Prettier.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/). The `commit-msg` hook checks the
subject line.

```text
feat(ir): add the Voltas AC encoder
fix(webos): pair again when the TV forgets the client key
docs: explain the MirAIe opt-in
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `build`, `ci` and
`style`. Common scopes are the folder names in `src/`, such as `ir`, `webos`, `samsung`,
`androidtv`, `matter`, `gree`, `miraie`, `aer`, `transport` and `settings`. Keep commits small. If
you add a dependency, give the reason in the commit body.

## Pull requests

- Branch from `main`; one topic per pull request. Every change reaches `main` through a pull
  request with green CI.
- Fill in the pull request template, including the checks.
- Add or update tests with the change.
- For a UI, IR, Wi-Fi or Bluetooth change, describe what you saw on a real phone and device, or say
  that you could not test it.
- For a screen change, update the central mock, `docs/design/one-remote-mockup.html`, in place.

## Licences of new code

One Remote is MIT. The AC IR encoders in `src/ir/lgpl/` are derived from IRremoteESP8266 and stay
under LGPL-2.1, with their own `LICENSE` and `NOTICE.md`. Keep that code in that folder, and list
the upstream files in its `NOTICE.md` when you add an encoder.

Do not copy GPL code, or code with no licence, into the app. Such projects can be read as protocol
references; write the code from your own notes. When you adapt permissively licensed code, credit it
in the file header and in [NOTICE](NOTICE).

## Never commit vendor code, APKs or secrets

Do not commit a vendor app's APK, decompiled vendor code, or anything copied from it. The protocol
notes in `docs/protocol/` describe behaviour in our own words, for interoperability. `*.apk` and
`*.xapk` are in `.gitignore` for this reason.

Never commit a signing key, keystore password, service account key, TV pairing key or MirAIe
sign-in. The release secrets live in GitHub Actions secrets only.

## Report a device result

A report from a real TV, AC, fan or air freshener is the most valuable contribution right now.

1. Install the app (see [Getting started](README.md#getting-started)).
2. Add the device and try each control: power, and for an AC the mode, temperature, fan speed and
   swing; for a TV the touchpad, volume, inputs, keyboard and voice.
3. Open a [device report](https://github.com/DevanshChoubey/one-remote/issues/new?template=device_report.yml).
   It asks for the device type, brand and model, how it connects (IR, Wi-Fi, Bluetooth, Matter or
   MirAIe), your phone, what worked and what did not.

For an AC over IR, say which code set the app picked (the remote's name in the add flow) and the
model on your physical remote, if you can see it. Leave out anything that identifies you or your
home, such as IP or MAC addresses, pairing keys and MirAIe account details.
