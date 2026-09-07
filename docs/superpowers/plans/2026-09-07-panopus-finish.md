# Panopus Projects & Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Projects (per-poster font selection + activation) and Finish (node-based GLSL effect chain with live preview and F4 300dpi export) inside Panopus.

**Architecture:** New `projects`/`project_fonts` tables (migration v6). Effects live in `shaders/<effect>/` as `effect.json` + `.frag`, consumed by BOTH a WebGL2 preview executor in the webview and a wgpu+naga export engine in Rust. Node editor via @xyflow/react; graph JSON autosaves per project. Export encodes one 10,571×15,118 RGBA8 readback into PNG/TIFF/PDF.

**Tech Stack:** Tauri v2, React 19, TS, Tailwind v4, @xyflow/react, WebGL2; Rust: wgpu, naga (glsl-in), image, tiff, printpdf.

**Spec:** `docs/superpowers/specs/2026-09-07-panopus-finish-design.md`

## Global Constraints

- F4 output: 895 × 1280 mm at 300 dpi = **10,571 × 15,118 px**, portrait, RGB(A8).
- House rules: design tokens only (no hardcoded grays/hex), ALL UI text via `useT()` with EN/FR parity (accent-free FR), DB-truthful state, lint zero findings.
- Rust lib crate is `panopus_lib`; migrations use the shared `MIGRATIONS` const (plugin + bootstrap; sqlx checksums — never edit an existing migration string).
- Existing suites stay green: `npx tsc --noEmit && npm test && npm run lint` and `cargo test` in src-tauri, per commit.
- TD shader sources: `/Users/loris.briguet/Documents/GitHub/TouchDesigner/` (read-only — copy, never modify).
- Frag normalization contract (both compilers must accept): no `#version` line (each runtime prepends its own header), inputs `uniform sampler2D uTex0[, uTex1]`, `uniform vec2 uRes`, params as scalar/vec uniforms named exactly as in `effect.json`, `in vec2 vUv; out vec4 fragColor;`.

---

### Task 1: Migration v6 — projects tables

**Files:**
- Modify: `src-tauri/src/lib.rs` (MIGRATION_V6 + MIGRATIONS grows to 6)
- Test: `src-tauri/tests/migration.rs`

**Interfaces:**
- Produces: tables `projects(id, name, artwork_path, graph_json DEFAULT '{}', created_at, updated_at)`, `project_fonts(project_id, font_id, PK pair, CASCADE both)`.

- [ ] **Step 1: Failing test** (append to migration.rs):

```rust
#[test]
fn migration_v6_creates_project_tables() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(panopus_lib::MIGRATION_V1).unwrap();
    conn.execute_batch(panopus_lib::MIGRATION_V6).unwrap();
    conn.execute("INSERT INTO projects (name) VALUES ('Fumetto 26')", []).unwrap();
    conn.execute("INSERT INTO fonts (path,family,source,format,hash) VALUES ('/a.ttf','A','opti','ttf','h')", []).unwrap();
    conn.execute("INSERT INTO project_fonts (project_id, font_id) VALUES (1, 1)", []).unwrap();
    conn.execute("DELETE FROM projects", []).unwrap();
    let n: i64 = conn.query_row("SELECT count(*) FROM project_fonts", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 0, "cascade");
}
```

- [ ] **Step 2: Run → FAIL** (`cargo test migration_v6` in src-tauri; MIGRATION_V6 not found).
- [ ] **Step 3: Implement** in lib.rs next to MIGRATION_V5:

```rust
/// Projects: a poster's dossier — its font selection, returned artwork and
/// Finish node graph (spec 2026-09-07-panopus-finish-design.md §1).
pub const MIGRATION_V6: &str = r#"
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  artwork_path TEXT,
  graph_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE project_fonts (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  font_id INTEGER NOT NULL REFERENCES fonts(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, font_id)
);
"#;
```

Grow the const: `MIGRATIONS: [(i64, &str, &str); 6]` adding `(6, "panopus_projects", MIGRATION_V6)`. Bootstrap handles unknown versions generically; its tests count from `MIGRATIONS.len()`.

