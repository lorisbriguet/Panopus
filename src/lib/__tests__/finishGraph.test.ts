import { describe, test, expect } from "vitest";
import {
  type FinishGraph,
  emptyGraph,
  wouldCycle,
  executionOrder,
  parseGraph,
  serializeGraph,
} from "../finishGraph";

/** src -> A -> mix, src -> B -> mix, mix -> out. */
function diamond(): FinishGraph {
  return {
    v: 1,
    nodes: [
      { id: "src", kind: "source", x: 0, y: 0 },
      { id: "A", kind: "effect", effectId: "dither", x: 100, y: 0 },
      { id: "B", kind: "effect", effectId: "dither", x: 100, y: 100 },
      { id: "mix", kind: "effect", effectId: "mix", x: 200, y: 50 },
      { id: "out", kind: "output", x: 300, y: 50 },
    ],
    wires: [
      { from: "src", to: "A", toIn: 0 },
      { from: "src", to: "B", toIn: 0 },
      { from: "A", to: "mix", toIn: 0 },
      { from: "B", to: "mix", toIn: 1 },
      { from: "mix", to: "out", toIn: 0 },
    ],
  };
}

describe("emptyGraph", () => {
  test("has a wired source and output", () => {
    const g = emptyGraph();
    expect(g.v).toBe(1);
    expect(g.nodes.map((n) => n.id)).toEqual(["src", "out"]);
    expect(g.nodes[0].kind).toBe("source");
    expect(g.nodes[1].kind).toBe("output");
    expect(g.wires).toEqual([{ from: "src", to: "out", toIn: 0 }]);
  });

  test("returns a fresh object each call", () => {
    const a = emptyGraph();
    const b = emptyGraph();
    expect(a).not.toBe(b);
    expect(a.nodes).not.toBe(b.nodes);
  });
});

describe("serializeGraph / parseGraph", () => {
  test("empty graph round-trips", () => {
    expect(parseGraph(serializeGraph(emptyGraph()))).toEqual(emptyGraph());
  });

  test("diamond graph round-trips", () => {
    expect(parseGraph(serializeGraph(diamond()))).toEqual(diamond());
  });

  test("'{}' yields the empty graph", () => {
    expect(parseGraph("{}")).toEqual(emptyGraph());
  });

  test("invalid JSON yields the empty graph", () => {
    expect(parseGraph("not json")).toEqual(emptyGraph());
    expect(parseGraph("")).toEqual(emptyGraph());
  });

  test("wrong version yields the empty graph", () => {
    expect(parseGraph(JSON.stringify({ ...diamond(), v: 2 }))).toEqual(
      emptyGraph()
    );
  });

  test("structurally invalid shapes yield the empty graph", () => {
    // nodes not an array
    expect(
      parseGraph(JSON.stringify({ v: 1, nodes: "nope", wires: [] }))
    ).toEqual(emptyGraph());
    // wires not an array
    expect(
      parseGraph(
        JSON.stringify({ v: 1, nodes: emptyGraph().nodes, wires: null })
      )
    ).toEqual(emptyGraph());
    // missing output node
    expect(
      parseGraph(
        JSON.stringify({
          v: 1,
          nodes: [{ id: "src", kind: "source", x: 0, y: 0 }],
          wires: [],
        })
      )
    ).toEqual(emptyGraph());
    // non-object payloads
    expect(parseGraph("null")).toEqual(emptyGraph());
    expect(parseGraph("[1,2]")).toEqual(emptyGraph());
  });
});

describe("wouldCycle", () => {
  test("true for a back-edge", () => {
    // A already reaches mix, so mix -> A closes a loop
    expect(wouldCycle(diamond(), "mix", "A")).toBe(true);
    expect(wouldCycle(diamond(), "out", "src")).toBe(true);
  });

  test("true for a self-loop", () => {
    expect(wouldCycle(diamond(), "A", "A")).toBe(true);
  });

  test("false across the diamond", () => {
    const g = diamond();
    expect(wouldCycle(g, "A", "B")).toBe(false);
    expect(wouldCycle(g, "src", "mix")).toBe(false);
    expect(wouldCycle(g, "B", "out")).toBe(false);
  });
});

describe("executionOrder", () => {
  test("producers come before consumers", () => {
    const order = executionOrder(diamond());
    const at = (id: string) => order.indexOf(id);
    expect(at("src")).toBeGreaterThanOrEqual(0);
    expect(at("src")).toBeLessThan(at("A"));
    expect(at("src")).toBeLessThan(at("B"));
    expect(at("A")).toBeLessThan(at("mix"));
    expect(at("B")).toBeLessThan(at("mix"));
    expect(at("mix")).toBeLessThan(at("out"));
  });

  test("stable: ties break by input order of nodes", () => {
    expect(executionOrder(diamond())).toEqual(["src", "A", "B", "mix", "out"]);
  });

  test("excludes nodes that do not reach the output", () => {
    const g = diamond();
    g.nodes.push({ id: "orphan", kind: "effect", effectId: "dither", x: 0, y: 300 });
    g.wires.push({ from: "src", to: "orphan", toIn: 0 });
    expect(executionOrder(g)).toEqual(["src", "A", "B", "mix", "out"]);
  });

  test("unwired effect inputs are allowed", () => {
    // mix's second input left unwired: node still runs (executor feeds black)
    const g = diamond();
    g.wires = g.wires.filter((w) => !(w.to === "mix" && w.toIn === 1));
    expect(executionOrder(g)).toEqual(["src", "A", "mix", "out"]);
  });

  test("empty graph orders src before out", () => {
    expect(executionOrder(emptyGraph())).toEqual(["src", "out"]);
  });
});
