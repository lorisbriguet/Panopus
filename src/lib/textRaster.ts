/**
 * Text rasterization for the Finish text operator (D3). The webview is
 * the ONLY font rasterizer in the system: activated project fonts draw
 * to an offscreen 2D canvas as white-on-transparent, the PNG is cached
 * by the Rust `save_finish_raster` command, and both engines composite
 * that raster (shaders/text/text.frag).
 *
 * The raster depends ONLY on content + font — fill is applied in-shader
 * and size is placement-only — so the cache key is `content|font`.
 */

/** Fixed glyph size in raster px; total height caps at MAX_RASTER_H. */
const FONT_PX = 160;
const LINE_HEIGHT = 1.2;
const MAX_RASTER_H = 1024;

export interface TextLayout {
  w: number;
  h: number;
  aspect: number;
  fontPx: number;
  pad: number;
  lines: string[];
}

interface MeasureCtx {
  font: string;
  measureText(s: string): { width: number };
}

/** Pure layout: line split, measure, pad, height cap. Testable with a
 *  fake measuring context. */
export function layoutText(
  content: string,
  font: string,
  ctx: MeasureCtx
): TextLayout {
  const lines = content.split("\n");
  let fontPx = FONT_PX;
  const measure = (px: number) => {
    ctx.font = `${px}px "${font}"`;
    let max = 1;
    for (const line of lines) {
      max = Math.max(max, ctx.measureText(line).width);
    }
    return max;
  };
  let pad = Math.round(fontPx * 0.15);
  let h = Math.round(lines.length * fontPx * LINE_HEIGHT + pad * 2);
  if (h > MAX_RASTER_H) {
    fontPx = Math.max(8, Math.floor((fontPx * MAX_RASTER_H) / h));
    pad = Math.round(fontPx * 0.15);
    h = Math.round(lines.length * fontPx * LINE_HEIGHT + pad * 2);
  }
  const w = Math.max(1, Math.ceil(measure(fontPx) + pad * 2));
  return { w, h, aspect: w / h, fontPx, pad, lines };
}

/** djb2 over the raster-relevant inputs — the node's rasterKey. */
export function rasterKey(content: string, font: string): string {
  const s = `${content}|${font}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export interface TextRaster {
  bytes: Uint8Array;
  aspect: number;
}

/** Draw white-on-transparent and encode PNG. Webview-only (needs a real
 *  2D canvas); callers in tests exercise layoutText instead. */
export async function rasterizeText(
  content: string,
  font: string
): Promise<TextRaster | null> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const layout = layoutText(content, font, ctx);
  canvas.width = layout.w;
  canvas.height = layout.h;
  ctx.clearRect(0, 0, layout.w, layout.h);
  ctx.font = `${layout.fontPx}px "${font}"`;
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "alphabetic";
  layout.lines.forEach((line, i) => {
    ctx.fillText(
      line,
      layout.pad,
      layout.pad + layout.fontPx * (i * LINE_HEIGHT + 0.85)
    );
  });
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (!blob) return null;
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    aspect: layout.aspect,
  };
}
