import { describe, test, expect } from "vitest";
import {
  captureRecipe,
  applyRecipe,
  nodeResolutions,
  type FinishGraph,
  emptyGraph,
  wouldCycle,
  executionOrder,
  parseGraph,
  serializeGraph,
  outputSettings,
  outputSettingsForNode,
  outputNodes,
  outputPx,
  outputMm,
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

describe("outputSettings", () => {
  const withParams = (params?: Record<string, number | string | boolean>) => {
    const g = emptyGraph();
    const out = g.nodes.find((n) => n.kind === "output")!;
    out.params = params;
    return g;
  };

  test("defaults to F4 895x1280mm at 300dpi sRGB fill", () => {
    const s = outputSettings(withParams());
    expect(s).toEqual({
      unit: "mm",
      width: 895,
      height: 1280,
      dpi: 300,
      color: "srgb",
      fit: "fill",
      name: "output",
    });
    expect(outputPx(s)).toEqual({ w: 10571, h: 15118 });
    expect(outputMm(s)).toEqual({ w: 895, h: 1280 });
  });

  test("px unit passes dimensions through and derives mm via dpi", () => {
    const s = outputSettings(
      withParams({ unit: "px", width: 2000, height: 3000, dpi: 150, color: "cmyk" })
    );
    expect(outputPx(s)).toEqual({ w: 2000, h: 3000 });
    expect(outputMm(s).w).toBeCloseTo(338.667, 2);
    expect(s.color).toBe("cmyk");
  });

  test("mm unit rounds px like the Rust exporter", () => {
    const s = outputSettings(withParams({ unit: "mm", width: 420, height: 594, dpi: 300 }));
    expect(outputPx(s)).toEqual({ w: 4961, h: 7016 }); // A2 at 300dpi
  });

  test("clamps garbage to sane values", () => {
    const s = outputSettings(
      withParams({ unit: "px", width: 999999, height: -5, dpi: 9000, color: "nope" })
    );
    expect(outputPx(s)).toEqual({ w: 16384, h: 16 });
    expect(s.dpi).toBe(1200);
    expect(s.color).toBe("srgb");
  });

  test("parses fit modes with fill fallback", () => {
    expect(outputSettings(withParams({ fit: "place" })).fit).toBe("place");
    expect(outputSettings(withParams({ fit: "fit" })).fit).toBe("fit");
    expect(outputSettings(withParams({ fit: "stretch" })).fit).toBe("fill");
  });
});

describe("multiple outputs", () => {
  const twoOutputGraph = (): FinishGraph => ({
    v: 1,
    nodes: [
      { id: "src", kind: "source", x: 0, y: 0 },
      {
        id: "print",
        kind: "output",
        params: { name: "f4-print", unit: "mm", width: 895, height: 1280, dpi: 300 },
        x: 0,
        y: 0,
      },
      {
        id: "ig",
        kind: "output",
        params: { name: "ig-square", unit: "px", width: 1080, height: 1080, dpi: 72 },
        x: 0,
        y: 0,
      },
    ],
    wires: [
      { from: "src", to: "print", toIn: 0 },
      { from: "src", to: "ig", toIn: 0 },
    ],
  });

  test("parseGraph accepts graphs with several output nodes", () => {
    const g = parseGraph(serializeGraph(twoOutputGraph()));
    expect(outputNodes(g).map((n) => n.id)).toEqual(["print", "ig"]);
  });

  test("outputSettingsForNode reads each node's own settings", () => {
    const g = twoOutputGraph();
    expect(outputPx(outputSettingsForNode(g, "print"))).toEqual({ w: 10571, h: 15118 });
    expect(outputPx(outputSettingsForNode(g, "ig"))).toEqual({ w: 1080, h: 1080 });
    expect(outputSettingsForNode(g, "ig").name).toBe("ig-square");
  });

  test("outputSettingsForNode falls back to the first output for unknown ids", () => {
    const g = twoOutputGraph();
    expect(outputSettingsForNode(g, "nope").name).toBe("f4-print");
  });

  test("output name defaults and non-strings are rejected", () => {
    expect(outputSettings(emptyGraph()).name).toBe("output");
    const g = emptyGraph();
    g.nodes.find((n) => n.kind === "output")!.params = { name: 42 as unknown as number };
    expect(outputSettings(g).name).toBe("output");
  });

  test("executionOrder covers both outputs", () => {
    const order = executionOrder(twoOutputGraph());
    expect(order).toContain("print");
    expect(order).toContain("ig");
  });
});

describe("nodeResolutions", () => {
  const dims = new Map([["src", { w: 1000, h: 2000 }]]);

  const chain = (scaleParams?: Record<string, number | string | boolean>): FinishGraph => ({
    v: 1,
    nodes: [
      { id: "src", kind: "source", x: 0, y: 0 },
      { id: "sc", kind: "scale", params: scaleParams ?? { factor: 0.5 }, x: 0, y: 0 },
      { id: "e", kind: "effect", effectId: "dither", x: 0, y: 0 },
      { id: "out", kind: "output", x: 0, y: 0 },
    ],
    wires: [
      { from: "src", to: "sc", toIn: 0 },
      { from: "sc", to: "e", toIn: 0 },
      { from: "e", to: "out", toIn: 0 },
    ],
  });

  test("effects and outputs inherit their first input's resolution", () => {
    const res = nodeResolutions(chain(), dims, 16384);
    expect(res.get("src")).toEqual({ w: 1000, h: 2000 });
    expect(res.get("sc")).toEqual({ w: 500, h: 1000 });
    expect(res.get("e")).toEqual({ w: 500, h: 1000 });
    expect(res.get("out")).toEqual({ w: 500, h: 1000 });
  });

  test("scale factor rounds and clamps to 0.05..4", () => {
    expect(
      nodeResolutions(chain({ factor: 3 }), dims, 16384).get("sc")
    ).toEqual({ w: 3000, h: 6000 });
    expect(
      nodeResolutions(chain({ factor: 99 }), dims, 16384).get("sc")
    ).toEqual({ w: 4000, h: 8000 });
    expect(
      nodeResolutions(chain({ factor: 0.001 }), dims, 16384).get("sc")
    ).toEqual({ w: 50, h: 100 });
  });

  test("absolute width+height override the factor", () => {
    expect(
      nodeResolutions(chain({ factor: 2, width: 640, height: 480 }), dims, 16384).get("sc")
    ).toEqual({ w: 640, h: 480 });
    // one alone is not enough
    expect(
      nodeResolutions(chain({ factor: 2, width: 640 }), dims, 16384).get("sc")
    ).toEqual({ w: 2000, h: 4000 });
  });

  test("everything clamps to the cap, sources keep aspect", () => {
    const res = nodeResolutions(chain({ factor: 4 }), dims, 1024);
    expect(res.get("src")).toEqual({ w: 512, h: 1024 });
    expect(res.get("sc")).toEqual({ w: 1024, h: 1024 }); // per-axis clamp
  });

  test("unwired inputs fall back to 8x8", () => {
    const g = chain();
    g.wires = g.wires.filter((w) => w.to !== "e");
    const res = nodeResolutions(g, dims, 16384);
    expect(res.get("e")).toEqual({ w: 8, h: 8 });
  });

  test("parseGraph accepts scale nodes", () => {
    const g = parseGraph(serializeGraph(chain()));
    expect(g.nodes.some((n) => n.kind === "scale")).toBe(true);
  });
});

describe("recipes", () => {
  const collage = (): FinishGraph => ({
    v: 1,
    nodes: [
      { id: "src", kind: "source", x: 0, y: 0 },
      { id: "sc", kind: "scale", params: { factor: 0.5 }, x: 100, y: 0 },
      { id: "e", kind: "effect", effectId: "dither", params: { levels: 3 }, x: 200, y: 0 },
      { id: "out", kind: "output", x: 300, y: 0 },
    ],
    wires: [
      { from: "src", to: "sc", toIn: 0 },
      { from: "sc", to: "e", toIn: 0 },
      { from: "e", to: "out", toIn: 0 },
    ],
  });

  test("captureRecipe keeps intermediates + internal wires only", () => {
    const r = JSON.parse(captureRecipe(collage()));
    expect(r.nodes.map((n: { id: string }) => n.id)).toEqual(["sc", "e"]);
    expect(r.wires).toEqual([{ from: "sc", to: "e", toIn: 0 }]);
  });

  test("applyRecipe pastes with fresh ids and remapped wires", () => {
    const g = collage();
    const json = captureRecipe(g);
    const next = applyRecipe(g, json);
    // original untouched nodes still present, two new nodes added
    expect(next.nodes.length).toBe(g.nodes.length + 2);
    const added = next.nodes.filter((n) => !g.nodes.some((o) => o.id === n.id));
    expect(added.length).toBe(2);
    // params survive, ids are fresh
    expect(added.some((n) => n.params?.levels === 3)).toBe(true);
    expect(added.some((n) => n.id === "sc" || n.id === "e")).toBe(false);
    // exactly one new internal wire, between the two new ids
    const newWires = next.wires.filter(
      (w) => !g.wires.some((o) => o.from === w.from && o.to === w.to)
    );
    expect(newWires.length).toBe(1);
    expect(added.map((n) => n.id)).toContain(newWires[0].from);
    expect(added.map((n) => n.id)).toContain(newWires[0].to);
    // nothing auto-connects to the existing chain
    expect(
      next.wires.filter((w) => added.some((n) => n.id === w.to) && !added.some((n) => n.id === w.from))
    ).toEqual([]);
  });

  test("applyRecipe rejects garbage", () => {
    const g = collage();
    expect(applyRecipe(g, "not json")).toEqual(g);
    expect(applyRecipe(g, "{}")).toEqual(g);
  });
});
