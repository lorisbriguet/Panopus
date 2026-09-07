/**
 * Pure Finish graph model: types, validation, cycle checks, topo order and
 * (de)serialization. No React or Tauri here so it stays trivially
 * unit-testable — and so Task 12 can port `executionOrder` to Rust with
 * identical semantics. Keep the algorithms simple and deterministic.
 */

export type GraphNode = {
  id: string;
  kind: "source" | "effect" | "output";
  effectId?: string;
  params?: Record<string, number | string | boolean>;
  sourcePath?: string;
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

const KINDS = new Set(["source", "effect", "output"]);

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
