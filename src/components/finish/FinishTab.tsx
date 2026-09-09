import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { NodeCanvas } from "./NodeCanvas";
import { ParamsPanel } from "./ParamsPanel";
import { PreviewCanvas } from "./PreviewCanvas";
import { ExportDialog } from "./ExportDialog";
import {
  useProjectFontFamilies,
  useProjectFontPaths,
  useSaveProjectGraph,
} from "../../hooks/useProjects";
import { ensureFontLoaded, rasterKey, rasterizeText } from "../../lib/textRaster";
import { useCreateRecipe, useRecipes } from "../../hooks/useRecipes";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { useT } from "../../i18n/useT";
import type { FinishGraph } from "../../lib/finishGraph";
import {
  applyRecipe,
  captureRecipe,
  nodeResolutions,
  outputNodes,
  outputRatio,
  outputSettingsForNode,
  parseGraph,
  serializeGraph,
  sourceNodes,
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
  /** Extra source nodes' bitmaps + per-node load errors (D7). */
  const [extraBitmaps, setExtraBitmaps] = useState<Record<string, ImageBitmap>>({});
  const [sourceErrors, setSourceErrors] = useState<Record<string, string>>({});
  /** Text nodes' raster bitmaps (D3), fed to the executor as uTex1. */
  const [textBitmaps, setTextBitmaps] = useState<Record<string, ImageBitmap>>({});
  const [compileErrors, setCompileErrors] = useState<Record<string, string | null>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [exportOpen, setExportOpen] = useState(false);
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [recipeName, setRecipeName] = useState("");
  const t = useT();
  const { data: recipes } = useRecipes();
  const createRecipe = useCreateRecipe();
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

  // Extra sources: load each additional source node's own artwork.
  const extraKey = sourceNodes(graph)
    .slice(1)
    .map((n) => `${n.id}:${n.sourcePath ?? ""}`)
    .join("|");
  useEffect(() => {
    let cancelled = false;
    const extras = sourceNodes(graph).slice(1);
    (async () => {
      const bitmaps: Record<string, ImageBitmap> = {};
      const errors: Record<string, string> = {};
      for (const n of extras) {
        if (!n.sourcePath) {
          errors[n.id] = "no artwork";
          continue;
        }
        try {
          const bytes = await invoke<number[]>("read_artwork_bytes", {
            path: n.sourcePath,
          });
          bitmaps[n.id] = await createImageBitmap(
            new Blob([new Uint8Array(bytes)])
          );
        } catch (e) {
          errors[n.id] = String(e);
        }
      }
      if (!cancelled) {
        setExtraBitmaps(bitmaps);
        setSourceErrors(errors);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- extraKey covers the graph's source paths
  }, [extraKey]);

  // Every source node's bitmap, keyed by node id (primary first).
  const sourceBitmaps = useMemo(() => {
    const map = new Map<string, ImageBitmap>();
    const srcs = sourceNodes(graph);
    if (srcs[0] && artworkFull) map.set(srcs[0].id, artworkFull);
    for (const n of srcs.slice(1)) {
      const b = extraBitmaps[n.id];
      if (b) map.set(n.id, b);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- extraKey covers the graph's source set
  }, [artworkFull, extraBitmaps, extraKey]);

  const pickExtraSource = useCallback(
    async (nodeId: string) => {
      const picked = await openDialog({
        filters: [{ name: "Image", extensions: ["png", "tif", "tiff"] }],
      });
      if (typeof picked === "string") {
        commitGraph({
          ...graph,
          nodes: graph.nodes.map((n) =>
            n.id === nodeId ? { ...n, sourcePath: picked } : n
          ),
        });
      }
    },
    [graph, commitGraph]
  );

  // Text rasters (D3): re-raster when content/font change (rasterKey
  // mismatch); load the cached file when only the bitmap is missing.
  // Raster refs are patched QUIETLY (no undo entry) — undo restoring an
  // old key simply re-triggers this effect.
  const { data: textFonts } = useProjectFontFamilies(projectId);
  const { data: textFontPaths } = useProjectFontPaths(projectId);
  const textKeySig = graph.nodes
    .filter((n) => n.kind === "text")
    .map((n) => `${n.id}:${n.params?.content ?? ""}:${n.params?.font ?? ""}:${n.rasterKey ?? ""}`)
    .join("|");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const n of graph.nodes) {
        if (n.kind !== "text") continue;
        const content = String(n.params?.content ?? "");
        const font = String(n.params?.font ?? "");
        const key = rasterKey(content, font);
        if (key === n.rasterKey && n.rasterPath) {
          if (!textBitmaps[n.id]) {
            try {
              const bytes = await invoke<number[]>("read_artwork_bytes", {
                path: n.rasterPath,
              });
              if (cancelled) return;
              const bmp = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
              setTextBitmaps((prev) => ({ ...prev, [n.id]: bmp }));
            } catch (e) {
              console.warn("[finish] text raster load failed:", e);
            }
          }
          continue;
        }
        // The canvas needs the FILE, not CoreText activation (#411).
        const fontPath = textFontPaths?.[font];
        await ensureFontLoaded(font, fontPath ? convertFileSrc(fontPath) : undefined);
        const raster = await rasterizeText(content === "" ? " " : content, font);
        if (!raster || cancelled) continue;
        const path = await invoke<string>("save_finish_raster", {
          projectId,
          nodeId: n.id,
          bytes: Array.from(raster.bytes),
        });
        if (cancelled) return;
        if (typeof path !== "string") continue; // test stub environment
        const bmp = await createImageBitmap(
          new Blob([new Uint8Array(raster.bytes)])
        );
        setTextBitmaps((prev) => ({ ...prev, [n.id]: bmp }));
        setGraph((g) => ({
          ...g,
          nodes: g.nodes.map((m) =>
            m.id === n.id
              ? {
                  ...m,
                  rasterPath: path,
                  rasterKey: key,
                  params: { ...m.params, rasterAspect: raster.aspect },
                }
              : m
          ),
        }));
      }
    })().catch((e) => console.warn("[finish] text raster failed:", e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- textKeySig covers the text nodes
  }, [textKeySig, projectId, textFontPaths]);

  // The PREVIEW output (selected output node, else the first) drives
  // the page aspect of the big canvas; the artwork itself stays
  // untouched and the executor places it at the output nodes.
  const selectedNodeForOutput = selectedNodeId
    ? graph.nodes.find((n) => n.id === selectedNodeId)
    : null;
  const previewOutputId =
    selectedNodeForOutput?.kind === "output"
      ? selectedNodeForOutput.id
      : outputNodes(graph)[0]?.id ?? null;
  const settings = outputSettingsForNode(graph, previewOutputId ?? "");
  const ratio = outputRatio(settings);
  const artRatio = artworkFull ? artworkFull.width / artworkFull.height : undefined;

  // Per-node viewer aspects (scale nodes reshape mid-chain).
  const nodeRatios: Record<string, number> = {};
  if (sourceBitmaps.size > 0) {
    const dims = new Map(
      [...sourceBitmaps].map(([id, b]) => [id, { w: b.width, h: b.height }])
    );
    for (const [id, r] of nodeResolutions(graph, dims, 2048)) {
      nodeRatios[id] = r.w / r.h;
    }
  }

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
          sourceBitmaps={sourceBitmaps}
          rasterBitmaps={textBitmaps}
          artworkPath={artworkPath ?? ""}
          ratio={ratio}
          previewOutputId={previewOutputId}
          selectedNode={selectedNode}
          onNodeParams={(nodeId, patch) => {
            commitGraph({
              ...graph,
              nodes: graph.nodes.map((n) =>
                n.id === nodeId ? { ...n, params: { ...n.params, ...patch } } : n
              ),
            });
          }}
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
          nodeRatios={nodeRatios}
          recipes={recipes ?? []}
          onApplyRecipe={(json) => commitGraph(applyRecipe(graph, json))}
          onSaveRecipe={() => {
            setRecipeName("");
            setRecipeModalOpen(true);
          }}
        />
      </div>

      <Modal
        open={recipeModalOpen}
        onClose={() => setRecipeModalOpen(false)}
        title={t.recipe_save}
        footer={
          <Button
            disabled={recipeName.trim() === ""}
            loading={createRecipe.isPending}
            onClick={() => {
              createRecipe.mutate(
                { name: recipeName.trim(), nodesJson: captureRecipe(graph) },
                { onSuccess: () => setRecipeModalOpen(false) }
              );
            }}
          >
            {t.save}
          </Button>
        }
      >
        <Input
          autoFocus
          value={recipeName}
          placeholder={t.recipe_name_placeholder}
          onChange={(e) => setRecipeName(e.target.value)}
          aria-label={t.recipe_name_placeholder}
        />
      </Modal>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        projectId={projectId}
        artworkBitmap={artworkFull}
        outputs={outputNodes(graph).map((n) => ({
          id: n.id,
          settings: outputSettingsForNode(graph, n.id),
        }))}
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
            textFonts={textFonts ?? []}
            sourceInfo={
              selectedNode.kind === "source"
                ? sourceNodes(graph)[0]?.id === selectedNode.id
                  ? {
                      path: artworkPath,
                      missing: !!artworkMissing,
                      pending: pickPending,
                      onPick: onPickArtwork,
                    }
                  : {
                      path: selectedNode.sourcePath ?? null,
                      missing:
                        !selectedNode.sourcePath ||
                        !!sourceErrors[selectedNode.id],
                      onPick: () => pickExtraSource(selectedNode.id),
                    }
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
