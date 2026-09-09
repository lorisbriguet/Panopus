import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  applyNodeChanges,
  type Node,
  type NodeChange,
  type Edge,
  type Connection,
  Handle,
  Position,
  Panel,
} from "@xyflow/react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui";
import { EFFECTS } from "../../lib/effects";
import {
  outputNodes,
  outputRatio,
  outputSettingsFrom,
  sourceNodes,
  wouldCycle,
} from "../../lib/finishGraph";
import type { FinishGraph, GraphNode, GraphWire } from "../../lib/finishGraph";
import { useT } from "../../i18n/useT";
import "@xyflow/react/dist/style.css";

interface NodeCanvasProps {
  graph: FinishGraph;
  onGraphChange: (graph: FinishGraph) => void;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
  /** nodeId -> PNG data URL of the node's live output (operator viewers). */
  thumbnails?: Record<string, string>;
  /** Page aspect (w/h): shapes the OUTPUT operator's viewer frame. */
  ratio?: number;
  /** Artwork aspect (w/h): fallback for chain viewer frames. */
  sourceRatio?: number;
  /** Per-node render aspect (w/h) from nodeResolutions — scale nodes
   *  can change it mid-chain. */
  nodeRatios?: Record<string, number>;
  /** Saved subchains (D5): listed in the add menu. */
  recipes?: { id: number; name: string; nodes_json: string }[];
  onApplyRecipe?: (nodesJson: string) => void;
  onSaveRecipe?: () => void;
}

type OperatorData = { label: string; thumb?: string; ratio?: number };

/** Viewer frame: fixed 96px wide, height follows the output aspect but
 *  stays usable on extreme formats (thumbs letterbox via object-contain). */
function viewerHeight(ratio: number | undefined): number {
  const r = ratio && ratio > 0 ? ratio : 10571 / 15118;
  return Math.round(Math.min(137, Math.max(28, 96 / r)));
}

const HANDLE_CLASS =
  "!w-[7px] !h-[7px] !rounded-[1px] !border-0 !bg-[var(--color-text-secondary)]";

/**
 * TouchDesigner-style operator: the node body IS a live viewer of its
 * output (F4 portrait), name in small technical type underneath with a
 * family tint mark. Selection = accent outline, like TD's active OP.
 */
function Operator({
  data,
  selected,
  tint,
  hasInput,
  hasOutput,
}: {
  data: OperatorData;
  selected?: boolean;
  tint: string;
  hasInput: boolean;
  hasOutput: boolean;
}) {
  return (
    <div className="w-24 font-mono">
      <div
        className={`relative overflow-hidden rounded-[2px] border bg-black/70 ${
          selected
            ? "border-accent shadow-[0_0_0_1px_var(--color-accent-ring,transparent),0_0_14px_rgba(0,0,0,0.6)]"
            : "border-white/15"
        }`}
        style={{ height: viewerHeight(data.ratio) }}
      >
        {data.thumb ? (
          <img
            src={data.thumb}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-[10px] text-muted">
            •
          </div>
        )}
        {hasInput && (
          <Handle type="target" position={Position.Left} className={HANDLE_CLASS} />
        )}
        {hasOutput && (
          <Handle type="source" position={Position.Right} className={HANDLE_CLASS} />
        )}
      </div>
      <div className="mt-1 flex items-center gap-1.5 px-0.5">
        <span className={`inline-block w-1.5 h-1.5 rounded-[1px] ${tint}`} />
        <span
          className={`text-[10px] tracking-[0.08em] uppercase ${
            selected ? "text-accent" : "text-[var(--color-text-secondary)]"
          }`}
        >
          {data.label}
        </span>
      </div>
    </div>
  );
}

function SourceNode({ data }: { data: OperatorData }) {
  return (
    <Operator data={data} tint="bg-white/35" hasInput={false} hasOutput />
  );
}

function EffectNode({ data, selected }: { data: OperatorData; selected: boolean }) {
  return (
    <Operator data={data} selected={selected} tint="bg-accent" hasInput hasOutput />
  );
}

function OutputNode({ data }: { data: OperatorData }) {
  return (
    <Operator data={data} tint="bg-white/70" hasInput hasOutput={false} />
  );
}

function ScaleNode({ data, selected }: { data: OperatorData; selected: boolean }) {
  return (
    <Operator data={data} selected={selected} tint="bg-white/50" hasInput hasOutput />
  );
}

function TextNode({ data, selected }: { data: OperatorData; selected: boolean }) {
  return (
    <Operator data={data} selected={selected} tint="bg-accent" hasInput hasOutput />
  );
}

const nodeTypes = {
  source: SourceNode,
  effect: EffectNode,
  output: OutputNode,
  scale: ScaleNode,
  text: TextNode,
};

