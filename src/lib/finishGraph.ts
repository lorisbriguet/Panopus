/**
 * Pure Finish graph model: types, validation, cycle checks, topo order and
 * (de)serialization. No React or Tauri here so it stays trivially
 * unit-testable — and so Task 12 can port `executionOrder` to Rust with
 * identical semantics. Keep the algorithms simple and deterministic.
 */

/** F4 poster aspect (10571x15118 px at 300dpi) — the default output. */
export const F4_RATIO = 10571 / 15118;

/**
 * Output node settings, stored as the output node's params. Defaults
 * reproduce the original hardcoded export: F4 895x1280mm at 300dpi,
 * sRGB. Mirrored by the Rust exporter (render/export.rs) — keep the
 * rounding/clamps in lockstep.
 */
export type OutputSettings = {
  unit: "mm" | "px";
  width: number;
  height: number;
  dpi: number;
  /** "srgb" | "rgb" encode identical bytes (declared intent only);
   *  "cmyk" converts TIFF/PDF (PNG stays RGB — the format has no CMYK). */
  color: "srgb" | "rgb" | "cmyk";
  /** Artwork placement on the page: fill = cover-crop, fit = contain
   *  (letterboxed), place = centered at 100% (1 artwork px = 1 output px).
   *  Bars/overflow background is black. The input is never modified. */
  fit: "fill" | "fit" | "place";
  /** Deliverable name — used in export filenames (path-scrubbed there). */
  name: string;
};

export const DEFAULT_OUTPUT: OutputSettings = {
  unit: "mm",
  width: 895,
  height: 1280,
  dpi: 300,
  color: "srgb",
  fit: "fill",
  name: "output",
};

/** Renderable ceiling (wgpu/WebGL texture limit headroom). */
export const MAX_OUTPUT_PX = 16384;

/** All output nodes, in graph order (each one is a deliverable). */
export function outputNodes(g: FinishGraph): GraphNode[] {
  return g.nodes.filter((n) => n.kind === "output");
}

/** All source nodes, in graph order. The FIRST is the primary (project
 *  artwork); extras carry their own `sourcePath` (D7). */
export function sourceNodes(g: FinishGraph): GraphNode[] {
  return g.nodes.filter((n) => n.kind === "source");
}

/** First output's settings (single-deliverable callers). */
export function outputSettings(g: FinishGraph): OutputSettings {
  return outputSettingsFrom(g.nodes.find((n) => n.kind === "output")?.params);
}

/** A specific output node's settings; unknown id falls back to the
 *  first output (then to defaults). */
export function outputSettingsForNode(g: FinishGraph, nodeId: string): OutputSettings {
  const node = g.nodes.find((n) => n.kind === "output" && n.id === nodeId);
  return node ? outputSettingsFrom(node.params) : outputSettings(g);
}

/** Same, from an output node's raw params (ParamsPanel has only the node). */
export function outputSettingsFrom(
  params: Record<string, number | string | boolean> | undefined
): OutputSettings {
  const p = params ?? {};
  const num = (v: unknown, def: number, min: number, max: number) => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : def;
    return Math.min(max, Math.max(min, n));
  };
  const unit = p.unit === "px" ? "px" : "mm";
  const color = p.color === "cmyk" ? "cmyk" : p.color === "rgb" ? "rgb" : "srgb";
  const fit = p.fit === "fit" ? "fit" : p.fit === "place" ? "place" : "fill";
  const dim = (v: unknown, def: number) =>
    unit === "px" ? Math.round(num(v, def, 16, MAX_OUTPUT_PX)) : num(v, def, 10, 5000);
  return {
    unit,
    width: dim(p.width, unit === "px" ? 10571 : DEFAULT_OUTPUT.width),
    height: dim(p.height, unit === "px" ? 15118 : DEFAULT_OUTPUT.height),
    dpi: Math.round(num(p.dpi, DEFAULT_OUTPUT.dpi, 36, 1200)),
    color,
    fit,
    name:
      typeof p.name === "string" && p.name.trim() !== ""
        ? p.name
        : DEFAULT_OUTPUT.name,
  };
}

/** Pixel dimensions of the render (mm sizes go through the dpi). */
export function outputPx(s: OutputSettings): { w: number; h: number } {
  const toPx = (v: number) =>
    Math.min(MAX_OUTPUT_PX, s.unit === "px" ? Math.round(v) : Math.round((v / 25.4) * s.dpi));
  return { w: toPx(s.width), h: toPx(s.height) };
}

/** Physical page size in mm (px sizes go through the dpi). */
export function outputMm(s: OutputSettings): { w: number; h: number } {
  const toMm = (v: number) => (s.unit === "mm" ? v : (v / s.dpi) * 25.4);
  return { w: toMm(s.width), h: toMm(s.height) };
}

