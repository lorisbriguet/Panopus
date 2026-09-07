import { useEffect, useRef, useState, useCallback } from "react";
import { GlExecutor } from "../../lib/glExecutor";
import type { FinishGraph } from "../../lib/finishGraph";
import { useT } from "../../i18n/useT";

interface PreviewCanvasProps {
  graph: FinishGraph;
  artworkBitmap: ImageBitmap | null;
  artworkPath: string;
  onCompileErrors?: (errors: Record<string, string | null>) => void;
}

/**
 * Owns a GlExecutor, re-renders rAF-throttled on graph/param changes, fit-to-panel size.
 * Recreates executor when artworkPath changes (per decision 1: sourceTex leak prevention).
 */
export function PreviewCanvas({ graph, artworkBitmap, artworkPath, onCompileErrors }: PreviewCanvasProps) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const executorRef = useRef<GlExecutor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [needsRender, setNeedsRender] = useState(false);

  // Recreate executor when artwork changes
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

    return () => {
      if (executorRef.current) {
        executorRef.current.dispose();
        executorRef.current = null;
      }
    };
  }, [artworkPath]);

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
    if (!executorRef.current || !canvasRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

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

    rafRef.current = null;
  }, [graph, onCompileErrors]);

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
      className="h-full border border-[var(--color-input-border)] rounded-lg bg-[var(--color-bg)] overflow-hidden"
    >
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
