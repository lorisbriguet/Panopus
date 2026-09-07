import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  type Node,
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
import { wouldCycle } from "../../lib/finishGraph";
import type { FinishGraph, GraphNode, GraphWire } from "../../lib/finishGraph";
import { useT } from "../../i18n/useT";
import "@xyflow/react/dist/style.css";

interface NodeCanvasProps {
  graph: FinishGraph;
  onGraphChange: (graph: FinishGraph) => void;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
}

// Custom node components for @xyflow/react
function SourceNode({ data }: { data: { label: string } }) {
  return (
    <div className="px-4 py-2 bg-[var(--color-surface)] border border-[var(--color-input-border)] rounded-lg text-sm">
      <div className="font-medium">{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function EffectNode({ data, selected }: { data: { label: string }; selected: boolean }) {
  return (
    <div
      className={`px-4 py-2 bg-[var(--color-surface)] border rounded-lg text-sm ${
        selected ? "border-accent ring-2 ring-accent/20" : "border-[var(--color-input-border)]"
      }`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="font-medium">{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function OutputNode({ data }: { data: { label: string } }) {
  return (
    <div className="px-4 py-2 bg-[var(--color-surface)] border border-[var(--color-input-border)] rounded-lg text-sm">
      <Handle type="target" position={Position.Left} />
      <div className="font-medium">{data.label}</div>
    </div>
  );
}

const nodeTypes = {
  source: SourceNode,
  effect: EffectNode,
  output: OutputNode,
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
}: NodeCanvasProps) {
  const t = useT();
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Convert graph to ReactFlow format
  const nodes: Node[] = useMemo(
    () =>
      graph.nodes.map((n) => ({
        id: n.id,
        type: n.kind,
        position: { x: n.x, y: n.y },
        data: {
          label:
            n.kind === "source"
              ? "Source"
              : n.kind === "output"
              ? "Output"
              : EFFECTS[n.effectId ?? ""]?.label ?? "?",
        },
        selected: n.id === selectedNodeId,
      })),
    [graph.nodes, selectedNodeId]
  );

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
    (changes: unknown[]) => {
      // Handle node position changes and selection
      const newNodes = [...graph.nodes];
      let changed = false;

      for (const change of changes as Array<{
        type: string;
        id: string;
        position?: { x: number; y: number };
        selected?: boolean;
      }>) {
        if (change.type === "position" && change.position) {
          const idx = newNodes.findIndex((n) => n.id === change.id);
          if (idx !== -1) {
            newNodes[idx] = { ...newNodes[idx], ...change.position };
            changed = true;
          }
        } else if (change.type === "select") {
          if (change.selected) {
            onNodeSelect(change.id);
          }
        }
      }

      if (changed) {
        onGraphChange({ ...graph, nodes: newNodes });
      }
    },
    [graph, onGraphChange, onNodeSelect]
  );

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
          // Never delete source/output
          if (node && node.kind === "effect") {
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
    <div className="h-full border border-[var(--color-input-border)] rounded-lg relative bg-[var(--color-surface)]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onConnect={handleConnect}
        onNodesChange={handleNodesChange}
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
              {Object.values(EFFECTS).map((spec) => (
                <button
                  key={spec.id}
                  type="button"
                  onClick={() => handleAddEffect(spec.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-row)] text-left"
                >
                  {spec.label}
                </button>
              ))}
            </div>
          )}
        </Panel>
      </ReactFlow>
    </div>
  );
}
