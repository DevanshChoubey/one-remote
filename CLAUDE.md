# One Remote

Expo (SDK 58) + TypeScript app (Android and iPhone): one offline remote for the TV, ACs and fans.
Bun only (`bun install`, `bun add`, `bunx`, `bun run`); never npm, yarn or pnpm.

Status: design phase. Before changing anything, read:

- `docs/research/2026-10-30-market-and-validation.md` - the context, test devices, decisions so far
  and technical findings.
- `docs/design/one-remote-mockup.html` - the one central mock (tokens, all screens and states, motion).
  Edit it in place; never add a second mock or a new version file (git keeps the history).

The engineering rules will be copied from the author's Aer Remote app (`DevanshChoubey/aer-remote`,
`docs/ENGINEERING.md`). The one planned change is the privacy rule: local network only, instead of
removing the `INTERNET` permission.

Commit as `Devansh Choubey <devanshc13@gmail.com>`. Use Conventional Commit messages. Do not push unless
asked.
