# Finish 2 — Look Development & Delivery (design)

Brainstormed 2026-09-08 on top of the shipped Finish v1 (feat/finish,
through commit 7db39066). This document captures the agreed direction;
a task plan derives from it later.

**Status:** P1 shipped (D1, D2, D4 — plans/2026-09-08-finish-2-p1.md).
P2 shipped (D5, D7, D8, D9 + gradient map, posterize, halftone, riso —
plans/2026-09-08-finish-2-p2.md). P3 shipped (D3 text operator, raster
cache, preview drag for text + transform —
plans/2026-09-08-finish-2-p3.md). Remaining: P4 (D6 proof render,
variation strip, A/B, 1:1 zoom).

## What Finish is for (user's words, distilled)

One chain, many deliverables, reusable looks:

1. **Final print files** — the F4 (or any format) print-ready output is a
   real deliverable.
2. **Exploration** — trying many looks fast before settling.
3. **Social/web versions** — IG/story/web sizes derived from the same
   artwork and look.
4. Effect vocabulary should grow in ALL four directions: print
   artifacts, signal/analog, color grading, typography overlays.
5. Working model: the TD-style **graph stays primary**, plus saveable
   **recipes** shared across projects.

## Core decisions

### D1 — Multiple Output operators = multiple deliverables
Several Output nodes in one graph, each with its own settings (size,
unit, dpi, color, fit — all shipped in v1). Export renders every
enabled output in one run, files named per output (output gains a
`name` param: "f4-print", "ig-square", …). `executionOrder` already
walks multi-output graphs. Preview shows the SELECTED output's page
(fallback: first output).

### D2 — Resolution is a chain property: the Scale operator
User insight: "some effects react better at low resolution — de-res
before the node, up-res after."

- New `scale` operator: factor (0.05–4x) or absolute px override,
  filter (smooth | pixel). One input, one output.
- **Engine change (both renderers)**: per-node resolution propagation.
  A node renders at its input's resolution; Scale changes it; sources
  start at native artwork res (preview: capped); the Output operator
  places whatever resolution arrives onto its page (fit/fill/place,
  shipped). `uRes` = the node's own render resolution.
- FBO pools become size-keyed (today: one working size per render).
- This REPLACES any need for a "process at output res" switch: put a
  Scale before the tail if the print wants full-res dither.

### D3 — Text operator (core, not later) with direct manipulation
- `text` operator: content, font (from the PROJECT's fonts), size,
  fill, position, rotation; composites over its input.
- **Adobe-style direct manipulation**: with a text node selected, its
  block is draggable ON the preview canvas (position updates node
  params). Selection outline + drag = the whole interaction, v1 of it.
- Parity strategy: the webview rasterizes the text block (canvas 2D,
  activated project fonts) at high resolution and CACHES the raster
  with the project (file next to DB or base64 in graph); the Rust
  exporter composites the cached raster — it never rasterizes fonts
  itself. Re-raster on any text-param change.
- Open: raster resolution policy (raster at the tail resolution of the
  largest output × text scale; re-raster on export if stale).

### D4 — Undo first (exploration, phase 1)
Local graph history (bounded stack of serialized graphs, Cmd+Z /
Shift+Cmd+Z, coalesced with the 800ms autosave debounce). Variation
strip and A/B snapshots come AFTER undo exists.

### D5 — Recipes
Named subchains (effect+scale+text nodes, wires, params — sources and
outputs excluded) stored app-wide (new table). Apply = paste into the
current graph between source and selected insertion point. Save-as
from a selection.

### D6 — Preview trust: proof render
A "proof" action on any Output operator: run the REAL Rust engine at
final size, stream the result back, show it in the preview (toggle
proof/live; optional diff heatmap). Turns the parity harness guarantee
into a designer-facing feature.

### D7 — Multi-source
Multiple Source operators, each with its OWN artwork:

- Source params gain the picker per node; the path lives in the node's
  `sourcePath` (field already exists in the graph model, unused so
  far). The project's `artwork_path` stays as the PRIMARY source
  (first source node — back-compat, and what the Fonts side shows).
- "Add" menu grows a Source entry alongside effects.
- Loading: FinishTab loads a bitmap per source node; liveness/relink
  per node (missing artwork = warning on that operator).
- Engines: both already key source images by node id — the export
  command learns to load every source node's path, the preview feeds
  per-node bitmaps.
- Resolution rule (with D2): each source starts at its own native res;
  a multi-input node renders at its FIRST input's resolution (TD
  convention), other inputs are sampled/stretched into it.
