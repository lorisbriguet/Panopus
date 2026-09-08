<p align="center">
  <img src="assets/icon.png" alt="Panopus" width="128" height="128">
</p>

<h1 align="center">Panopus</h1>

<p align="center">
  A macOS font manager — a Font Book replacement for a curated private library of 6,345 fonts.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

---

## What is Panopus?

Panopus manages one thing well: a large personal font library that macOS Font Book chokes on. It indexes the library folder (plus the system font directories), activates and deactivates fonts through CoreText without copying files around, and renders live previews of every face — offline, local, fast.

Built with **Tauri v2** (Rust backend) and **React** (TypeScript frontend).

## Features

- **Indexing** — Rust indexer parses TTF/OTF metadata (family, style, glyph count) across the whole library; a filesystem watcher re-indexes automatically when the folder changes
- **Activation** — per-font and bulk activate/deactivate via CoreText user-scope registration; active fonts are re-registered on every launch (the database is the source of truth)
- **Live proofing** — library grid renders every family in its own face, with editable proof text, presets (pangram/alphabet/numerals) and size control
- **Detail panel** — glyph map, waterfall, styles, tags, licence status and reveal-in-Finder
- **Compare view** — pin fonts from the library and compare them side by side, reorderable
- **Designer wiki** — editable bios (Tiptap) for the designers and foundries behind the library's sources, seeded with researched entries and links
- **Problems list** — files that fail to parse are quarantined, listed in Settings and excluded from the library
- **Licence tracking** — every font belongs to a source with a licence status (free / personal use / commercial / rights unclear)
- **Projects & Finish** — group fonts per poster project, activate them (plain or exclusive), attach the returned artwork and post-process it in a node editor with live WebGL2 preview; export print-ready files
- **Bilingual UI** — English and French; light/dark themes and accent colors

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Tauri v2](https://v2.tauri.app/) (Rust) |
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS v4 (token-based design system) |
| Database | SQLite (tauri-plugin-sql frontend, rusqlite backend) |
| State | Zustand (UI) + TanStack Query (DB) |
| Font parsing | ttf-parser |
| Activation | CoreText (CTFontManager, user scope) |
| Rich text | Tiptap |
| Icons | Lucide React |

## Development

```bash
npm install          # install dependencies
npm run tauri dev    # run the app in development mode
npm run tauri build  # production build (.dmg under src-tauri/target)

npx tsc --noEmit     # typecheck
npm test             # frontend tests (vitest)
npm run lint         # eslint
cargo test           # Rust tests (run in src-tauri/)
```

### Data location

```
~/Library/Application Support/ch.panopus.app/panopus.db
```

The font library itself lives in a separate folder (default `~/Documents/GitHub/panopus-library`, configurable in Settings). Panopus never modifies the font files; it only reads them and registers them with CoreText.

## Projects & Finish

A project is a poster's dossier: its font selection, the returned artwork, and a Finish node graph.

**Workflow** — create a project, add fonts from the library (BulkBar → Add to project), activate them plain or *exclusively* (deactivates everything else), attach the artwork (PNG/TIFF), then chain effects in the Finish tab: source → effects → output, with a live preview and per-node parameters. The graph autosaves. Export renders the graph at print resolution and writes PNG / TIFF (deflate) / PDF.

**F4 constant** — exports target the Swiss F4 poster format: **10571 × 15118 px** (300 dpi) on an **895 × 1280 mm** PDF page, full bleed. Artwork whose aspect ratio is more than 1% off F4 gets cover-cropped (the export dialog warns).

**Effect folder convention** — each effect lives in `shaders/<id>/`:

```
shaders/<id>/
  effect.json     # manifest: id, label, inputs, passes, params
  *.frag          # one GLSL fragment shader per pass (no #version/precision;
                  # the hosts inject their headers)
  *.png           # optional texture assets referenced by passes
```

The same folder feeds both renderers: the WebGL2 preview in the webview and the wgpu/naga export engine in Rust. `npm run parity` (see RELEASING.md) renders the graph cases in `test/parity/cases/` through both and diffs against committed goldens; shaders must stay bit-stable across compilers (integer hashes, no `fract(sin(...))`).

**Operators beyond effects** — the graph also has built-in operators: multiple **Source** operators (collage: each carries its own artwork), **Scale** (resolution is a chain property: de-res before an effect, up-res after, smooth or pixel resampling) and multiple named **Output** operators (each a deliverable with its own size/unit/dpi/color/fit; export writes every checked output in one run). Graph editing has local undo (Cmd+Z / Cmd+Shift+Z), and effect subchains can be saved as app-wide **recipes** and pasted into any project.

**Effect library** — dither, VHS, JPEG, mix (composite with blend modes), transform (layer placement), gradient map, posterize, halftone (gray/CMYK screens), riso, and a **Text operator**: set type in the project's own fonts, rasterized by the webview (cached in app-data, composited identically by the exporter), with the block draggable directly on the preview — transform layers drag the same way. Shader portability rules earned by the parity harness: integer hashes (no `fract(sin)`), texel-snapped pattern sampling, and portable polynomial trig for rotated lattices — native GPU `sin/cos` isn't cross-backend stable.

## Project Structure

```
src/                    # React frontend
  components/
    ui/                 # Design system (Button, Badge, Modal, ...)
    fonts/              # Font grid, detail panel, glyph map, waterfall
    layout/             # MainLayout, Sidebar, TabBar
  db/                   # tauri-plugin-sql access + transaction batching
  hooks/                # Data hooks (fonts, tags, activation)
  i18n/                 # EN/FR strings
  pages/                # Library, Compare, Designers, Settings
src-tauri/              # Rust backend
  src/indexer.rs        # Font parsing + library scan/upsert
  src/activation.rs     # CoreText register/unregister
  src/watcher.rs        # Library folder watcher
  src/bootstrap.rs      # First-boot schema bootstrap
```

## Limitations

- **Library location is fixed for previews** — the asset protocol scope is compile-time limited to `~/Documents/GitHub/panopus-library` (plus the system font directories). Choosing a library folder outside that path in Settings breaks font previews in this version.
- **Auto-updater is unwired** — the updater plugin is not registered; updates are manual (see RELEASING.md).

## License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Made in Switzerland by <a href="https://lorisbriguet.ch">Loris Briguet</a>
</p>
