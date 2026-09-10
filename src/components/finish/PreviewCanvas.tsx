import { useEffect, useRef, useState, useCallback } from "react";
import { GlExecutor } from "../../lib/glExecutor";
import {
  F4_RATIO,
  nodeResolutions,
  outputPx,
  outputSettingsForNode,
} from "../../lib/finishGraph";
import type { FinishGraph, GraphNode } from "../../lib/finishGraph";
import {
  blockRect,
  chainDestRect,
  dragToParams,
  isDraggable,
} from "../../lib/previewDrag";
import { useT } from "../../i18n/useT";

interface PreviewCanvasProps {
  graph: FinishGraph;
  /** PRIMARY artwork (placeholder gating + executor lifecycle key). */
  artworkBitmap: ImageBitmap | null;
  /** Every source node's bitmap, keyed by node id (D7 multi-source). */
  sourceBitmaps?: ReadonlyMap<string, ImageBitmap>;
  /** Text nodes' raster bitmaps, keyed by node id (D3). */
  rasterBitmaps?: Record<string, ImageBitmap>;
  artworkPath: string;
  /** Output aspect (w/h) from the PREVIEW output node's settings. */
  ratio?: number;
  /** Which output node's page the canvas shows (null = first). */
  previewOutputId?: string | null;
  /** Selected node — text/transform become draggable blocks (D3). */
  selectedNode?: GraphNode | null;
  onNodeParams?: (nodeId: string, patch: { x: number; y: number }) => void;
  onCompileErrors?: (errors: Record<string, string | null>) => void;
  /** Per-node output thumbnails (TouchDesigner-style operator viewers). */
  onThumbnails?: (thumbs: Record<string, string>) => void;
}

/**
 * Owns a GlExecutor, re-renders rAF-throttled on graph/param changes, fit-to-panel size.
 * Recreates executor when artworkPath changes (per decision 1: sourceTex leak prevention).
 */
