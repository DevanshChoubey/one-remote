# Engineering rules

These rules apply to every task and every contributor, human or AI. Most are enforced by tooling
(ESLint, TypeScript, Jest, lefthook, CI). Lint, typecheck and tests must pass before each commit.

Related: the design spec in `docs/superpowers/specs/` and the plan in `docs/superpowers/plans/`.
Adapted from Aer Remote's `docs/ENGINEERING.md`.

## Tooling

Bun only: `bun install`, `bun add`, `bunx`, `bun run <script>`. Never npm, yarn or pnpm, and no
`package-lock.json`. Tests run Jest through `bun run test` (the React Native Jest preset needs Jest, not
`bun test`). Use `bunx expo install` for anything native so versions match the SDK.

| Script              | What it does                      |
| ------------------- | --------------------------------- |
| `bun run test`      | Jest (`jest-expo` preset)         |
| `bun run typecheck` | `tsc --noEmit`                    |
| `bun run lint`      | `expo lint` (ESLint, flat config) |

## Layering

Imports may only point downward:

`app/` (routes, thin) -> `src/screens/` (feature UI and hooks) -> `src/ui/` (components) ->
`src/ui/primitives/` -> `src/theme/`.

Domain modules (`src/core`, `src/device`, `src/store`, `src/transport`, `src/ir`, `src/webos`,
`src/matter`) and `src/services` never import from `app/`, `src/screens/` or `src/ui/`. Screens reach
services only through `useServices()`, never by importing `src/device`, `src/store`, `src/transport`,
`src/ir`, `src/webos` or `src/matter` directly. `src/services` (`services.tsx`, `createServices.ts`) is
the composition root: it wires the modules together and may import React and Expo.

`src/core`, `src/device`, `src/ir`, `src/webos` and `src/matter` are additionally pure TypeScript: they
must not import `react-native`, `react-native-*`, `expo`, `expo-*` or `@react-native-async-storage/*`,
so they run in plain Jest and Node. The one exception is `src/matter/native/`, which holds the native
module adapter. Enforced with ESLint `no-restricted-imports` per folder (see `eslint.config.js` and
`tests/lint-rules.test.ts`).

## Primitives

`src/ui/primitives/` is the only place that imports React Native's visual building blocks (`View`,
`Text`, `Pressable`, `TextInput`, `Image`, `ScrollView`, `StyleSheet`). Everything else composes from:

- `Box` with token-typed props: `p/px/py/m/gap` in spacing steps, `bg` and `border` as color-token
  names, `radius` as a radius-token name
- `Row` and `Column`
- `Txt` with `variant` and `color` token names
- `Touchable` (always has `accessibilityRole`, min 48dp hit area)
- `Input` and `Spacer` (an `Img` primitive is not built yet)

Enforced by ESLint `no-restricted-imports` of those names from `react-native` outside
`src/ui/primitives/`, plus `tests/theme-centralized.test.ts`.

## Centralized theme

Tokens live only in `src/theme/tokens.ts`. Primitives accept token _names_, not raw values (for
example `bg="surface"`, never `bg="#fff8ec"`). No hex/rgb color literals, font family names, or numeric
radii/shadows outside `src/theme/`. Dark mode comes from the same token names (`darkTokens` has the
same keys as `lightTokens`).

## Copy

All user-facing strings live in `src/i18n/en/<namespace>.ts`, accessed via `t('home.title')`. This
keeps other languages possible later.

## TypeScript

`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`. No `any` (use `unknown` and narrow it). No
non-null `!` outside tests. Exported functions have explicit return types.

## Code style

Prettier (`printWidth: 100`, single quotes) and ESLint (`eslint-config-expo` plus the rules above,
`no-console` except `console.warn/error`, `import/no-cycle`, `import/order`). Files in `src/` are camelCase
for modules (`fakeTv.ts`, `useRoomDraft.ts`) and PascalCase for components. One component per file. Named exports, except expo-router route
files, which need default exports.

## Errors

Domain code throws typed errors (`DeviceError` and the like). Screens map them to friendly copy from
`errors.*`. Never show raw error messages, and never swallow an error silently.

## Privacy

**Local network only.** Android needs the `INTERNET` permission for any socket, so it stays. The rule
is enforced in code instead:

- All networking lives in `src/transport`, the only place with sockets, discovery and the native IR
  and Matter adapters.
- `fetch` and `XMLHttpRequest` are banned by ESLint (`no-restricted-globals`) in every file, except
  `fetch` in `src/transport/cloud.ts`, the opt-in MirAIe client (the single cloud exception).
  `WebSocket` is allowed only in `src/transport/**`, and `dgram` and `react-native-udp` can be imported
  only there (`no-restricted-imports`). `tests/lint-rules.test.ts` checks these rules.
- Every outgoing unicast connect goes through `assertLocal()` before connecting, and throws a typed
  error otherwise. Local means an IPv4 private (RFC 1918), link-local or loopback address; an IPv6 ULA,
  link-local or loopback address; or an address inside one of the phone's own on-link prefixes.
- Multicast is allowed only to `239.255.255.250` (SSDP), `224.0.0.251` and `ff02::fb` (mDNS), and other
  `ff02::/16` link-local addresses. Broadcast is allowed only to the phone's subnet broadcast address
  (Wake-on-LAN).
- No analytics, crash reporting, remote config or telemetry. Location is not requested. Never log
  device identifiers beyond what a debug screen shows the user.

## Accessibility

Every touchable has a label and role; text scales with OS font size; touch targets are at least 48dp;
contrast meets WCAG AA.

## Testing

TDD: write the failing test, watch it fail, implement, watch it pass. Tests live in `tests/` mirroring
`src/`. Coverage threshold is 80% lines for `src/core`, `src/device`, `src/store` and `src/transport` (Jest `coverageThreshold`, checked in CI with `bun run test --coverage`).

## Git

Conventional Commits (`feat(scope): ...`, `fix`, `chore`, `docs`, `test`, `refactor`), checked by the
lefthook `commit-msg` hook. `pre-commit` runs Prettier and ESLint on staged files; `pre-push` runs
`bun run typecheck && bun run test` and refuses pushes to `main`. Small commits, one task per branch
(`lane/<task-id>`); every change reaches `main` through a pull request with green CI. The repo is public,
so GitHub branch protection on `main` is free: turn it on (required CI, no direct pushes) if it is
not on yet.

## CI

`.github/workflows/ci.yml` on push and PR: `oven-sh/setup-bun`, `bun install --frozen-lockfile`,
`bun run typecheck`, `bun run lint`, `bun run test --coverage`, `bunx expo-doctor`.

## Dependencies

Adding a dependency needs a reason in the commit body. Prefer Expo-maintained packages.
