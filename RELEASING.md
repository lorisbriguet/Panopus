# Releasing Panopus

Step-by-step guidelines for publishing a new release on GitHub. Follow in order; every gate must pass before moving on.

> **Release-setup TODO — auto-updater is currently NOT wired.** The updater plugin registration was removed from `src-tauri/src/lib.rs` when the updater endpoints were stripped from `tauri.conf.json` (an endpoint-less registration crashes the app at boot). Before the first public release that should auto-update, re-wire it: re-register `tauri_plugin_updater` in `lib.rs`, add the `plugins.updater` config (endpoints + pubkey) to `tauri.conf.json`, and only then do steps 4, 6 and 8 below become load-bearing. Do not restore the old StudioManager endpoints.

---

## 0. Prerequisites (one-time setup)

- `gh` CLI authenticated against the Panopus repository.
- Tauri updater signing key at `~/.tauri/Panopus.key`. **Never commit it.** Its public key gets pinned in `src-tauri/tauri.conf.json` when the updater is re-wired — if the private key is ever lost, shipped apps can no longer auto-update.
- Node **20.19+ or 22.12+** (Vite requirement) and stable Rust.
- App identifier is `ch.panopus.app` — user data lives in `~/Library/Application Support/ch.panopus.app/`.

## 1. Pre-release validation (all must pass)

```bash
npx tsc --noEmit                  # zero errors
npm test                          # all tests green
npm run lint                      # exit 0, zero findings
(cd src-tauri && cargo test)      # all Rust tests green
```

- Working tree contains only the changes meant for this release; no debug code, `console.log` leftovers, or commented-out hacks.
- No secrets/PII in the diff (keys, personal paths). Note the repo may be public.

## 2. Design-system compliance audit (required)

Grep gates from `DESIGN-SYSTEM.md` — all must return **0**:

```bash
grep -rnE 'bg-gray-|text-gray-|border-gray-|divide-gray-' src --include='*.tsx' | wc -l
grep -rn 'dark:' src --include='*.tsx' | grep -v '// ' | grep -vE 'dark: boolean|darkMode' | wc -l
grep -rnE '>[✕←→✓▸↑↓]<' src --include='*.tsx' | wc -l
```

Plus the checklist: badges/tags `rounded-full`, inputs/selects `rounded-lg`, small buttons `rounded-md`, lucide icons at standard sizes, all user-visible strings through `useT()`/`getLabels()`. EN/FR key parity in `src/i18n/ui.ts` must be exact (enforced by `src/__tests__/i18nParity.test.ts`; FR accent-free).

## 3. Version bump (SemVer)

Decide the bump from the actual changes: MAJOR = breaking, MINOR = features, PATCH = fixes only. Then update the version in **all three places** — they must match exactly:

1. `package.json` → `"version"`
2. `src-tauri/tauri.conf.json` → `"version"`
3. `src-tauri/Cargo.toml` → `version` (then run a build/`cargo check` so `Cargo.lock` updates)

## 4. Build (signing is load-bearing once the updater is re-wired)

```bash
export TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/Panopus.key)
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npm run tauri build
```

**Without the signing env vars the build still succeeds but produces an invalid update signature** — updaters download to 100% then fail. Never skip them for updater-enabled releases. (While the updater is unwired, an unsigned build only affects auto-update, not the .dmg itself.)

Build outputs (under `src-tauri/target/release/bundle/`, or `$CARGO_TARGET_DIR/release/bundle/` if set):
- `dmg/Panopus_X.Y.Z_aarch64.dmg`
- `macos/Panopus.app.tar.gz` + `Panopus.app.tar.gz.sig`

Smoke-test the built .dmg app before publishing: launch, check the library grid renders the full library, activate/deactivate a font, open the detail panel and Settings → re-index.

## 5. Changelog + docs

- Write the changelog from real commits/changes, grouped: Features / Fixes / Refactors / Breaking. Concise, user-facing wording; no noise.
- Update `README.md`: feature list if features shipped, remove anything now inaccurate.
- Keep `IDEAS.md` in sync (move shipped items to the Done section).

## 6. latest.json (auto-updater manifest — only once the updater is re-wired)

The in-app updater fetches `releases/latest/download/latest.json`. **If it's missing or malformed, every installed app shows "Update check failed".** Exact format:

```json
{
  "version": "X.Y.Z",
  "notes": "Release description",
  "pub_date": "YYYY-MM-DDTHH:MM:SSZ",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<contents of Panopus.app.tar.gz.sig>",
      "url": "https://github.com/lorisbriguet/Panopus/releases/download/vX.Y.Z/Panopus.app.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "<same signature>",
      "url": "https://github.com/lorisbriguet/Panopus/releases/download/vX.Y.Z/Panopus.app.tar.gz"
    }
  }
}
```

The signature is the literal contents of the `.sig` file from step 4. The `url` must reference the tag you are about to create (`vX.Y.Z`).

## 7. Commit, tag, release

```bash
git add <release files>            # only what belongs in the release
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z                     # tag == version, always v-prefixed
git push origin main --tags

gh release create vX.Y.Z \
  --title "Panopus vX.Y.Z" \
  --notes-file <changelog file> \
  Panopus_X.Y.Z_aarch64.dmg \
  Panopus.app.tar.gz \
  latest.json
```

Once the updater is re-wired, **every release must carry all three assets** (.dmg, .app.tar.gz, latest.json). Use `gh release upload vX.Y.Z <file> --clobber` to replace an asset.

## 8. Post-release validation

- `git status` clean; tag, `package.json`, `tauri.conf.json`, `Cargo.toml` all agree.
- Updater-enabled releases: `curl -sL .../releases/latest/download/latest.json` returns the new version with a non-empty signature, and an installed previous version updates end-to-end (the real signature test).
- Note follow-ups/risks in `IDEAS.md`.

## Common failure modes

| Symptom | Cause |
|---|---|
| "Update check failed" immediately | `latest.json` missing from the release or malformed |
| Update downloads to 100% then fails | Build ran without `TAURI_SIGNING_PRIVATE_KEY` (invalid signature) |
| Updater never sees the release | Tag/URL mismatch (`latest.json` url vs actual tag), or release marked draft/pre-release |
| App boots but library is empty | `library_path` setting points at a missing folder — the indexer refuses to run rather than wipe rows |