export function outputRatio(s: OutputSettings): number {
  const { w, h } = outputPx(s);
  return h > 0 ? w / h : F4_RATIO;
}

/**
 * Per-node render resolution (D2: resolution is a chain property).
 * Sources start at their native size (aspect-preserving cap); scale
 * nodes change it (factor 0.05–4, or absolute width+height when BOTH
 * are set); every other node inherits its FIRST input (toIn 0);
 * unwired inputs fall back to 8x8. Mirrored by Rust's
 * node_resolutions (render/mod.rs) — keep rounding/clamps in lockstep.
 */
export function nodeResolutions(
  g: FinishGraph,
  sourceDims: Map<string, { w: number; h: number }>,
  cap: number
): Map<string, { w: number; h: number }> {
  const res = new Map<string, { w: number; h: number }>();
  const clampAxis = (v: number) => Math.min(cap, Math.max(1, Math.round(v)));
  const inputRes = (id: string): { w: number; h: number } => {
    const wire = g.wires.find((w) => w.to === id && w.toIn === 0);
    return (wire && res.get(wire.from)) || { w: 8, h: 8 };
  };
  for (const id of executionOrder(g)) {
    const node = g.nodes.find((n) => n.id === id);
    if (!node) continue;
    if (node.kind === "source") {
      const d = sourceDims.get(id) ?? { w: 8, h: 8 };
      const s = Math.min(1, cap / Math.max(d.w, d.h));
      res.set(id, { w: clampAxis(d.w * s), h: clampAxis(d.h * s) });
    } else if (node.kind === "scale") {
      const p = node.params ?? {};
      const abs = (v: unknown) =>
        typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
      const aw = abs(p.width);
      const ah = abs(p.height);
      if (aw !== null && ah !== null) {
        res.set(id, { w: clampAxis(aw), h: clampAxis(ah) });
      } else {
        const raw = typeof p.factor === "number" && Number.isFinite(p.factor) ? p.factor : 0.5;
        const f = Math.min(4, Math.max(0.05, raw));
        const inp = inputRes(id);
        res.set(id, { w: clampAxis(inp.w * f), h: clampAxis(inp.h * f) });
      }
    } else {
      res.set(id, inputRes(id));
    }
  }
  return res;
}

export type GraphNode = {
  id: string;
  kind: "source" | "effect" | "output" | "scale" | "text";
  effectId?: string;
  params?: Record<string, number | string | boolean>;
  sourcePath?: string;
  /** Text nodes (D3): cached raster file + its content hash. */
  rasterPath?: string;
  rasterKey?: string;
  x: number;
  y: number;
};

export type GraphWire = {
  from: string;
  fromOut?: 0;
  to: string;
  toIn: number;
};

export type FinishGraph = { v: 1; nodes: GraphNode[]; wires: GraphWire[] };

/** The minimal valid graph: one source wired straight into the output. */
export function emptyGraph(): FinishGraph {
  return {
    v: 1,
    nodes: [
      { id: "src", kind: "source", x: 80, y: 160 },
      { id: "out", kind: "output", x: 480, y: 160 },
    ],
    wires: [{ from: "src", to: "out", toIn: 0 }],
  };
}

/** node id -> ids it feeds into (downstream neighbours). */
function successors(g: FinishGraph): Map<string, string[]> {
  const next = new Map<string, string[]>();
  for (const n of g.nodes) next.set(n.id, []);
  for (const w of g.wires) next.get(w.from)?.push(w.to);
  return next;
}

/**
 * Would adding a wire from -> to close a loop? True exactly when `to`
 * already reaches `from` through existing wires (or from === to).
 */
export function wouldCycle(g: FinishGraph, from: string, to: string): boolean {
  if (from === to) return true;
  const next = successors(g);
  const seen = new Set<string>([to]);
  const stack = [to];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === from) return true;
    for (const n of next.get(id) ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return false;
}

/**
 * Topological execution order (Kahn's algorithm) restricted to nodes that
 * reach the output. Unwired effect inputs are fine — the executor
 * substitutes black. Deterministic: when several nodes are ready, the one
 * earliest in `g.nodes` runs first. Nodes on a cycle are never ready and
 * are silently dropped (the editor prevents cycles via wouldCycle).
 */
