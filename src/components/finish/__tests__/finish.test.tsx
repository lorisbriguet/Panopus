import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { NodeCanvas } from "../NodeCanvas";
import { ParamsPanel } from "../ParamsPanel";
import { FinishTab } from "../FinishTab";

vi.mock("../../../hooks/useProjects", () => ({
  useSaveProjectGraph: () => ({ mutate: vi.fn(), isPending: false }),
  useProjectFontFamilies: () => ({ data: ["Alpha", "Beta"], isLoading: false }),
  useProjectFontPaths: () => ({ data: {}, isLoading: false }),
}));

const recipeCreateMutate = vi.fn();
vi.mock("../../../hooks/useRecipes", () => ({
  useRecipes: () => ({
    data: [
      {
        id: 1,
        name: "House dither",
        nodes_json: JSON.stringify({
          nodes: [
            {
              id: "e",
              kind: "effect",
              effectId: "dither",
              params: {},
              x: 200,
              y: 0,
            },
          ],
          wires: [],
        }),
        created_at: "2026-09-08 10:00:00",
      },
    ],
    isLoading: false,
  }),
  useCreateRecipe: () => ({ mutate: recipeCreateMutate, isPending: false }),
}));
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

  it("wires a second connection into a 2-input effect on the first free input", () => {
    const graph: FinishGraph = {
      v: 1,
      nodes: [
        { id: "srcA", kind: "source", x: 0, y: 100 },
        { id: "srcB", kind: "source", x: 0, y: 220 },
        { id: "mix1", kind: "effect", effectId: "mix", params: {}, x: 200, y: 160 },
        { id: "out", kind: "output", x: 400, y: 160 },
      ],
      wires: [
        { from: "srcA", to: "mix1", toIn: 0 },
        { from: "mix1", to: "out", toIn: 0 },
      ],
    };
    const onGraphChange = vi.fn();

    render(
      <NodeCanvas
        graph={graph}
        onGraphChange={onGraphChange}
        selectedNodeId={null}
        onNodeSelect={vi.fn()}
      />
    );

    // Drive the connect handler through the xyflow mock's parked props:
    // input 0 of mix1 is occupied, so srcB must land on toIn 1.
    const props = (globalThis as Record<string, unknown>).__xyflowProps as {
      onConnect: (c: { source: string; target: string }) => void;
    };
    props.onConnect({ source: "srcB", target: "mix1" });

    expect(onGraphChange).toHaveBeenCalledWith(
      expect.objectContaining({
        wires: expect.arrayContaining([
          { from: "srcA", to: "mix1", toIn: 0 },
          { from: "srcB", to: "mix1", toIn: 1 },
        ]),
      })
    );
  });

  it("replaces the toIn 0 wire when all inputs of the target are occupied", () => {
    const graph: FinishGraph = {
      v: 1,
      nodes: [
        { id: "srcA", kind: "source", x: 0, y: 100 },
        { id: "srcB", kind: "source", x: 0, y: 220 },
        { id: "eff1", kind: "effect", effectId: "dither", params: {}, x: 200, y: 160 },
        { id: "out", kind: "output", x: 400, y: 160 },
      ],
      wires: [
        { from: "srcA", to: "eff1", toIn: 0 },
        { from: "eff1", to: "out", toIn: 0 },
      ],
    };
    const onGraphChange = vi.fn();

    render(
      <NodeCanvas
        graph={graph}
        onGraphChange={onGraphChange}
        selectedNodeId={null}
        onNodeSelect={vi.fn()}
      />
    );

    const props = (globalThis as Record<string, unknown>).__xyflowProps as {
      onConnect: (c: { source: string; target: string }) => void;
    };
    props.onConnect({ source: "srcB", target: "eff1" });

    const updated = onGraphChange.mock.calls[0][0] as FinishGraph;
    const intoEff = updated.wires.filter((w) => w.to === "eff1");
    expect(intoEff).toEqual([{ from: "srcB", to: "eff1", toIn: 0 }]);
  });
});

