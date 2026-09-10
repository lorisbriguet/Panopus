import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  removeNodeBridging,
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
  /** Accepted for API stability but unused since the standard-frame
   *  card round: every viewer shares VIEWER_HEIGHT and the render
   *  letterboxes inside at its own aspect (object-contain). */
  ratio?: number;
  sourceRatio?: number;
  nodeRatios?: Record<string, number>;
  /** Saved subchains (D5): listed in the add menu. */
  recipes?: { id: number; name: string; nodes_json: string }[];
  onApplyRecipe?: (nodesJson: string) => void;
  onSaveRecipe?: () => void;
  /** TD blue-dot active preview (#384): flagged node owns the canvas. */
  previewNodeId?: string | null;
  onPreviewNode?: (id: string | null) => void;
}

type OperatorData = {
  label: string;
  thumb?: string;
  bypassed?: boolean;
  previewActive?: boolean;
  onPreviewToggle?: () => void;
};

/** Family color coding (#389), TD-style: one hue per operator family.
 *  Raw hex — rendered as the card's full-height left spine (legibility
 *  round, direction B), so the hue stays readable at any zoom. */
const TINTS: Record<string, string> = {
  source: "#4fa3ff",
  effect: "#b98cff",
  scale: "#ffd166",
  text: "#ff6fb0",
  output: "#6fe3a5",
};

/** Standard operator frame: every card shares one footprint (viewer
 *  ≈4:5 portrait, suiting a poster tool) and the render letterboxes
 *  inside at its own aspect via object-contain — a uniform network
 *  reads better than content-shaped nodes. */
const VIEWER_HEIGHT = 120;

const HANDLE_CLASS =
  "!w-[9px] !h-[9px] !rounded-[2px] !border-0 !bg-[#e2e2e6] !shadow-[0_0_0_1.5px_rgba(0,0,0,0.85)]";