export function executionOrder(g: FinishGraph): string[] {
  // Reverse reachability from the output node(s).
  const prev = new Map<string, string[]>(); // to -> froms
  for (const n of g.nodes) prev.set(n.id, []);
  for (const w of g.wires) prev.get(w.to)?.push(w.from);
  const reaches = new Set<string>();
  const stack = g.nodes.filter((n) => n.kind === "output").map((n) => n.id);
  for (const id of stack) reaches.add(id);
  while (stack.length > 0) {
    for (const p of prev.get(stack.pop()!) ?? []) {
      if (!reaches.has(p)) {
        reaches.add(p);
        stack.push(p);
      }
    }
  }

  // Kahn over the reachable subgraph, scanning nodes in input order so
  // ties resolve deterministically.
  const indegree = new Map<string, number>();
  for (const n of g.nodes) if (reaches.has(n.id)) indegree.set(n.id, 0);
  for (const w of g.wires) {
    if (reaches.has(w.from) && reaches.has(w.to)) {
      indegree.set(w.to, (indegree.get(w.to) ?? 0) + 1);
    }
  }
  const order: string[] = [];
  const done = new Set<string>();
  for (;;) {
    const ready = g.nodes.find(
      (n) => indegree.get(n.id) === 0 && !done.has(n.id)
    );
    if (!ready) break;
    done.add(ready.id);
    order.push(ready.id);
    for (const w of g.wires) {
      if (w.from === ready.id && indegree.has(w.to)) {
        indegree.set(w.to, indegree.get(w.to)! - 1);
      }
    }
  }
  return order;
}

const KINDS = new Set(["source", "effect", "output", "scale", "text"]);

function isNode(v: unknown): v is GraphNode {
  if (typeof v !== "object" || v === null) return false;
  const n = v as Record<string, unknown>;
  return (
    typeof n.id === "string" &&
    typeof n.kind === "string" &&
    KINDS.has(n.kind) &&
    typeof n.x === "number" &&
    typeof n.y === "number"
  );
}

function isWire(v: unknown): v is GraphWire {
  if (typeof v !== "object" || v === null) return false;
  const w = v as Record<string, unknown>;
  return (
    typeof w.from === "string" &&
    typeof w.to === "string" &&
    typeof w.toIn === "number"
  );
}

/**
 * Parse a stored graph. Anything unusable — invalid JSON, wrong version,
 * structurally-invalid shapes (nodes not an array, malformed entries) or
 * a graph with no output node — falls back to emptyGraph() so callers
 * never handle a broken document.
 */
export function parseGraph(json: string): FinishGraph {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return emptyGraph();
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return emptyGraph();
  }
  const g = raw as Record<string, unknown>;
  if (g.v !== 1) return emptyGraph();
  if (!Array.isArray(g.nodes) || !Array.isArray(g.wires)) return emptyGraph();
  if (!g.nodes.every(isNode) || !g.wires.every(isWire)) return emptyGraph();
  const nodes = g.nodes as GraphNode[];
  if (!nodes.some((n) => n.kind === "output")) return emptyGraph();
  return { v: 1, nodes, wires: g.wires as GraphWire[] };
}

export function serializeGraph(g: FinishGraph): string {
  return JSON.stringify(g);
}

/**
 * Recipes (D5): a named, reusable subchain — the graph's INTERMEDIATE
 * nodes (everything except sources and outputs) plus the wires among
 * them. Sources/outputs stay project-specific by design.
 */
export function captureRecipe(g: FinishGraph): string {
  const keep = new Set(
    g.nodes
      .filter((n) => n.kind !== "source" && n.kind !== "output")
      .map((n) => n.id)
  );
  return JSON.stringify({
    nodes: g.nodes.filter((n) => keep.has(n.id)),
    wires: g.wires.filter((w) => keep.has(w.from) && keep.has(w.to)),
  });
}

/**
 * Paste a captured recipe into `g` with FRESH ids and remapped internal
 * wires, offset so it lands beside the existing chain. Deliberately
 * connects to NOTHING — the user wires head/tail (a wrong guess is
 * worse than one manual wire). Garbage input returns `g` unchanged.
 */
export function applyRecipe(g: FinishGraph, recipeJson: string): FinishGraph {
  let raw: unknown;
  try {
    raw = JSON.parse(recipeJson);
  } catch {
    return g;
  }
  if (typeof raw !== "object" || raw === null) return g;
  const r = raw as { nodes?: unknown; wires?: unknown };
  if (!Array.isArray(r.nodes) || !Array.isArray(r.wires)) return g;
  if (!r.nodes.every(isNode) || !r.wires.every(isWire)) return g;
  const nodes = r.nodes as GraphNode[];
  if (nodes.length === 0) return g;
  if (nodes.some((n) => n.kind === "source" || n.kind === "output")) return g;

  const stamp = Date.now();
  const idMap = new Map<string, string>(
    nodes.map((n, i) => [n.id, `recipe_${stamp}_${i}`])
  );
  const pasted: GraphNode[] = nodes.map((n) => ({
    ...n,
    id: idMap.get(n.id)!,
    x: n.x + 240,
    y: n.y + 80,
  }));
  const pastedWires: GraphWire[] = (r.wires as GraphWire[])
    .filter((w) => idMap.has(w.from) && idMap.has(w.to))
    .map((w) => ({ ...w, from: idMap.get(w.from)!, to: idMap.get(w.to)! }));
  return {
    ...g,
    nodes: [...g.nodes, ...pasted],
    wires: [...g.wires, ...pastedWires],
  };
}
