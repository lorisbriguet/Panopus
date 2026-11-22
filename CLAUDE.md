# Panopus: notes for agents

A macOS font manager (Tauri v2 with a Rust backend, React and TypeScript frontend). What it does and how it is laid out: [the README](README.md). How a release goes out: [RELEASING.md](RELEASING.md). UI rules: [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md). Backlog: [IDEAS.md](IDEAS.md). Design and plans: [the design spec](docs/superpowers/specs/2026-09-03-panopus-design.md), [the plans](docs/superpowers/plans/2026-09-03-panopus-v1.md).

## Run and check

```bash
npm install
npm run tauri dev     # run the app
npx tsc --noEmit      # typecheck
npm run lint
npm test              # vitest
(cd src-tauri && cargo test)
```

- Run cargo from inside `src-tauri`, never from the repo root.
- CI (`.github/workflows/ci.yml`) runs typecheck, lint and vitest on every pull request; Rust tests are not in CI, so run them yourself. The full pre-release list is [RELEASING.md, step 1](RELEASING.md#1-pre-release-validation-all-must-pass).
- UI changes follow [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md): CSS tokens, no hardcoded gray classes, every visible string through the EN/FR labels (key parity is enforced by `src/__tests__/i18nParity.test.ts`).

## Public repo

The repo is public: no secrets, signing keys (`~/.tauri/Panopus.key` never goes in git), client names or personal paths in code, fixtures, docs or commit messages. Panopus never modifies the font files of the library; keep it that way.

## Git

- Never push to `main`. Work on a branch and open a draft pull request; Loris merges.
- Commits are signed (`commit.gpgsign` is on); do not bypass it.