- [ ] **Step 4: Run → PASS** (`cargo test` — all suites).
- [ ] **Step 5: Commit** — `git add src-tauri/src/lib.rs src-tauri/tests/migration.rs && git commit -m "feat: migration v6 — projects tables"`

---

### Task 2: Project data hooks

**Files:**
- Create: `src/hooks/useProjects.ts`
- Test: `src/hooks/__tests__/useProjects.test.tsx`

**Interfaces:**
- Consumes: `getDb()` from `src/db` ($N-parameterized), React Query patterns from `src/hooks/useTags.ts` (read it first; mirror invalidation style; MutationCache backstop handles errors — no per-hook onError).
- Produces:
  - `type ProjectRow = { id: number; name: string; artwork_path: string | null; graph_json: string; created_at: string; updated_at: string }`
  - `useProjects()` → `['projects']`, `SELECT * FROM projects ORDER BY updated_at DESC`
  - `useProject(id: number)` → `['projects', id]`
  - `useCreateProject()` (mutate `name: string`), `useRenameProject()` (`{id, name}`), `useDeleteProject()` (`id`) — all set `updated_at = datetime('now')` on UPDATE, invalidate `['projects']`
  - `useProjectFontIds(projectId: number)` → `['project-fonts', projectId]`, `SELECT font_id FROM project_fonts WHERE project_id = $1` → `number[]`
  - `useAddFontsToProject()` (mutate `{projectId, fontIds}` — ONE statement, `INSERT OR IGNORE ... VALUES ($2,$1),($3,$1)...` exactly like `useAssignTagBulk` in useTags.ts), `useRemoveFontFromProject()` (`{projectId, fontId}`) — invalidate `['project-fonts', projectId]`
  - `useSetProjectArtwork()` (`{id, path}` → UPDATE artwork_path + updated_at, invalidate both keys)
  - `useSaveProjectGraph()` (`{id, graphJson}` → UPDATE graph_json + updated_at, invalidate `['projects', id]`)

- [ ] **Step 1: Failing tests** — mirror `src/hooks/__tests__/useActivation.test.tsx` mocking style (mock `../db`): create → INSERT with name; add-fonts builds `($2, $1), ($3, $1)` placeholders with `[projectId, ...fontIds]` params; remove issues parameterized DELETE. Assert SQL strings + params arrays.
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement.** **Step 4: `npx tsc --noEmit && npm test` → PASS, lint clean.**
- [ ] **Step 5: Commit** — `"feat: project data hooks"`

---

### Task 3: Projects pages + route

**Files:**
- Create: `src/pages/ProjectsPage.tsx`, `src/pages/ProjectDetailPage.tsx`
- Modify: `src/App.tsx` (routes `projects`, `projects/:id`), `src/components/layout/Sidebar.tsx` (nav item, Lucide `FolderKanban`, between Designers and Settings), `src/i18n/ui.ts`
- Test: `src/pages/__tests__/projects.test.tsx`

**Interfaces:**
- Consumes: Task 2 hooks; `FontListRow` (`src/components/fonts/FontListRow.tsx` — pass `font`, `proofText`, `proofSize`; NO `onOpenDetail`, no chip), `useFonts()` rows filtered by `useProjectFontIds`.
- Produces: `/projects` list (create input + rows linking to detail, delete with the two-click confirm pattern from TagManager), `/projects/:id` detail: name (inline rename), font list section with per-row remove button, placeholder sections for artwork/activation (Tasks 4-5 fill them). i18n keys (flat, EN + accent-free FR): `projects`, `project_new_placeholder`, `project_create`, `project_delete`, `confirm_delete_project`, `project_fonts_title`, `project_remove_font`, `project_empty`, `projects_empty`.

- [ ] **Step 1: Failing RTL tests** — mock useProjects/useFonts modules: list renders projects + create calls hook; detail renders its fonts' family names; remove button calls `useRemoveFontFromProject().mutate({projectId, fontId})`.
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** (PageHeader/EmptyState/Button/Input house components; detail loads `useProject(Number(useParams().id))`).
- [ ] **Step 4: Gates.** **Step 5: Commit** — `"feat: projects pages"`

---

### Task 4: BulkBar "Add to project"

