import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { NodeCanvas } from "./NodeCanvas";
import { ParamsPanel } from "./ParamsPanel";
import { PreviewCanvas } from "./PreviewCanvas";
import { ExportDialog } from "./ExportDialog";
import { Button } from "../ui/Button";
import { useT } from "../../i18n/useT";
import { useSaveProjectGraph } from "../../hooks/useProjects";
import type { FinishGraph } from "../../lib/finishGraph";
import { serializeGraph } from "../../lib/finishGraph";

interface FinishTabProps {
  projectId: number;
  artworkPath: string;
  graph: FinishGraph;
}

/**
 * Finish tab: node editor (bottom), params panel (right), preview (top).
 * Autosaves graph changes with 800ms debounce.
 */
export function FinishTab({ projectId, artworkPath, graph: initialGraph }: FinishTabProps) {
  const [graph, setGraph] = useState<FinishGraph>(initialGraph);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [artworkBitmap, setArtworkBitmap] = useState<ImageBitmap | null>(null);
  const [compileErrors, setCompileErrors] = useState<Record<string, string | null>>({});
  const [exportOpen, setExportOpen] = useState(false);
  const t = useT();
  const { mutate: saveGraphMutate } = useSaveProjectGraph();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load artwork bitmap
  useEffect(() => {
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
        setArtworkBitmap(bitmap);
      })
      .catch(() => {
        // Artwork read failure is handled by the parent page's liveness probe
      });
    return () => {
      cancelled = true;
    };
  }, [artworkPath]);

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

  const handleGraphChange = useCallback((newGraph: FinishGraph) => {
    setGraph(newGraph);
  }, []);

  const handleNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const selectedNode = selectedNodeId
    ? graph.nodes.find((n) => n.id === selectedNodeId)
    : null;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Export */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setExportOpen(true)}>
          {t.export_run}
        </Button>
      </div>
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        projectId={projectId}
        artworkBitmap={artworkBitmap}
      />

      {/* Preview top */}
      <div className="flex-1 min-h-0">
        <PreviewCanvas
          graph={graph}
          artworkBitmap={artworkBitmap}
          artworkPath={artworkPath}
          onCompileErrors={setCompileErrors}
        />
      </div>

      {/* Node canvas and params panel bottom */}
      <div className="flex gap-4 h-96">
        <div className="flex-1 min-w-0">
          <NodeCanvas
            graph={graph}
            onGraphChange={handleGraphChange}
            selectedNodeId={selectedNodeId}
            onNodeSelect={handleNodeSelect}
          />
        </div>
        {selectedNode && selectedNode.kind === "effect" && (
          <div className="w-80 shrink-0">
            <ParamsPanel
              node={selectedNode}
              onParamsChange={(params) => {
                const newGraph = {
                  ...graph,
                  nodes: graph.nodes.map((n) =>
                    n.id === selectedNode.id ? { ...n, params } : n
                  ),
                };
                setGraph(newGraph);
              }}
              compileError={compileErrors[selectedNode.id] ?? null}
            />
          </div>
        )}
      </div>
    </div>
  );
}
