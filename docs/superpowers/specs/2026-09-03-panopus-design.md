# Panopus — Font Manager Design Spec

**Date:** 2026-09-03
**Status:** Approved by Loris (chat), pending spec review
**Goal:** A macOS Font Book replacement: activate/deactivate fonts to declutter design
software, and preview fonts in a better environment. Visually part of the Studio
Manager suite.

## 1. Repos & naming

- **`Panopus`** (this repo) — the app. Started as a stripped copy of
  `StudioManager` (Tauri v2, React 19, TypeScript, Tailwind v4, SQLite).
  Kept from SM: Tauri shell + auto-updater, design tokens / 10 themes / 19 accents,
  `components/ui/`, Zustand stores (app/tab/undo), React Query setup, i18n EN/FR,
  command palette (cmdk), settings page patterns, DESIGN-SYSTEM.md and RELEASING.md
  conventions. Deleted: all business pages (clients, invoices, quotes, expenses,
  income, finances, calendar, dashboard widgets tied to billing).
  Identifiers: `ch.panopus.app`, DB `panopus.db`.
- **`panopus-library`** — the existing `TypeRepo` renamed (`gh repo rename`,
  GitHub auto-redirects; local remote updated). Remains the data layer:
  6,345 fonts in 11 source folders + `LICENSING.md` + `scrape-log.md` + contact
  sheet. The app reads a local clone; `git pull` updates the library.
- **Icon/logo:** placeholder assets until delivered; single-file swap wired for
  app icon and about screen.

## 2. Rust core (src-tauri)

Three modules alongside SM's existing patterns (`execute_batch` retained):

1. **`indexer.rs`** — walks library folder + system font dirs
   (`/System/Library/Fonts`, `/Library/Fonts`, `~/Library/Fonts`); parses TTF/OTF
   with `ttf-parser` (family, style, PostScript name, glyph count, format);
   md5 hash for dedupe/change detection; incremental re-index by mtime.
   System scan filters out the Noto family (clutter, per user). System fonts
   (`is_system = 1`) are read-only awareness: shown in the grid, activation
   toggle disabled (macOS manages them).
   Results upserted to SQLite. Corrupt files are quarantined (listed under
   Settings → Problems), never crash the scan.
2. **`activation.rs`** — CoreText registration via `core-text`/`objc2` crates:
   `CTFontManagerRegisterFontsForURL` / `CTFontManagerUnregisterFontsForURL`,
   **user scope**. On app launch, re-registers all fonts marked active in the DB
   (persistence across reboots). Batch APIs for bulk activation. Emits per-font
   success/failure events to the UI; DB marks a font active only after CoreText
   confirms.
3. **`watcher.rs`** — `notify` crate watching the library folder; changes
   (e.g. `git pull`) trigger incremental re-index.

## 3. Data model (SQLite)

- `fonts` (id, path, family, style, ps_name, source, format, glyph_count, hash,
  is_system, active, favorite, added_at)
- `tags` (id, name, color) — SM tag-color system
- `font_tags` (font_id, tag_id)
- `sources` (name, licence_status, note) — seeded from LICENSING.md:
  `free` / `personal use` / `rights unclear` / `commercial` / `donationware`
- `designers` (id, name, slug, content_json /* Tiptap */, links)
- `designer_sources` (designer_id, source) — fonts inherit their designer via
  source folder
- SM-style `settings` table (library path, proof text default, theme, etc.)

## 4. UI

SM chrome: sidebar + tab bar + command palette + themes.

- **Sidebar:** Library (all) · Favorites · Active · Sources (with counts +
  licence dot) · Tags · Designers · Settings.
- **Grid (main view):** virtualized rows; lazy `@font-face` injection via Tauri
  asset protocol (pattern proven by the panopus-library contact sheet at 6,345
  fonts). Card = preview line (live proof text), family/style, source, licence
  chip, favorite star, activation toggle.
  Toolbar = proof text field (+ presets: pangram, alphabet, numerals), size
  slider, search, sort (name/recent/source), filters (active, favorites,
  licence, tag).
- **Bulk activation:** checkbox selection; activate/deactivate an entire tag,
  source, search result, or manual selection. Header shows live active count.
- **Detail panel** (right slide-over): large proof render, metadata (family
  styles, glyph count, path, designer link), tag editor, and two **opt-in tabs**
  (closed by default): **Glyph map** (unicode grid rendered in the font) and
  **Waterfall** (72→10 px cascade).
- **Compare view:** pin fonts from cards; a Compare tab stacks pinned fonts with
  shared proof text/size, re-orderable, inline activate buttons.

## 5. Designer wiki

- `Designers` list + detail pages. Detail = Tiptap editor (same as SM Wiki),
  links section, auto-generated "Fonts by this designer" strip via
  `designer_sources`.
- **Seed migration** ships pages for: Dieter Steffmann, Manfred Klein, Dick Pape,
  Nick Curtis, Igino Marini, Peter Wiegel, Vernon Adams, Fredrick Nader
  (Apostrophic), and foundry pages for OPTI/Castcraft, Bitstream, Astigmatic —
  content from the 2026-09-03 research session, with source links. Fully
  editable afterwards.

## 6. Errors & testing

- Activation failures → sonner toast + per-font error state; DB stays truthful.
- Index errors → quarantine list, not crashes.
- Vitest + RTL (SM conventions): indexer fixtures (valid/corrupt/duplicate),
  activation state machine with mocked IPC, grid filter/tag logic, seed
  migration integrity. Rust unit tests: name-table parsing, batch registration.
- ESLint zero-findings + design-system audit before releases (SM release
  process applies).

## 7. Out of scope (roadmap, logged in Studio Manager)

- Texture-pack repo (scrape texturelabs.org + similar)
- Mockup repo (free mockup resources)
- GLSL script renderer (A4→F4 print-res exports; port of TouchDesigner shaders)
- Lightweight design app (type/image placement + shaders)
- Auto style classification (serif/sans/script detection)
- Velvetyne scrape → lands in `panopus-library` as a new source (task, not part
  of this app spec)