**Files:**
- Modify: `src/components/fonts/BulkBar.tsx`, `src/i18n/ui.ts`
- Test: `src/components/fonts/__tests__/bulkproject.test.tsx`

**Interfaces:**
- Consumes: `useProjects()`, `useAddFontsToProject()` (Task 2); BulkBar's existing Tag popover-menu pattern (read the TagMenu implementation in BulkBar and mirror it exactly: `role="menu"`, `aria-haspopup`, Escape/outside-click close).
- Produces: a "Project" button beside "Tag" opening a menu of all projects; clicking one calls `mutate({projectId, fontIds: Array.from(selectedIds)})` and keeps the selection. Empty-projects state shows `no_projects_yet` menu line. Keys: `bulk_project_menu` ("Project"/"Projet"), `no_projects_yet`.

- [ ] **Step 1: Failing RTL test** — 3 selected ids, open menu, click a project → mutate `{projectId: 7, fontIds: [1,2,3]}`; menu lists project names (mock useProjects).
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: Gates. Step 5: Commit** — `"feat: add selection to project from bulk bar"`

---

### Task 5: Project font activation actions

**Files:**
- Modify: `src/pages/ProjectDetailPage.tsx`, `src/i18n/ui.ts`
- Test: extend `src/pages/__tests__/projects.test.tsx`