describe("ParamsPanel", () => {
  it("renders the Text panel with content, font list and placement (D3)", () => {
    const node: GraphNode = {
      id: "t",
      kind: "text",
      params: { content: "PANOPUS", font: "Alpha", size: 0.2 },
      x: 0,
      y: 0,
    };
    const onParamsChange = vi.fn();
    render(
      <ParamsPanel
        node={node}
        onParamsChange={onParamsChange}
        textFonts={["Alpha", "Beta"]}
      />
    );
    expect(screen.getByLabelText("content")).toHaveValue("PANOPUS");
    expect(screen.getByRole("option", { name: "Beta" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("content"), {
      target: { value: "NEW" },
    });
    expect(onParamsChange).toHaveBeenCalledWith(
      expect.objectContaining({ content: "NEW", font: "Alpha" })
    );
    expect(screen.getByLabelText("size")).toBeInTheDocument();
  });


  it("renders the Source panel with artwork picker for source nodes", () => {
    const node: GraphNode = {
      id: "src",
      kind: "source",
      x: 0,
      y: 0,
    };
    const onPickArtwork = vi.fn();

    render(
      <ParamsPanel
        node={node}
        onParamsChange={vi.fn()}
        sourceInfo={{
          path: "/art/poster.png",
          missing: false,
          onPick: onPickArtwork,
        }}
      />
    );

    expect(screen.getByText("poster.png")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose artwork..." }));
    expect(onPickArtwork).toHaveBeenCalled();
  });

  it("shows empty state for an unknown effect", () => {
    const node: GraphNode = {
      id: "e",
      kind: "effect",
      effectId: "does-not-exist",
      x: 0,
      y: 0,
    };

    render(<ParamsPanel node={node} onParamsChange={vi.fn()} />);

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
    expect(screen.getByRole("option", { name: "ascii" })).toBeInTheDocument(); // #399: halftone algo removed
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

  it("displays compile error when provided", () => {
    const node: GraphNode = {
      id: "effect1",
      kind: "effect",
      effectId: "dither",
      params: {},
      x: 0,
      y: 0,
    };
    const onParamsChange = vi.fn();
    const compileError = "ERROR: 0:42: 'invalid_function' : no matching overloaded function found";

    render(
      <ParamsPanel
        node={node}
        onParamsChange={onParamsChange}
        compileError={compileError}
      />
    );

    // Compile error should be displayed in danger text
    expect(screen.getByText(compileError)).toBeInTheDocument();
    expect(screen.getByText(compileError)).toHaveClass("text-[var(--color-danger-text)]");
  });
});

describe("FinishTab graph undo (Finish 2 T1)", () => {
  const renderTab = () =>
    render(
      <FinishTab
        projectId={1}
        artworkPath={null}
        onPickArtwork={vi.fn()}
        graph={emptyGraph()}
      />
    );

  const addBayer = () => {
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    fireEvent.click(screen.getByRole("button", { name: "Bayer" }));
  };

  it("cmd+z undoes an added effect, cmd+shift+z redoes it", async () => {
    renderTab();
    addBayer();
    expect(screen.getByText("Bayer")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "z", metaKey: true });
    await waitFor(() =>
      expect(screen.queryByText("Bayer")).not.toBeInTheDocument()
    );

    fireEvent.keyDown(document, { key: "Z", metaKey: true, shiftKey: true });
    await waitFor(() => expect(screen.getByText("Bayer")).toBeInTheDocument());
  });

  it("adds an extra source whose params show its own picker (D7)", async () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    fireEvent.click(screen.getByRole("button", { name: "Source" }));
    // Two source operators are now on the canvas.
    const sources = screen.getAllByText("Source", { selector: "span" });
    expect(sources.length).toBeGreaterThanOrEqual(2);
    // Select the new node (id is generated: source_<ts>).
    const el = document.querySelector('[data-nodeid^="source_"]');
    expect(el).not.toBeNull();
    const props = (globalThis as Record<string, unknown>).__xyflowProps as {
      onNodesChange: (changes: unknown[]) => void;
    };
    act(() => {
      props.onNodesChange([
        { type: "select", id: el!.getAttribute("data-nodeid"), selected: true },
      ]);
    });
    // The extra source has no artwork yet: em-dash + its own picker.
    expect(await screen.findByText("—")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Choose artwork..." })
    ).toBeInTheDocument();
  });

  it("applies a recipe from the add menu as one undoable paste (D5)", async () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    fireEvent.click(screen.getByRole("button", { name: "House dither" }));
    expect(screen.getByText("Dither")).toBeInTheDocument();
    // one undo step removes the whole paste
    fireEvent.keyDown(document, { key: "z", metaKey: true });
    await waitFor(() =>
      expect(screen.queryByText("Dither")).not.toBeInTheDocument()
    );
  });

  it("save-as-recipe captures the intermediates through the modal", async () => {
    renderTab();
    addBayer();
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save as recipe..." })
    );
    fireEvent.change(screen.getByLabelText("Recipe name..."), {
      target: { value: "My look" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(recipeCreateMutate).toHaveBeenCalled());
    const arg = recipeCreateMutate.mock.calls[0][0] as {
      name: string;
      nodesJson: string;
    };
    expect(arg.name).toBe("My look");
    const captured = JSON.parse(arg.nodesJson);
    expect(captured.nodes.length).toBe(1);
    expect(captured.nodes[0].effectId).toBe("bayer");
  });

  it("leaves cmd+z alone while typing in an input", async () => {
    renderTab();
    addBayer();
    // Select the output node so its width NumField is in the DOM.
    const props = (globalThis as Record<string, unknown>).__xyflowProps as {
      onNodesChange: (changes: unknown[]) => void;
    };
    act(() => {
      props.onNodesChange([{ type: "select", id: "out", selected: true }]);
    });
    const width = await screen.findByLabelText("width");
    fireEvent.keyDown(width, { key: "z", metaKey: true });
    expect(screen.getByText("Bayer")).toBeInTheDocument();
  });
});