/**
 * TouchDesigner-style operator as ONE solid card (legibility round,
 * direction B): live viewer + name share a dark ground so the label never
 * fights the artwork behind the network; the family hue runs the card's
 * full left spine; selection = accent outline around the whole card.
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
    <div
      className="w-24 font-mono rounded-[3px] bg-[#111114]/95 p-1 pb-[3px] shadow-[0_2px_12px_rgba(0,0,0,0.55)]"
      style={{
        borderLeft: `3px solid ${tint}`,
        outline: selected ? "1.5px solid var(--color-accent)" : undefined,
      }}
    >
      <div
        className={`relative overflow-hidden rounded-[2px] border bg-black/70 ${
          selected ? "border-accent" : "border-white/10"
        }`}
        style={{ height: VIEWER_HEIGHT }}
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
        {data.bypassed && (
          <div className="absolute inset-0 grid place-items-center bg-black/50">
            <span className="text-[9px] tracking-[0.2em] uppercase text-muted">
              bypass
            </span>
          </div>
        )}
        {hasInput && (
          <Handle type="target" position={Position.Left} className={HANDLE_CLASS} />
        )}
        {hasOutput && (
          <Handle type="source" position={Position.Right} className={HANDLE_CLASS} />
        )}
        {/* TD blue dot: this operator owns the big preview (#384). */}
        <button
          type="button"
          aria-label={`preview ${data.label}`}
          onClick={(e) => {
            e.stopPropagation();
            data.onPreviewToggle?.();
          }}
          className={`absolute bottom-1 right-1 w-3 h-3 rounded-full border shadow-[0_0_0_1.5px_rgba(0,0,0,0.7)] ${
            data.previewActive
              ? "bg-[#4fa3ff] border-white/70"
              : "bg-black/40 border-white/30 hover:border-white/60"
          }`}
        />
      </div>
      <div className="mt-1 px-0.5">
        <span
          className={`text-[11px] tracking-[0.08em] uppercase ${
            selected ? "text-accent" : "text-white/90"
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
    <Operator data={data} tint={TINTS.source} hasInput={false} hasOutput />
  );
}

function EffectNode({ data, selected }: { data: OperatorData; selected: boolean }) {
  return (
    <Operator data={data} selected={selected} tint={TINTS.effect} hasInput hasOutput />
  );
}

function OutputNode({ data }: { data: OperatorData }) {
  return (
    <Operator data={data} tint={TINTS.output} hasInput hasOutput={false} />
  );
}

function ScaleNode({ data, selected }: { data: OperatorData; selected: boolean }) {
  return (
    <Operator data={data} selected={selected} tint={TINTS.scale} hasInput hasOutput />
  );
}

function TextNode({ data, selected }: { data: OperatorData; selected: boolean }) {
  return (
    <Operator data={data} selected={selected} tint={TINTS.text} hasInput hasOutput />
  );
}

// Keys are PREFIXED: ReactFlow ships built-in styling for types named
// "input"/"output"/"default"/"group" (white card, #393) — our "output"
// collided with it.
const nodeTypes = {
  opSource: SourceNode,
  opEffect: EffectNode,
  opOutput: OutputNode,
  opScale: ScaleNode,
  opText: TextNode,
};

const RF_TYPE: Record<string, string> = {
  source: "opSource",
  effect: "opEffect",
  output: "opOutput",
  scale: "opScale",
  text: "opText",
};

/** Dual-stroke wires: light core over a dark drop-shadow casing, so the
 *  path stays traceable over bright AND dark artwork alike. */
const EDGE_OPTIONS = {
  style: {
    stroke: "rgba(255,255,255,0.85)",
    strokeWidth: 1.5,
    filter:
      "drop-shadow(0 0 1.5px rgba(0,0,0,0.95)) drop-shadow(0 0 3px rgba(0,0,0,0.6))",
  },
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
  recipes,
  onApplyRecipe,
  onSaveRecipe,
  previewNodeId,
  onPreviewNode,
}: NodeCanvasProps) {
  const t = useT();
  const [showAddMenu, setShowAddMenu] = useState(false);
  /** Right-click operator menu (#381/#382). */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  /** Wire being hovered while dragging a connection (#383). */
  const hoveredEdgeRef = useRef<string | null>(null);
  /** Connection drag in flight (source node) — Tab inserts there (#413). */
  const connectingFromRef = useRef<string | null>(null);
  const pendingFromRef = useRef<string | null>(null);
  const rfRef = useRef<{
    fitView: (o?: { padding?: number }) => void;
    getViewport?: () => { x: number; y: number; zoom: number };
    setViewport?: (vp: { x: number; y: number; zoom: number }) => void;
  } | null>(null);

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
          bypassed: !!n.bypass,
          previewActive: previewNodeId === n.id,
          onPreviewToggle: () =>
            onPreviewNode?.(previewNodeId === n.id ? null : n.id),
        };
        const existing = byId.get(n.id);
        // Keep the live object (position + measured dims) while dragging;
        // only data/selection may change from outside.
        if (existing) {
          return { ...existing, data, selected: n.id === selectedNodeId };
        }
        return {
          id: n.id,
          type: RF_TYPE[n.kind] ?? "opEffect",
          position: { x: n.x, y: n.y },
          data,
          selected: n.id === selectedNodeId,
        };
      });
    });
  }, [graph.nodes, selectedNodeId, thumbnails, previewNodeId, onPreviewNode]);

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

  /** Wire a just-added node from the pending connection drag (#413). */
  const wirePending = useCallback(
    (g: FinishGraph, nodeId: string): FinishGraph => {
      const from = pendingFromRef.current;
      pendingFromRef.current = null;
      if (!from || from === nodeId) return g;
      return { ...g, wires: [...g.wires, { from, to: nodeId, toIn: 0 }] };
    },
    []
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
    onGraphChange(
      wirePending(
        {
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
        },
        nodeId
      )
    );
    setShowAddMenu(false);
  }, [graph, onGraphChange, wirePending]);

  const handleAddScale = useCallback(() => {
    const nodeId = `scale_${Date.now()}`;
    onGraphChange(
      wirePending(
        {
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
        },
        nodeId
      )
    );
    setShowAddMenu(false);
  }, [graph, onGraphChange, wirePending]);

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

      onGraphChange(
        wirePending({ ...graph, nodes: [...graph.nodes, newNode] }, nodeId)
      );
      setShowAddMenu(false);
    },
    [graph, onGraphChange, wirePending]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (target?.isContentEditable) return;
      if (e.key === "Tab") {
        // Tab opens Add (#388); mid-connection-drag it inserts at the
        // link's end (#413).
        e.preventDefault();
        if (connectingFromRef.current) {
          pendingFromRef.current = connectingFromRef.current;
        }
        setShowAddMenu((v) => !v);
        return;
      }
      if (e.key === "h" || e.key === "H") {
        // Home: fit every node in view (#390); when a params panel is
        // open (any selection), bias left so the panel doesn't cover
        // the right edge (#421).
        const inst = rfRef.current;
        inst?.fitView({ padding: 0.2 });
        if (selectedNodeId && inst?.getViewport && inst.setViewport) {
          const vp = inst.getViewport();
          inst.setViewport({ ...vp, x: vp.x - 160 });
        }
        return;
      }
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
            // Heal the chain: upstream re-drives what this node fed (#426).
            onGraphChange(removeNodeBridging(graph, selectedNodeId));
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

  /** #383: drop a dragged connection ONTO a wire — rewire that wire's
   *  target input to the dragged source. */
  const handleConnectEnd = useCallback(() => {
    const from = connectingFromRef.current;
    const edgeId = hoveredEdgeRef.current;
    connectingFromRef.current = null;
    if (!from || !edgeId) return;
    const idx = Number(edgeId.slice(1)); // edges are built as `e${index}`
    const wire = graph.wires[idx];
    if (!wire || wire.from === from) return;
    if (wouldCycle(graph, from, wire.to)) {
      toast.error(t.cycle_rejected);
      return;
    }
    onGraphChange({
      ...graph,
      wires: graph.wires.map((w, i) =>
        i === idx ? { ...w, from } : w
      ),
    });
  }, [graph, onGraphChange, t.cycle_rejected]);

  const ctxNode = ctxMenu ? graph.nodes.find((n) => n.id === ctxMenu.nodeId) : null;

  return (
    <div className="h-full relative [background-image:radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:18px_18px]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={EDGE_OPTIONS}
        snapToGrid
        snapGrid={[16, 16]}
        onConnect={handleConnect}
        onNodesChange={handleNodesChange}
        onPaneClick={() => {
          onNodeSelect(null);
          setCtxMenu(null);
        }}
        onInit={(inst) => {
          rfRef.current = inst as unknown as {
            fitView: (o?: { padding?: number }) => void;
            getViewport?: () => { x: number; y: number; zoom: number };
            setViewport?: (vp: { x: number; y: number; zoom: number }) => void;
          };
        }}
        onConnectStart={(_e, params) => {
          connectingFromRef.current =
            (params as { nodeId?: string | null }).nodeId ?? null;
        }}
        onConnectEnd={handleConnectEnd}
        onEdgeMouseEnter={(_e, edge) => {
          hoveredEdgeRef.current = edge.id;
        }}
        onEdgeMouseLeave={() => {
          hoveredEdgeRef.current = null;
        }}
        onNodeContextMenu={(e, node) => {
          e.preventDefault();
          const rect = (e.currentTarget as HTMLElement)
            .closest(".react-flow")
            ?.getBoundingClientRect();
          setCtxMenu({
            x: e.clientX - (rect?.left ?? 0),
            y: e.clientY - (rect?.top ?? 0),
            nodeId: node.id,
          });
        }}
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
                .filter((spec) => spec.id !== "text" && spec.id !== "dither") // text = own kind; dither = legacy (#399/#400)
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
      {/* Operator context menu (#381 swap / #382 bypass). */}
      {ctxMenu && ctxNode && (
        <div
          className="absolute z-40 bg-[var(--color-surface)] border border-[var(--color-border-header)] rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.4)] py-1 min-w-[160px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          {ctxNode.kind !== "source" && ctxNode.kind !== "output" && (
            <button
              type="button"
              onClick={() => {
                onGraphChange({
                  ...graph,
                  nodes: graph.nodes.map((n) =>
                    n.id === ctxNode.id ? { ...n, bypass: !n.bypass } : n
                  ),
                });
                setCtxMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-row)] text-left"
            >
              {ctxNode.bypass ? t.op_unbypass : t.op_bypass}
            </button>
          )}
          {ctxNode.kind === "effect" && (
            <div className="relative group">
              <div className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-row)]">
                <span>{t.op_swap}</span>
                <span aria-hidden="true" className="text-muted">▸</span>
              </div>
              {/* Submenu on hover (#418) */}
              <div className="hidden group-hover:block absolute left-full top-0 min-w-[140px] bg-[var(--color-surface)] border border-[var(--color-border-header)] rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.4)] py-1">
                {Object.values(EFFECTS)
                  .filter((sp) => sp.id !== "text" && sp.id !== "dither" && sp.id !== ctxNode.effectId)
                  .map((sp) => (
                    <button
                      key={sp.id}
                      type="button"
                      onClick={() => {
                        onGraphChange({
                          ...graph,
                          nodes: graph.nodes.map((n) =>
                            n.id === ctxNode.id
                              ? {
                                  ...n,
                                  effectId: sp.id,
                                  params: Object.fromEntries(
                                    sp.params.map((sq) => [sq.name, sq.default])
                                  ),
                                }
                              : n
                          ),
                        });
                        setCtxMenu(null);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-row)] text-left"
                    >
                      {sp.label}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