**Interfaces:**
- Consumes: `useSetActive()` (`mutate({ids, active})`, per-id truthful results — src/hooks/useActivation.ts), `useFonts()` rows (for "other active" = `active===1 && is_system===0 && !projectFontIds.includes(id)`).
- Produces: two buttons on the detail page: **Activate fonts** (primary → `mutate({ids: projectFontIds, active: true})`) and **Activate exclusively** (secondary → confirm dialog listing the count to deactivate, then `mutate({ids: otherActiveIds, active: false})` followed by `mutate({ids: projectFontIds, active: true})` — sequence via the first mutation's `onSuccess`). Confirm uses the house `Modal`. Keys: `project_activate`, `project_activate_exclusive`, `confirm_exclusive_body` ("{count} other active fonts will be deactivated" + `_one` variant, EN/FR).

- [ ] **Step 1: Failing RTL tests** — Activate calls with project ids; Exclusive opens modal, confirm deactivates others THEN activates (assert order via mock call log); zero-others skips the deactivate call.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: Gates. Step 5: Commit** — `"feat: project font activation, plain and exclusive"`

---

### Task 6: Artwork attach + bytes command

**Files:**
- Modify: `src-tauri/src/lib.rs` (command), `src/pages/ProjectDetailPage.tsx`, `src/i18n/ui.ts`
- Test: `src-tauri/tests/artwork.rs`, extend `src/pages/__tests__/projects.test.tsx`

**Interfaces:**
- Produces (Rust): `#[tauri::command] fn read_artwork_bytes(path: String) -> Result<tauri::ipc::Response, String>` — reads the file, rejects extensions other than png/tif/tiff (case-insensitive), returns raw bytes via `tauri::ipc::Response::new(bytes)` (binary IPC, no base64). Register in `generate_handler!`.
- Produces (UI): detail-page artwork section — picker via `open({filters: [{name: 'Image', extensions: ['png','tif','tiff']}]})` from `@tauri-apps/plugin-dialog` → `useSetProjectArtwork`. Shows the file name; if `artwork_path` set but `read_artwork_bytes` fails, show relink prompt (`artwork_missing` key + re-pick button). A `Finish` tab affordance appears only when artwork is set (the tab itself lands in Task 10). Keys: `project_artwork_title`, `project_pick_artwork`, `artwork_missing`, `finish_tab`.

- [ ] **Step 1: Failing Rust test** — write a temp png-named file with bytes `[1,2,3]`, command returns them; a `.txt` path errors. (Call the inner logic: factor `fn read_artwork_file(path: &str) -> Result<Vec<u8>, String>` so the test skips the IPC wrapper.)
- [ ] **Step 2: FAIL. Step 3: Implement both sides. Step 4: `cargo test` + npm gates. Step 5: Commit** — `"feat: project artwork attach with relink"`

---

### Task 7: Effect manifest registry + DitherLab assets

**Files:**
- Create: `shaders/dither/effect.json`, `shaders/dither/glsl_dither.frag` (normalized copy of `/Users/loris.briguet/Documents/GitHub/TouchDesigner/DitherLab/src/glsl_dither.frag`), `shaders/dither/glyph-atlas.png` (copy the baked atlas from the DitherLab repo — find it under `DitherLab/`; if only the baking script exists, run it per that repo's README into this path), `src/lib/effects.ts`
- Test: `src/lib/__tests__/effects.test.ts`

**Interfaces:**
- Produces:
  - `type ParamSpec = { name: string; type: "float"|"int"|"enum"|"bool"|"color"; min?: number; max?: number; step?: number; options?: string[]; default: number|string|boolean }`
  - `type PassSpec = { frag: string; textures?: string[] }`
  - `type EffectSpec = { id: string; label: string; inputs: number; passes: PassSpec[]; params: ParamSpec[] }`
  - `EFFECTS: Record<string, EffectSpec>` and `FRAG_SOURCES: Record<string, string>` (`"<effectId>/<frag>"` → source) — built with `import.meta.glob('../../shaders/*/effect.json', {eager: true})` and `import.meta.glob('../../shaders/*/*.frag', {eager: true, query: '?raw', import: 'default'})`.
  - `defaultParams(spec: EffectSpec): Record<string, number|string|boolean>`
- Frag normalization of `glsl_dither.frag` per Global Constraints: strip any `#version`, rename the TD input sampler to `uTex0`, atlas sampler to `uGlyphAtlas`, resolution to `uRes`, unpack TD's packed `uParams1-4` vectors into individual uniforms matching `effect.json` param names (`algo` as `uniform int uAlgo` — enums bind as their option index), keep the body logic byte-identical otherwise. `effect.json` params: `algo` enum [bayer, halftone, ascii] default bayer; `scale` float 1–64 default 8; `levels` int 2–16 default 4; `edge` float 0–1 default 0; `seed` float 0–100 default 0.

- [ ] **Step 1: Failing tests** — `EFFECTS.dither` exists with 1 input and ≥4 params; every `passes[].frag` has a matching `FRAG_SOURCES` entry; `defaultParams` returns each param's default keyed by name; every enum has options.
- [ ] **Step 2: FAIL** (module missing). **Step 3: Implement + normalize the frag.** **Step 4: Gates.**
- [ ] **Step 5: Commit** — `"feat: effect manifest registry with ditherlab"`

---

### Task 8: Graph model — validation, topo-sort, serialization

**Files:**
- Create: `src/lib/finishGraph.ts`
- Test: `src/lib/__tests__/finishGraph.test.ts`

**Interfaces:**
- Produces:
  - `type GraphNode = { id: string; kind: "source"|"effect"|"output"; effectId?: string; params?: Record<string, number|string|boolean>; sourcePath?: string; x: number; y: number }`
  - `type GraphWire = { from: string; fromOut?: 0; to: string; toIn: number }`
  - `type FinishGraph = { v: 1; nodes: GraphNode[]; wires: GraphWire[] }`
  - `emptyGraph(): FinishGraph` — one source (`id:"src"`), one output (`id:"out"`), wired.
  - `wouldCycle(g: FinishGraph, from: string, to: string): boolean`
  - `executionOrder(g: FinishGraph): string[]` — topo order of nodes reachable-to-output; unwired effect inputs are allowed (executor substitutes black).
  - `parseGraph(json: string): FinishGraph` — `'{}'`/invalid/wrong-version → `emptyGraph()`.
  - `serializeGraph(g: FinishGraph): string`

- [ ] **Step 1: Failing tests** — empty graph round-trips; `wouldCycle` true for back-edge, false for diamond (src→A, src→B, A→mix, B→mix); `executionOrder` puts producers before consumers and excludes nodes not reaching output; `parseGraph('{}')` → empty graph.
- [ ] **Step 2: FAIL. Step 3: Implement (Kahn's algorithm; pure module, no React). Step 4: Gates. Step 5: Commit** — `"feat: finish graph model"`

---

### Task 9: WebGL2 preview executor

**Files:**
- Create: `src/lib/glExecutor.ts`
- Test: `src/lib/__tests__/glExecutor.test.ts` (pure parts only)

**Interfaces:**
- Consumes: `EFFECTS`, `FRAG_SOURCES` (Task 7); `FinishGraph`, `executionOrder` (Task 8).
- Produces: `class GlExecutor { constructor(canvas: HTMLCanvasElement); setSource(nodeId: string, image: ImageBitmap): void; render(graph: FinishGraph, width: number, height: number): void; getCompileError(nodeId: string): string | null; dispose(): void }`
  - Prepends the WebGL2 header to each frag: `#version 300 es\nprecision highp float;\nin vec2 vUv;\nout vec4 fragColor;\n` + generated uniform declarations for the effect's params.
  - Shared vertex shader (fullscreen triangle): `#version 300 es\nlayout(location=0) in vec2 aPos; out vec2 vUv; void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.,1.); }`
  - Ping-pong FBO pool at render size; per pass: bind input textures (`uTex0`, `uTex1`, effect textures like `uGlyphAtlas` loaded once from the registry asset), bind `uRes`, bind params (enum → option index as int; bool → 0/1); unwired inputs bind a 1×1 black texture.
  - Also export pure helpers (unit-tested): `uniformDecls(spec: EffectSpec): string` (generates `uniform float uScale;` etc. with the `u` + PascalCase name convention) and `paramValue(spec: ParamSpec, v: unknown): number` (enum index / bool / clamped number).
- Rendering itself is NOT unit-testable in happy-dom — the parity harness (Task 15) covers pixels.

- [ ] **Step 1: Failing tests for the pure helpers** (`uniformDecls` output strings; `paramValue` enum→index, bool→1, clamp to min/max).
- [ ] **Step 2: FAIL. Step 3: Implement executor + helpers. Step 4: Gates (tsc especially). Step 5: Commit** — `"feat: webgl2 preview executor"`

---

### Task 10: Finish tab — node editor + preview composition

**Files:**
- Create: `src/components/finish/FinishTab.tsx`, `src/components/finish/NodeCanvas.tsx`, `src/components/finish/ParamsPanel.tsx`, `src/components/finish/PreviewCanvas.tsx`
- Modify: `src/pages/ProjectDetailPage.tsx` (tab switch: Fonts | Finish, Finish gated on artwork), `package.json` (`npm install @xyflow/react`), `src/i18n/ui.ts`, `src/__tests__/setup.ts` (mock `@xyflow/react` minimally if happy-dom chokes — render children, expose props)
- Test: `src/components/finish/__tests__/finish.test.tsx`

**Interfaces:**
- Consumes: Tasks 7-9 + `useSaveProjectGraph`, `read_artwork_bytes` (via `invoke`, bytes → `createImageBitmap(new Blob([bytes]))`).
- Produces:
  - `NodeCanvas` — @xyflow/react wrapper: nodes from `FinishGraph`, add-node menu listing `EFFECTS` labels, connect handler rejects when `wouldCycle` (and shows `cycle_rejected` toast via sonner), delete key removes effect nodes (never source/output), positions sync into the graph.
  - `ParamsPanel` — generated from the selected node's `EffectSpec` (`float/int` → range input with value, `enum` → Select, `bool` → Toggle, `color` → color input); red compile-error state renders `getCompileError` text in a `text-[var(--color-danger-text)]` block.
  - `PreviewCanvas` — owns a `GlExecutor`; re-renders rAF-throttled on graph/param changes; fit-to-panel size.
  - `FinishTab` — composes the three (preview top, node canvas bottom, params right), debounced (800ms) `useSaveProjectGraph` autosave.
  - Keys: `finish_add_node`, `finish_params_empty`, `cycle_rejected`, `finish_no_artwork`, plus one label key per effect is NOT needed (labels come from manifests; manifests are developer-facing English by design — note this exemption in a code comment referencing the spec).

- [ ] **Step 1: Failing RTL tests** — FinishTab with a mocked executor: renders source+output nodes from empty graph; adding "DitherLab" from the menu inserts an effect node and autosave fires with serialized graph (fake timers past debounce); ParamsPanel renders a slider for `scale` and updates the node's params.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: Gates + manual dev-app check (drop artwork on a project, add DitherLab, scrub scale — preview updates live).**
- [ ] **Step 5: Commit** — `"feat: finish tab with node editor and live preview"`

---

### Task 11: Port VHS, JPEG and Mix effects

**Files:**
- Create: `shaders/vhs/effect.json` + `signal.frag` + `crt.frag` (from `TouchDesigner/TOX/Loris/Renderer/VHSEmulator/shaders/`), `shaders/jpeg/effect.json` + `color.frag`, `dct1d.frag`, `final.frag`, `quant.frag` (from `.../JPEGCompressor/shaders/`), `shaders/mix/effect.json` + `mix.frag` (from `TouchDesigner/MatrixMixer/src/glsl_mix.frag`, reduced to a 2-input blend)
- Test: extend `src/lib/__tests__/effects.test.ts`

**Interfaces:**
- Consumes: normalization contract (Global Constraints) — same transforms as Task 7: strip versions, `uTex0/uTex1`, `uRes`, unpack packed uniform vectors into named params, `uTime` → `seed` param.
- Produces manifests:
  - `vhs`: inputs 1, passes `[signal.frag, crt.frag]` (pass 2's `uTex0` = pass 1 output). Params: `wear` 0–1/0.3, `noise` 0–1/0.25, `ghost` 0–1/0.2, `scanline` 0–1/0.5, `vignette` 0–1/0.3, `seed` 0–100/0.
  - `jpeg`: inputs 1, passes `[color.frag, dct1d.frag, quant.frag, final.frag]`. Params: `quality` 1–100/25, `blockSize` enum [8,16]/"8".
  - `mix`: inputs 2, 1 pass. Params: `mode` enum [blend, add, multiply, screen]/"blend", `amount` 0–1/0.5.
- Multi-pass rule (document in `effects.ts` header comment): pass N's `uTex0` is pass N-1's output; the NODE's wired inputs bind to pass 1's `uTex0..uTexK`.

- [ ] **Step 1: Failing tests** — registry has 4 effects; `vhs` has 2 passes with sources present; `mix.inputs === 2`; every param name matches `^[a-z][a-zA-Z0-9]*$` (uniform-name safety).
- [ ] **Step 2: FAIL. Step 3: Port + normalize (keep body logic identical; comment each renamed uniform with its TD original).**
- [ ] **Step 4: Gates + manual: chain artwork → JPEG → VHS → output; branch source → dither + jpeg → mix.**
- [ ] **Step 5: Commit** — `"feat: vhs, jpeg and mix effect ports"`

---

### Task 12: Rust render engine (wgpu + naga)

**Files:**
- Create: `src-tauri/src/render/mod.rs`, `src-tauri/src/render/engine.rs`, `src-tauri/src/render/manifest.rs`
- Modify: `src-tauri/Cargo.toml` (+ `wgpu = "23"`, `naga = { version = "23", features = ["glsl-in", "wgsl-out"] }`, `serde` already present; match wgpu/naga versions to each other — check crates.io for the current pair and pin what compiles), `src-tauri/tauri.conf.json` (`bundle.resources: ["../shaders/**"]`), `src-tauri/src/lib.rs` (`pub mod render;`)
- Test: `src-tauri/tests/render.rs`

**Interfaces:**
- Consumes: `shaders/` folder (dev: repo-relative; bundled: Tauri resource dir — resolve via a `shaders_dir(app: Option<&tauri::AppHandle>) -> PathBuf` helper that falls back to `CARGO_MANIFEST_DIR/../shaders` in tests).
- Produces:
  - `manifest.rs`: `pub struct EffectSpec { id, label, inputs, passes: Vec<PassSpec>, params: Vec<ParamSpec> }` mirroring Task 7's JSON (serde), `pub fn load_effects(dir: &Path) -> Result<HashMap<String, EffectSpec>, String>`
  - `engine.rs`: `pub struct RenderEngine` with `pub fn new() -> Result<Self, String>` (wgpu instance/device, prefer Metal), `pub fn render_graph(&mut self, graph: &FinishGraphRs, sources: &HashMap<String, image::RgbaImage>, effects: &HashMap<String, EffectSpec>, out_w: u32, out_h: u32) -> Result<image::RgbaImage, String>`
  - `FinishGraphRs` (serde mirror of the TS graph JSON) + `pub fn execution_order(...)` (port of Task 8's Kahn — same semantics).
  - Shader compilation: prepend the SAME uniform declarations as the JS `uniformDecls` (duplicate the generator here; parity tests catch drift), parse with `naga::front::glsl` as fragment, pair with a built-in fullscreen-triangle WGSL vertex shader; params in a uniform buffer ordered per manifest (std140 — each scalar padded to 16 bytes; document the layout in a comment and mirror it in a generated GLSL uniform block instead of loose uniforms IF loose uniforms prove unsupported by naga's glsl-in — decide at implementation, keep the JS side's semantics identical either way).
  - Cover-scale: source images resized cover-fit to target via `image::imageops::resize` before upload.

- [ ] **Step 1: Failing test** — load_effects finds ≥4 effects from `../shaders`; `RenderEngine::new()` succeeds; render a 64×92 graph `source → mix(amount=0) → output` where source is a solid red 8×8 → output pixel (0,0) is red (amount 0 = passthrough of input A per mix semantics).
- [ ] **Step 2: FAIL. Step 3: Implement.** Skip-if-no-GPU guard: if `RenderEngine::new()` errs with adapter-not-found, `eprintln!` + return early (CI-safety) — but on this Mac it must pass.
- [ ] **Step 4: `cargo test` → PASS. Step 5: Commit** — `"feat: wgpu render engine with naga glsl ingest"`

---

### Task 13: export_finish command + encoders

**Files:**
- Create: `src-tauri/src/render/export.rs`
- Modify: `src-tauri/Cargo.toml` (+ `tiff = "0.9"`, `printpdf = "0.7"`; `image` present), `src-tauri/src/lib.rs` (register command)
- Test: `src-tauri/tests/export.rs`

**Interfaces:**
- Consumes: Task 12 engine; project row (graph_json, artwork_path) read via `open_app_db`.
- Produces:
  - `#[tauri::command] async fn export_finish(app: tauri::AppHandle, project_id: i64, formats: Vec<String>, dest_dir: String) -> Result<Vec<String>, String>` — loads project, decodes artwork, renders at **10571×15118**, then per requested format writes `"<name>-f4-300dpi.<ext>"` into dest_dir; returns written paths. Emits `finish-export-progress` events `{stage: "render"|"png"|"tiff"|"pdf", pct: u8}`. On any error: remove files written so far, return Err.
  - Pure encoders (unit-tested at small size): `pub fn encode_png(img: &RgbaImage, path: &Path) -> Result<(), String>`; `pub fn encode_tiff(...)` (RGBA8, deflate); `pub fn encode_pdf(img: &RgbaImage, path: &Path, w_mm: f32, h_mm: f32) -> Result<(), String>` — printpdf page exactly 895.0×1280.0 mm, image placed full-bleed at computed dpi.
  - Constant: `pub const F4_PX: (u32, u32) = (10_571, 15_118); pub const F4_MM: (f32, f32) = (895.0, 1280.0);`

- [ ] **Step 1: Failing tests** — encode a 10×14 red image to all three formats in a temp dir; PNG re-decodes to same pixels; TIFF/PDF files exist non-empty and PDF starts with `%PDF`.
- [ ] **Step 2: FAIL. Step 3: Implement encoders, then the command (spawn_blocking-style: it's async, heavy work via `tauri::async_runtime::spawn_blocking`).**
- [ ] **Step 4: `cargo test` PASS. Step 5: Commit** — `"feat: export_finish with png tiff pdf encoders"`

---

### Task 14: Export UI

**Files:**
- Create: `src/components/finish/ExportDialog.tsx`
- Modify: `src/components/finish/FinishTab.tsx` (Export button), `src/i18n/ui.ts`
- Test: `src/components/finish/__tests__/export.test.tsx`

**Interfaces:**
- Consumes: `invoke('export_finish', {projectId, formats, destDir})`, `listen('finish-export-progress')`, `open({directory: true})` for destination; aspect check: artwork bitmap ratio vs 10571/15118 differing >1% shows `aspect_warning` inline in the dialog.
- Produces: house Modal with three format Toggles (png default on, tiff, pdf), destination picker, progress bar from events, success state listing written paths, failure toast. Keys: `export_title`, `export_run`, `export_dest`, `aspect_warning`, `export_done`, `format_png`, `format_tiff`, `format_pdf`.

- [ ] **Step 1: Failing RTL tests** — dialog invokes with checked formats only; progress event updates the bar (mock listen per useFonts' listener test pattern); success lists paths.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: Gates + MANUAL full run: real project, real artwork, all three formats, open the PDF and check its page size reads 895×1280mm.**
- [ ] **Step 5: Commit** — `"feat: export dialog with progress"`

---

### Task 15: Parity harness

**Files:**
- Create: `src-tauri/tests/parity_goldens.rs` (ignored-by-default test that WRITES goldens), `test/parity/run.mjs` (Playwright), `test/parity/goldens/` (committed PNGs), `test/parity/harness.html`
- Modify: `package.json` (`"parity": "node test/parity/run.mjs"`, devDep `playwright`)

**Interfaces:**
- Consumes: both executors + the 4 effects; a committed 512×731 test source image `test/parity/source.png` (generate once: gradient + circle via a tiny script inside parity_goldens.rs so both sides share it).
- Produces:
  - `cargo test --test parity_goldens -- --ignored` renders each effect (default params, seed 0) source→effect→output at 512×731 via the wgpu engine into `test/parity/goldens/<effect>.png`.
  - `npm run parity`: Playwright chromium loads `harness.html` (bundles the REAL `glExecutor` + registry via a small vite build step inside run.mjs — `npx vite build --config test/parity/vite.config.ts` emitting an iife), renders the same graphs, `page.screenshot`-free readback via `canvas.toDataURL`, diffs vs goldens: pass when ≥99% of pixels are within 6/255 per channel. Prints a per-effect table; nonzero exit on failure.
- Pre-release gate (documented in RELEASING.md by Task 16); NOT in `npm test`.

- [ ] **Step 1: Generate goldens** (run the ignored cargo test; eyeball each PNG — they must look like the effect, not black).
- [ ] **Step 2: Build the JS harness; run `npm run parity` → expect PASS; if an effect diverges, fix the shader/executor semantics (uniform packing order and enum indexes are the usual suspects) until parity holds — divergence here is a real bug, not a tolerance problem.**
- [ ] **Step 3: Commit** — `"test: preview/export parity harness with goldens"`

---

### Task 16: Docs, gates, release readiness

**Files:**
- Modify: `README.md` (Projects & Finish section: workflow, effect-folder convention, F4 constant), `RELEASING.md` (add `npm run parity` to the pre-release checklist), `src/i18n/ui.ts` (sweep: parity test green)

- [ ] **Step 1: Full verification** — `npx tsc --noEmit && npm test && npm run lint && cargo test` all green; `npm run parity` green; design-system grep (no hardcoded grays in `src/components/finish/**`, `src/pages/Project*`).
- [ ] **Step 2: Docs.** **Step 3: Manual end-to-end** — create project, add fonts via BulkBar, activate exclusively (verify in another app), attach artwork, chain JPEG→dither→VHS, export all formats, verify the PNG at 10571×15118.
- [ ] **Step 4: Commit** — `"docs: projects and finish"`. Version bump + release are the controller's call afterwards.

---

## Self-review notes

- Spec coverage: §1 Projects → Tasks 1-6; §2 Finish/graph/manifest/preview → 7-11; §3 export → 12-14; §4 parity → 15; §5 failure modes → red-node (10), relink (6), cycle (10), black input (9/12), export cleanup (13); §6 tests → per task; §7 build order preserved. Out-of-scope respected (no CMYK/tiling tasks).
- Type consistency: `EffectSpec/ParamSpec/PassSpec` (7) consumed by 9-12; `FinishGraph` (8) mirrored as `FinishGraphRs` (12); `read_artwork_bytes` (6) used in 10; `export_finish` (13) used in 14; `F4_PX` single-sourced (13).
- Known judgment points left to implementers (flagged in-task): naga loose-uniform support (12, with the uniform-block fallback), atlas sourcing (7), wgpu/naga version pair (12).