/** Thin, light wires — TD network look. */
const EDGE_OPTIONS = {
  style: { stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 },
};

/**
 * @xyflow/react wrapper: nodes from FinishGraph, add-node menu, wire/delete handlers.
 * Effect labels come from manifests (developer-facing English) per the brief — not
 * translated, as they're part of the effect API surface.
 */
export function NodeCanvas({
  graph,
  onGraphChange,
  selectedNodeId,
  onNodeSelect,
  thumbnails,
  ratio,
  sourceRatio,
  nodeRatios,
  recipes,
  onApplyRecipe,
  onSaveRecipe,
}: NodeCanvasProps) {
  const t = useT();
  const [showAddMenu, setShowAddMenu] = useState(false);

  // ReactFlow owns the node objects (applyNodeChanges keeps its internal
  // measurements alive — rebuilding fresh objects per change left nodes
  // unmeasured and they vanished mid-drag). The graph stays the source of
  // truth for topology; positions flow back on drag end.
  const [nodes, setNodes] = useState<Node[]>([]);
  useEffect(() => {
    setNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]));
      return graph.nodes.map((n) => {
        const data = {
          label:
            n.kind === "source"
              ? "Source"
              : n.kind === "output"
                ? "Output"
                : n.kind === "scale"
                  ? "Scale"
                  : n.kind === "text"
                    ? "Text"
                    : EFFECTS[n.effectId ?? ""]?.label ?? "?",
          thumb: thumbnails?.[n.id],
          // Output viewers are shaped by THEIR OWN page settings; chain
          // viewers by their node's render resolution (artwork fallback).
          ratio:
            n.kind === "output"
              ? outputRatio(outputSettingsFrom(n.params))
              : nodeRatios?.[n.id] ?? sourceRatio ?? ratio,
        };
        const existing = byId.get(n.id);
        // Keep the live object (position + measured dims) while dragging;
        // only data/selection may change from outside.
        if (existing) {
          return { ...existing, data, selected: n.id === selectedNodeId };
        }
        return {
          id: n.id,
          type: n.kind,
          position: { x: n.x, y: n.y },
          data,
          selected: n.id === selectedNodeId,
        };
      });
    });
  }, [graph.nodes, selectedNodeId, thumbnails, ratio, sourceRatio, nodeRatios]);

  const edges: Edge[] = useMemo(
    () =>
      graph.wires.map((w, i) => ({
        id: `e${i}`,
        source: w.from,
        target: w.to,
        sourceHandle: null,
        targetHandle: null,
      })),
    [graph.wires]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      const { source, target } = connection;
      if (!source || !target) return;

      // Reject cycles
      if (wouldCycle(graph, source, target)) {
        toast.error(t.cycle_rejected);
        return;
      }

      // Land on the target's first free input (mix has 2); when every
      // input is occupied, replace the toIn 0 wire.
      const targetNode = graph.nodes.find((n) => n.id === target);
      const inputCount =
        targetNode?.kind === "effect"
          ? EFFECTS[targetNode.effectId ?? ""]?.inputs ?? 1
          : 1;
      const occupied = new Set(
        graph.wires.filter((w) => w.to === target).map((w) => w.toIn)
      );
      let toIn = 0;
      while (toIn < inputCount && occupied.has(toIn)) toIn++;
      const replacing = toIn >= inputCount;
      if (replacing) toIn = 0;
      const newWire: GraphWire = { from: source, to: target, toIn };
      onGraphChange({
        ...graph,
        wires: [
          ...graph.wires.filter(
            (w) => !(replacing && w.to === target && w.toIn === 0)
          ),
          newWire,
        ],
      });
    },
    [graph, onGraphChange, t.cycle_rejected]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Let ReactFlow apply everything (dimensions, drag positions,
      // selection) to its own node objects...
      setNodes((nds) => applyNodeChanges(changes, nds));
      // ...and mirror the graph-relevant parts back: final positions
      // (drag end only — persisting every drag frame thrashed autosave)
      // and selection.
      const newNodes = [...graph.nodes];
      let changed = false;
      for (const change of changes) {
        if (change.type === "position" && change.position && !change.dragging) {
          const idx = newNodes.findIndex((n) => n.id === change.id);
          if (idx !== -1) {
            newNodes[idx] = { ...newNodes[idx], ...change.position };
            changed = true;
          }
        } else if (change.type === "select" && change.selected) {
          onNodeSelect(change.id);
        }
      }
      if (changed) {
        onGraphChange({ ...graph, nodes: newNodes });
      }
    },
    [graph, onGraphChange, onNodeSelect]
  );

  const handleAddSource = useCallback(() => {
    const nodeId = `source_${Date.now()}`;
    onGraphChange({
      ...graph,
      nodes: [
        ...graph.nodes,
        { id: nodeId, kind: "source", x: 80, y: 300 },
      ],
    });
    setShowAddMenu(false);
  }, [graph, onGraphChange]);

  const handleAddText = useCallback(() => {
    const nodeId = `text_${Date.now()}`;
    onGraphChange({
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: nodeId,
          kind: "text",
          params: { content: "Panopus", font: "", size: 0.15, fill: "#f2ede4" },
          x: 380,
          y: 300,
        },
      ],
    });
    setShowAddMenu(false);
  }, [graph, onGraphChange]);

  const handleAddScale = useCallback(() => {
    const nodeId = `scale_${Date.now()}`;
    onGraphChange({
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: nodeId,
          kind: "scale",
          params: { factor: 0.5, filter: "smooth" },
          x: 280,
          y: 280,
        },
      ],
    });
    setShowAddMenu(false);
  }, [graph, onGraphChange]);

  const handleAddOutput = useCallback(() => {
    const nodeId = `output_${Date.now()}`;
    onGraphChange({
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: nodeId,
          kind: "output",
          params: { name: "output" },
          x: 480,
          y: 280,
        },
      ],
    });
    setShowAddMenu(false);
  }, [graph, onGraphChange]);

  const handleAddEffect = useCallback(
    (effectId: string) => {
      const spec = EFFECTS[effectId];
      if (!spec) return;

      // Generate new node ID
      const nodeId = `effect_${Date.now()}`;
      const newNode: GraphNode = {
        id: nodeId,
        kind: "effect",
        effectId,
        params: Object.fromEntries(
          spec.params.map((p) => [p.name, p.default])
        ),
        x: 280,
        y: 160,
      };

      onGraphChange({
        ...graph,
        nodes: [...graph.nodes, newNode],
      });
      setShowAddMenu(false);
    },
    [graph, onGraphChange]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeId) {
          const node = graph.nodes.find((n) => n.id === selectedNodeId);
          // Sources/outputs deletable only while another remains.
          const deletable =
            node &&
            (node.kind === "effect" ||
              node.kind === "scale" ||
              node.kind === "text" ||
              (node.kind === "output" && outputNodes(graph).length > 1) ||
              (node.kind === "source" && sourceNodes(graph).length > 1));
          if (deletable) {
            onGraphChange({
              ...graph,
              nodes: graph.nodes.filter((n) => n.id !== selectedNodeId),
              wires: graph.wires.filter(
                (w) => w.from !== selectedNodeId && w.to !== selectedNodeId
              ),
            });
            onNodeSelect(null);
          }
        }
      }
    },
    [selectedNodeId, graph, onGraphChange, onNodeSelect]
  );

  // Attach keydown listener
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="h-full relative [background-image:radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:18px_18px]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={EDGE_OPTIONS}
        onConnect={handleConnect}
        onNodesChange={handleNodesChange}
        onPaneClick={() => onNodeSelect(null)}
        fitView
      >
        <Panel position="top-left">
          <Button
            size="sm"
            icon={<Plus size={12} />}
            onClick={() => setShowAddMenu(!showAddMenu)}
          >
            {t.finish_add_node}
          </Button>
          {showAddMenu && (
            <div className="absolute top-full left-0 mt-1 bg-[var(--color-surface)] border border-[var(--color-border-header)] rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.4)] py-1 min-w-[160px] z-10">
              {Object.values(EFFECTS)
                .filter((spec) => spec.id !== "text") // text = its own kind
                .map((spec) => (
                <button
                  key={spec.id}
                  type="button"
                  onClick={() => handleAddEffect(spec.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-row)] text-left"
                >
                  {spec.label}
                </button>
              ))}
              <div className="my-1 border-t border-[var(--color-border-divider)]" />
              <button
                type="button"
                onClick={handleAddSource}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-row)] text-left"
              >
                Source
              </button>
              <button
                type="button"
                onClick={handleAddText}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-row)] text-left"
              >
                Text
              </button>
              <button
                type="button"
                onClick={handleAddScale}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-row)] text-left"
              >
                Scale
              </button>
              <button
                type="button"
                onClick={handleAddOutput}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-row)] text-left"
              >
                Output
              </button>
              <div className="my-1 border-t border-[var(--color-border-divider)]" />
              <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted">
                {t.recipes}
              </p>
              {(recipes ?? []).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    onApplyRecipe?.(r.nodes_json);
                    setShowAddMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-row)] text-left"
                >
                  {r.name}
                </button>
              ))}
              {(recipes ?? []).length === 0 && (
                <p className="px-3 py-1 text-xs text-muted">{t.recipe_empty}</p>
              )}
              <button
                type="button"
                onClick={() => {
                  onSaveRecipe?.();
                  setShowAddMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-row)] text-left"
              >
                {t.recipe_save}
              </button>
            </div>
          )}
        </Panel>
      </ReactFlow>
    </div>
  );
}
