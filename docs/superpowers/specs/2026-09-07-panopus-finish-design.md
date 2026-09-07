# Panopus Projects & Finish — GLSL poster renderer (SM task 918)

**Goal:** Panopus becomes the studio pipeline hub. A *project* gathers the fonts for a
poster; the poster is designed in external software (later: our own design tool, SM 919);
the designed artwork returns to Panopus for a *finishing pass* — a node-based GLSL effect
chain previewed live and exported at F4 print resolution.

**Workflow:** Projects → pick fonts → activate them → design outside → drop the export
back on the project → Finish tab → node chain → F4 out.

## Constraints

- Lives inside the existing Panopus app (Tauri v2 + React 19 + TS + Tailwind v4). No new repo.
- House rules apply: design tokens only, all UI text through `useT()` with EN/FR parity,
  DB-truthful state, ESLint zero findings, existing test suites stay green.
- F4 output: 895 × 1280 mm at 300 dpi = **10,571 × 15,118 px**, portrait, RGB.
- Effects are ports of the TouchDesigner fragment shaders in
  `~/Documents/GitHub/TouchDesigner` (all 2D full-screen fragment work; no vertex shaders).

## 1 · Projects

A new sidebar section (route `/projects`, detail `/projects/:id`).

**Data — migration v6:**

```sql
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  artwork_path TEXT,                 -- the designed poster returned from outside
  graph_json TEXT NOT NULL DEFAULT '{}',  -- versioned Finish node graph
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE project_fonts (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  font_id INTEGER NOT NULL REFERENCES fonts(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, font_id)
);
```

**Font selection.** From the Library: the BulkBar gains "Add to project…" (menu of
projects, same pattern as the Tag menu) acting on the current selection. The project
detail page lists its fonts as the existing list rows (specimen preview, remove
affordance) — reusing `FontListRow` without the fold/selection machinery.

**Activation.** The project page has two actions, both through the existing truthful
`set_fonts_active` path:
- **Activate fonts** — activates every font in the project.
- **Activate exclusively** — first deactivates all other non-system active fonts, then
  activates the project's. One confirm dialog states what will be deactivated.

**Artwork.** A drop zone / file picker sets `artwork_path` (PNG or TIFF). Moved file →
relink prompt. Setting artwork enables the Finish tab.

## 2 · Finish — node-based effect chain

Per-project tab. Layout mirrors TouchDesigner muscle memory: preview canvas dominant on
top, node canvas as the bottom panel (`@xyflow/react`), parameters for the selected node
docked right.

**Graph model.** Directed acyclic graph, JSON-serialized (versioned `{"v":1, nodes,
wires, params, positions}`) into `projects.graph_json`, autosaved. Node kinds:
- **Source** — the project artwork (one created automatically). Additional image-source
  nodes may be added (feeding Mix).
- **Effect** — instantiated from the manifest registry (below).
- **Output** — exactly one; what it receives is what previews and exports.

Connect-time cycle rejection; an unwired input samples black so half-built graphs
preview instead of erroring.

**Effect registry.** One folder per effect is the single source of truth for BOTH
runtimes:

```
shaders/<effect>/
  effect.json       -- id, label, inputs (count), passes[], params[]
  *.frag            -- the TD sources, normalized to a GLSL subset both
                       WebGL2 (ES 3.00) and naga's GLSL front-end accept
```

`effect.json` sketch:

```json
{ "id": "dither", "label": "DitherLab", "inputs": 1,
  "passes": [{ "frag": "glsl_dither.frag", "textures": ["glyphAtlas"] }],
  "params": [
    { "name": "algo",  "type": "enum",  "options": ["bayer","halftone","ascii"], "default": "bayer" },
    { "name": "scale", "type": "float", "min": 1, "max": 64, "default": 8 } ] }
```

The parameter panel is generated from `params` (float → slider, enum → select, bool →
toggle, color → swatch); no per-effect UI code. TD's `uTime`-driven noise becomes an
explicit **seed** param — posters are frozen frames; you scrub the seed.

