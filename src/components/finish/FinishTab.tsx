import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { NodeCanvas } from "./NodeCanvas";
import { ParamsPanel } from "./ParamsPanel";
import { PreviewCanvas } from "./PreviewCanvas";
import { ExportDialog } from "./ExportDialog";
import { useSaveProjectGraph } from "../../hooks/useProjects";
import type { FinishGraph } from "../../lib/finishGraph";
import {
  outputRatio,
  outputSettings,
  parseGraph,
  serializeGraph,
} from "../../lib/finishGraph";
import { createHistory } from "../../lib/graphHistory";
import type { GraphHistory } from "../../lib/graphHistory";

interface FinishTabProps {
  projectId: number;
  /** Null until the Source operator attaches one. */
  artworkPath: string | null;
  artworkMissing?: boolean;
  onPickArtwork: () => void;
  pickPending?: boolean;
  graph: FinishGraph;
}

/**
 * Finish tab: node editor (bottom), params panel (right), preview (top).
 * Autosaves graph changes with 800ms debounce.
 */
export function FinishTab({
  projectId,
  artworkPath,
  artworkMissing,
  onPickArtwork,
  pickPending,
  graph: initialGraph,
}: FinishTabProps) {
  const [graph, setGraph] = useState<FinishGraph>(initialGraph);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  /** The original artwork, untouched — placement is the output node's
   *  job (executor + Rust exporter both compose at the output stage). */
  const [artworkFull, setArtworkFull] = useState<ImageBitmap | null>(null);
  const [compileErrors, setCompileErrors] = useState<Record<string, string | null>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [exportOpen, setExportOpen] = useState(false);
  const { mutate: saveGraphMutate } = useSaveProjectGraph();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Local graph undo history, seeded with the mount graph. Every edit
  // commits through commitGraph; undo/redo restore WITHOUT pushing.
  const historyRef = useRef<GraphHistory | null>(null);
  if (!historyRef.current) {
    historyRef.current = createHistory();
    historyRef.current.push(serializeGraph(initialGraph), Date.now());
  }

  const commitGraph = useCallback((next: FinishGraph) => {
    setGraph(next);
    historyRef.current!.push(serializeGraph(next), Date.now());
  }, []);

  // Load artwork bitmap
  useEffect(() => {
    if (!artworkPath) {
      setArtworkFull(null);
      return;
    }
    let cancelled = false;
    invoke<number[]>("read_artwork_bytes", { path: artworkPath })
      .then((bytes) => {
        if (cancelled) return;
        const uint8Array = new Uint8Array(bytes);
        const blob = new Blob([uint8Array]);
        return createImageBitmap(blob);
      })
      .then((bitmap) => {
        if (cancelled || !bitmap) return;
        setArtworkFull(bitmap);
      })
      .catch((e) => {
        // Surfaced here for devtools; the parent page's liveness probe
        // owns the user-facing "artwork missing" state.
        console.warn("[finish] artwork load failed:", e);
      });
    return () => {
      cancelled = true;
    };
  }, [artworkPath]);

  // Output settings drive the page aspect (preview canvas shape); the
  // artwork itself stays untouched and the executor places it at the
  // output node.
  const settings = outputSettings(graph);
  const ratio = outputRatio(settings);
  const artRatio = artworkFull ? artworkFull.width / artworkFull.height : undefined;

  // Debounced autosave (800ms)
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const graphJson = serializeGraph(graph);
      saveGraphMutate({ id: projectId, graphJson });
    }, 800);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [graph, projectId, saveGraphMutate]);

  const handleGraphChange = useCallback(
    (newGraph: FinishGraph) => {
      commitGraph(newGraph);
    },
    [commitGraph]
  );

  // Cmd+Z / Cmd+Shift+Z, CAPTURE phase so it preempts App.tsx's global
  // DB-undo listener while the Finish tab is mounted. Falls through
  // (no preventDefault) when the graph history has nothing to give,
  // and never fires while typing in a field.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || (e.key !== "z" && e.key !== "Z")) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (target?.isContentEditable || target?.closest?.('[contenteditable="true"]')) return;
      const h = historyRef.current!;
      const json = e.shiftKey ? h.redo() : h.undo();
      if (json === null) return;
      e.preventDefault();
      e.stopPropagation();
      const restored = parseGraph(json);
      setGraph(restored);
      setSelectedNodeId((sel) =>
        sel && restored.nodes.some((n) => n.id === sel) ? sel : null
      );
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, []);

  const handleNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const selectedNode = selectedNodeId
    ? graph.nodes.find((n) => n.id === selectedNodeId)
    : null;

  return (
    <div className="relative h-full border border-[var(--color-input-border)] rounded-lg overflow-hidden">
      {/* Full-bleed preview behind everything, F4-contained */}
      <div className="absolute inset-0">
        <PreviewCanvas
          graph={graph}
          artworkBitmap={artworkFull}
          artworkPath={artworkPath ?? ""}
          ratio={ratio}
          onCompileErrors={setCompileErrors}
          onThumbnails={setThumbs}
        />
      </div>

      {/* Network spans the whole tab, transparent over the preview */}
      <div className="absolute inset-0 z-10">
        <NodeCanvas
          graph={graph}
          onGraphChange={handleGraphChange}
          selectedNodeId={selectedNodeId}
          onNodeSelect={handleNodeSelect}
          thumbnails={thumbs}
          ratio={ratio}
          sourceRatio={artRatio}
        />
      </div>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        projectId={projectId}
        artworkBitmap={artworkFull}
        settings={settings}
      />

      {/* Parameter dialog floats on the right, TD-style */}
      {selectedNode && (
        <div className="absolute top-3 right-3 bottom-3 w-80 z-20">
          <ParamsPanel
            node={selectedNode}
            onParamsChange={(params) => {
              commitGraph({
                ...graph,
                nodes: graph.nodes.map((n) =>
                  n.id === selectedNode.id ? { ...n, params } : n
                ),
              });
            }}
            compileError={compileErrors[selectedNode.id] ?? null}
            onExport={() => setExportOpen(true)}
            artworkPath={artworkPath}
            artworkMissing={artworkMissing}
            onPickArtwork={onPickArtwork}
            pickPending={pickPending}
          />
        </div>
      )}
    </div>
  );
}