export function PreviewCanvas({
  graph,
  artworkBitmap,
  sourceBitmaps,
  rasterBitmaps,
  artworkPath,
  ratio = F4_RATIO,
  previewOutputId = null,
  selectedNode = null,
  onNodeParams,
  onCompileErrors,
  onThumbnails,
}: PreviewCanvasProps) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const executorRef = useRef<GlExecutor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [needsRender, setNeedsRender] = useState(false);
  /** Canvas + container CSS sizes from the last render (drag overlay). */
  const [view, setView] = useState({ w: 0, h: 0, cw: 0, ch: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);
  // Ref so the executor keeps one stable callback across re-renders.
  const onThumbnailsRef = useRef(onThumbnails);
  onThumbnailsRef.current = onThumbnails;

  // Recreate executor when artwork changes. Also keyed on artworkBitmap:
  // while it is null the placeholder branch renders and the canvas is NOT
  // mounted, so the executor can only be created on the re-run after the
  // bitmap lands (the setSource effect below runs after this one).
  useEffect(() => {
    if (!canvasRef.current) return;

    // Dispose old executor
    if (executorRef.current) {
      executorRef.current.dispose();
      executorRef.current = null;
    }

    // Create new executor
    const executor = new GlExecutor(canvasRef.current);
    executorRef.current = executor;

    // Wire onAssetLoaded → trigger re-render
    executor.onAssetLoaded = () => {
      setNeedsRender(true);
    };
    // Operator viewers: capture node outputs alongside every render.
    executor.thumbSize = 128;
    executor.onThumbnails = (thumbs) => {
      onThumbnailsRef.current?.(thumbs);
    };

    return () => {
      if (executorRef.current) {
        executorRef.current.dispose();
        executorRef.current = null;
      }
    };
  }, [artworkPath, artworkBitmap]);

  // Upload every source node's bitmap when they load/change.
  useEffect(() => {
    const executor = executorRef.current;
    if (!executor) return;
    let uploaded = false;
    if (sourceBitmaps) {
      for (const [nodeId, bitmap] of sourceBitmaps) {
        executor.setSource(nodeId, bitmap);
        uploaded = true;
      }
    } else if (artworkBitmap) {
      const srcNode = graph.nodes.find((n) => n.kind === "source");
      if (srcNode) {
        executor.setSource(srcNode.id, artworkBitmap);
        uploaded = true;
      }
    }
    if (uploaded) setNeedsRender(true);
  }, [artworkBitmap, sourceBitmaps, graph.nodes]);

  // Re-render when the preview target or page shape changes (#419 —
  // the blue dot must take effect immediately).
  useEffect(() => {
    setNeedsRender(true);
  }, [previewOutputId, ratio]);

  // Upload text rasters (D3).
  useEffect(() => {
    const executor = executorRef.current;
    if (!executor || !rasterBitmaps) return;
    let uploaded = false;
    for (const [nodeId, bitmap] of Object.entries(rasterBitmaps)) {
      executor.setNodeRaster(nodeId, bitmap);
      uploaded = true;
    }
    if (uploaded) setNeedsRender(true);
  }, [rasterBitmaps]);

  // Trigger re-render on graph/param changes
  useEffect(() => {
    setNeedsRender(true);
  }, [graph]);

  // rAF-throttled render loop
  const render = useCallback(() => {
    // Clear FIRST: an early return that leaves the stale rAF id behind
    // wedges the `rafRef.current === null` gate forever.
    rafRef.current = null;
    if (!executorRef.current || !canvasRef.current || !containerRef.current) return;

    // Contain-fit the output aspect inside the panel: the canvas keeps
    // the poster's proportions (the bitmap is already cover-cropped to
    // it), whatever shape the container has.
    const container = containerRef.current;
    let width = container.clientWidth;
    let height = container.clientHeight;
    if (width / height > ratio) width = Math.floor(height * ratio);
    else height = Math.floor(width / ratio);

    width = Math.max(1, width);
    height = Math.max(1, height);
    setView((v) =>
      v.w === width && v.h === height &&
      v.cw === container.clientWidth && v.ch === container.clientHeight
        ? v
        : { w: width, h: height, cw: container.clientWidth, ch: container.clientHeight }
    );
    executorRef.current.previewOutput = previewOutputId;
    if (width > 0 && height > 0) {
      executorRef.current.render(graph, width, height);

      // Collect compile errors after render
      if (onCompileErrors) {
        const errors: Record<string, string | null> = {};
        for (const node of graph.nodes) {
          errors[node.id] = executorRef.current.getCompileError(node.id);
        }
        onCompileErrors(errors);
      }
    }
  }, [graph, ratio, previewOutputId, onCompileErrors]);

  useEffect(() => {
    if (needsRender && rafRef.current === null) {
      rafRef.current = requestAnimationFrame(render);
      setNeedsRender(false);
    }
  }, [needsRender, render]);

  // Render on resize
  useEffect(() => {
    const handleResize = () => setNeedsRender(true);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Drag overlay geometry (D3/D9): the selected text/transform block on
  // the canvas, via the same placement math the executor uses.
  let dest: ReturnType<typeof chainDestRect> = null;
  let block: ReturnType<typeof blockRect> = null;
  if (
    isDraggable(selectedNode) &&
    selectedNode &&
    view.w > 0 &&
    previewOutputId !== undefined
  ) {
    const settings = outputSettingsForNode(graph, previewOutputId ?? "");
    const pagePx = outputPx(settings);
    const dims = new Map<string, { w: number; h: number }>();
    if (sourceBitmaps) {
      for (const [id, b] of sourceBitmaps) dims.set(id, { w: b.width, h: b.height });
    }
    const outId = previewOutputId ?? graph.nodes.find((n) => n.kind === "output")?.id;
    const tail = outId
      ? nodeResolutions(graph, dims, 16384).get(outId)
      : undefined;
    if (tail) {
      dest = chainDestRect(view.w, view.h, settings.fit, tail.w, tail.h, pagePx.w);
      if (dest) block = blockRect(dest, selectedNode);
    }
  }

  if (!artworkBitmap) {
    return (
      <div className="h-full border border-[var(--color-input-border)] rounded-lg bg-[var(--color-surface)] flex items-center justify-center">
        <p className="text-sm text-muted">{t.finish_no_artwork}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full bg-[var(--color-bg)] overflow-hidden"
    >
      {/* No CSS size: the canvas displays at its attribute (render) size,
          centered — pixels stay square and the output aspect exact. The
          page frame keeps extreme formats reading as a page, not a glitch. */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 m-auto border border-white/15 shadow-[0_0_48px_rgba(0,0,0,0.55)]"
      />
      {block && (
        <>
          {/* Outline: visual only, UNDER the network so it never covers
              node UI (#412); rotation sign flipped per field test (#406). */}
          <div
            data-testid="drag-block"
            className="absolute z-[5] border border-accent pointer-events-none"
            style={{
              left: (view.cw - view.w) / 2 + block.left,
              top: (view.ch - view.h) / 2 + block.top,
              width: block.w,
              height: block.h,
              transform: `rotate(${
                typeof selectedNode?.params?.rotate === "number"
                  ? -selectedNode.params.rotate
                  : 0
              }deg)`,
              transformOrigin: "center",
            }}
          />
          {/* Center handle: the interactive drag surface, above the
              network (small, so it does not occlude). */}
          <div
            data-testid="drag-handle"
            className="absolute z-30 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-[2px] bg-accent cursor-move"
            style={{
              left: (view.cw - view.w) / 2 + block.left + block.w / 2,
              top: (view.ch - view.h) / 2 + block.top + block.h / 2,
            }}
          onPointerDown={(e) => {
            if (!selectedNode) return;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            const p = selectedNode.params ?? {};
            dragRef.current = {
              pointerId: e.pointerId,
              startX: e.clientX,
              startY: e.clientY,
              baseX: typeof p.x === "number" ? p.x : 0,
              baseY: typeof p.y === "number" ? p.y : 0,
            };
          }}
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d || !selectedNode || !dest || !onNodeParams) return;
            onNodeParams(
              selectedNode.id,
              dragToParams(
                dest,
                d.baseX,
                d.baseY,
                e.clientX - d.startX,
                e.clientY - d.startY
              )
            );
          }}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          />
        </>
      )}
    </div>
  );
}
