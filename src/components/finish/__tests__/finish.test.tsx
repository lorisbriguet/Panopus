import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NodeCanvas } from "../NodeCanvas";
import { ParamsPanel } from "../ParamsPanel";
import { emptyGraph } from "../../../lib/finishGraph";
import type { FinishGraph, GraphNode } from "../../../lib/finishGraph";
import { EFFECTS } from "../../../lib/effects";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe("NodeCanvas", () => {
  it("renders source and output nodes from empty graph", () => {
    const graph = emptyGraph();
    const onGraphChange = vi.fn();
    const onNodeSelect = vi.fn();

    render(
      <NodeCanvas
        graph={graph}
        onGraphChange={onGraphChange}
        selectedNodeId={null}
        onNodeSelect={onNodeSelect}
      />
    );

    // ReactFlow mock renders nodes with data-testid and node labels
    expect(screen.getByTestId("react-flow")).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
  });

  it("renders add node button", () => {
    const graph = emptyGraph();
    const onGraphChange = vi.fn();
    const onNodeSelect = vi.fn();

    render(
      <NodeCanvas
        graph={graph}
        onGraphChange={onGraphChange}
        selectedNodeId={null}
        onNodeSelect={onNodeSelect}
      />
    );

    // Should have an Add button for adding effects
    expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument();
  });

  it("renders effect nodes from graph", () => {
    const graph: FinishGraph = {
      v: 1,
      nodes: [
        { id: "src", kind: "source", x: 80, y: 160 },
        {
          id: "effect1",
          kind: "effect",
          effectId: "dither",
          params: {},
          x: 280,
          y: 160,
        },
        { id: "out", kind: "output", x: 480, y: 160 },
      ],
      wires: [
        { from: "src", to: "effect1", toIn: 0 },
        { from: "effect1", to: "out", toIn: 0 },
      ],
    };

    const onGraphChange = vi.fn();
    const onNodeSelect = vi.fn();

    render(
      <NodeCanvas
        graph={graph}
        onGraphChange={onGraphChange}
        selectedNodeId={null}
        onNodeSelect={onNodeSelect}
      />
    );

    // Effect node should render with its label from the manifest
    expect(screen.getByText("Dither")).toBeInTheDocument();
  });
});

describe("ParamsPanel", () => {
  it("shows empty state when no effect selected", () => {
    const node: GraphNode = {
      id: "src",
      kind: "source",
      x: 0,
      y: 0,
    };
    const onParamsChange = vi.fn();

    render(<ParamsPanel node={node} onParamsChange={onParamsChange} />);

    expect(screen.getByText(/no parameters/i)).toBeInTheDocument();
  });

  it("renders controls for dither effect params", () => {
    const ditherSpec = EFFECTS.dither;
    const node: GraphNode = {
      id: "effect1",
      kind: "effect",
      effectId: "dither",
      params: ditherSpec.params.reduce(
        (acc, p) => ({ ...acc, [p.name]: p.default }),
        {}
      ),
      x: 0,
      y: 0,
    };
    const onParamsChange = vi.fn();

    render(<ParamsPanel node={node} onParamsChange={onParamsChange} />);

    // Should show the effect label
    expect(screen.getByText("Dither")).toBeInTheDocument();

    // Should show controls for each param
    expect(screen.getByText("algo")).toBeInTheDocument();
    expect(screen.getByText("scale")).toBeInTheDocument();
    expect(screen.getByText("levels")).toBeInTheDocument();
    expect(screen.getByText("edge")).toBeInTheDocument();
    expect(screen.getByText("seed")).toBeInTheDocument();
  });

  it("renders enum param as select", () => {
    const node: GraphNode = {
      id: "effect1",
      kind: "effect",
      effectId: "dither",
      params: { algo: "bayer" },
      x: 0,
      y: 0,
    };
    const onParamsChange = vi.fn();

    render(<ParamsPanel node={node} onParamsChange={onParamsChange} />);

    // algo is an enum param - should render as select with options
    const selects = screen.getAllByRole("combobox");
    expect(selects.length).toBeGreaterThan(0);

    // Check options exist
    expect(screen.getByRole("option", { name: "bayer" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "halftone" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "ascii" })).toBeInTheDocument();
  });

  it("renders float/int params as range inputs", () => {
    const node: GraphNode = {
      id: "effect1",
      kind: "effect",
      effectId: "dither",
      params: { scale: 8, levels: 4 },
      x: 0,
      y: 0,
    };
    const onParamsChange = vi.fn();

    render(<ParamsPanel node={node} onParamsChange={onParamsChange} />);

    // scale and levels are float/int - should render as range sliders
    const sliders = screen.getAllByRole("slider");
    expect(sliders.length).toBeGreaterThan(0);
  });
});
