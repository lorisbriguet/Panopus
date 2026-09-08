import { useEffect, useRef, useState, useCallback } from "react";
import { GlExecutor } from "../../lib/glExecutor";
import { F4_RATIO } from "../../lib/finishGraph";
import type { FinishGraph } from "../../lib/finishGraph";
import { useT } from "../../i18n/useT";

interface PreviewCanvasProps {
  graph: FinishGraph;
  artworkBitmap: ImageBitmap | null;
  artworkPath: string;
  /** Output aspect (w/h) from the PREVIEW output node's settings. */
  ratio?: number;
  /** Which output node's page the canvas shows (null = first). */
  previewOutputId?: string | null;
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
  artworkPath,
  ratio = F4_RATIO,
  previewOutputId = null,
  onCompileErrors,
  onThumbnails,
}: PreviewCanvasProps) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const executorRef = useRef<GlExecutor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [needsRender, setNeedsRender] = useState(false);
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

  // Upload source image when bitmap loads
  useEffect(() => {
    if (!artworkBitmap || !executorRef.current) return;
    const srcNode = graph.nodes.find((n) => n.kind === "source");
    if (srcNode) {
      executorRef.current.setSource(srcNode.id, artworkBitmap);
      setNeedsRender(true);
    }
  }, [artworkBitmap, graph.nodes]);

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
    </div>
  );
}