**v1 effects** (mirroring the TOX boundaries):

| Node | Passes | Notes |
|---|---|---|
| DitherLab | 1 | Bayer / halftone / ASCII; glyph atlas shipped as an asset |
| VHS | 2 (signal → CRT) | ports `signal.frag` + `crt.frag` |
| JPEG | 4 (color → DCT → quant → final) | the DCT pipeline |
| Mix | 1, **2 inputs** | from MatrixMixer |

Adding an effect later = drop a folder in `shaders/`, no app-code changes expected.

**Preview.** WebGL2 in the webview: ping-pong framebuffers per pass at fit-to-panel
resolution, re-rendered rAF-throttled while scrubbing. Source textures load through a
small Tauri command returning the file's bytes: artwork may live anywhere the user
picks, so this sidesteps asset-protocol scope and CSP entirely (the existing scope only
covers the font library).

## 3 · Export — native wgpu path (Approach B)

Async Tauri command `export_finish(project_id, formats, dest_dir)`:

1. Decode source images (`image` crate).
2. Compile the same `.frag` files with **naga (glsl-in)**; execute the pass chain on
   **wgpu** at 10,571 × 15,118, RGBA8, ping-pong texture pair (~1.2 GB — fine in Apple
   unified memory; tiling is the documented escape hatch if a future effect needs more,
   not v1).
3. Source scaled to **cover** F4 portrait; aspect-mismatch shows a warning in the UI
   before export.
4. One readback → encode **PNG** (`image`), **TIFF** (`tiff`), **PDF** (`printpdf`,
   page exactly 895 × 1280 mm with the raster placed at 300 dpi). User picks any subset.
5. Progress events stream to the UI; export never blocks the window; failures toast,
   partial files are cleaned up.

Shaders ship as bundled Tauri resources so the release build renders identically to dev.

## 4 · Parity — guarding the two-runtime seam

Preview (WebGL2) and export (wgpu/naga) compile the same sources with different
compilers. Guardrail, in the Art Basel baseline tradition:

- Golden PNGs per effect, generated by the **wgpu** path at 512 × 731, committed.
- `npm run parity`: a Playwright harness drives the *actual* JS preview pipeline over the
  same inputs and diffs against the goldens (per-pixel epsilon + small outlier budget).
- Pre-release gate (like the design-system greps), not part of the fast `npm test` loop.

## 5 · Failure modes

| Failure | Behavior |
|---|---|
| Shader compile error (either runtime) | Node turns red; compiler log shown in the params panel |
| Artwork moved/missing | Relink prompt on the project; Finish tab disabled until resolved |
| Cycle attempted in graph | Connection rejected at drag time |
| Unwired effect input | Samples black; node shows a hollow-input hint |
| Export failure | Toast + log; partial output files removed |

## 6 · Testing

- **vitest:** graph validation + topo-sort, manifest parsing, param-panel generation,
  project hooks (mocked db), Projects/Finish page behaviors per existing RTL patterns.
- **cargo:** migration v6, graph executor on tiny textures with golden hashes, manifest
  loading, export encoders (smallest-size smoke).
- **parity script:** as §4. Existing suites untouched and green.

## 7 · Build order

1. **Projects** — migration v6, hooks, pages, BulkBar "Add to project…", activation actions.
2. **Finish preview** — node editor, manifest registry, WebGL2 executor, DitherLab first.
3. **Full roster + export** — VHS/JPEG/Mix ports; wgpu/naga engine; PNG/TIFF/PDF encoders.
4. **Parity + release** — golden harness, docs, version bump.

Each phase lands reviewed and releasable on its own.

## Out of scope (v1)

CMYK/ICC conversion (printers convert better), tiled rendering, arbitrary canvas sizes
beyond F4 portrait (parameterizing size later is straightforward — the F4 constant lives
in one place), porting TOX-only effects whose GLSL lives inside TD networks (exportable
later via the drop-a-folder convention), replacing the external design step (SM 919).