- This is also the cheap "import a typographic layer from
  Illustrator" path, available before the P3 text operator.

### D8 — Mix operator rework (composite, really)
The v1 mix is a TD port: amount-crossfade toward input B, which reads
as "darken to black" when B is unwired. Rework into a proper composite
operator:

- **Blend modes**: normal (over), multiply, screen, overlay, add,
  difference, darken, lighten — enum param.
- **Opacity** (0–1) instead of "amount"; unwired B = clean passthrough
  of A at ANY opacity (no more blend-to-black surprise).
- **Alpha-aware**: input B composites OVER A using B's alpha (so a
  transparent-background type layer from D7 sits correctly).
- Existing graphs: `mix` stays readable (amount maps to opacity,
  default mode = normal); parity golden regenerated.

### D9 — Transform operator
Placement is a node, not a param of composite (chosen over baking
offset/scale into D8):

- `transform` operator: translate x/y (page-fraction units so it's
  resolution-independent), scale, rotate, filter (smooth | pixel).
  One input, one output; background beyond the input = transparent
  (so composite-over works as expected).
- Rides the D2 per-node resolution machinery (it's the second
  resolution-changing node after Scale).
- Its position params are the attachment point for direct
  manipulation: the P3 preview-drag system moves BOTH text blocks and
  transformed layers — one drag implementation serves both.

## Effect roster (ports into the existing manifest system)

Priority order within each family; each is a frag + manifest, both
engines pick them up automatically.

- **Color grading**: gradient map / duotone → posterize + palette
  reduction → lift/gamma/gain.
- **Print artifacts**: halftone (per-channel angles) → riso
  misregistration + paper grain → screenprint separation preview.
- **Signal/analog**: photocopy (contrast smash, streaks) → scanner
  drag. (VHS/CRT family shipped.)
- Shader discipline (learned in v1): integer hashes only, no
  fract(sin) — compiler-portable determinism is what keeps parity.

## Phasing proposal

- **P1 — Foundations**: graph undo/redo; multiple Output nodes
  (naming, per-output export, selected-output preview); Scale operator
  + per-node resolution engine rework (the big one; parity goldens
  re-verified).
- **P2 — Vocabulary & routing**: multi-source (D7) + composite rework
  (D8) + transform operator (D9) — they ship together: collage =
  source → transform → composite; recipes; gradient map, posterize,
  halftone, riso ports.
- **P3 — Typography**: text operator + raster cache + draggable blocks
  on the preview.
- **P4 — Confidence**: proof render (+ diff), variation strip, A/B
  snapshots, 1:1 zoom/pan.

## Parked: single-renderer collapse (P5+)

The dual-renderer architecture (WebGL2 preview / wgpu export) carries a
recurring tax: every engine-semantic change is implemented twice and
guarded by the parity harness. If mirror maintenance ever starts
dominating (each phase pays it — P1 paid it for resolution propagation,
P2 will for composite/transform), the escape hatch is NOT a rewrite:
collapse to ONE renderer by running the wgpu engine headless for the
preview too, streaming frames to the webview (IPC or shared texture).
Kills the parity problem outright; costs preview latency work. Revisit
only when the tax demonstrably outweighs the harness.

## Open questions (park until their phase)

- Text raster cache location & invalidation policy (P3).
- CMYK is naive device conversion (no ICC); revisit if print proofs
  disagree with screen.
- P3 drag system: with D9 chosen, dragging on the preview must resolve
  WHICH transform/text node a click hits (topmost composite wins?) —
  spec at P3.
- Variation strip param-jitter policy: seeds only vs. per-param ranges.
