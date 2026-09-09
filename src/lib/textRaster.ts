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
  /** Baseline offset of the FIRST line from the top edge. */
  ascent: number;
  /** Draw x-origin (pad + max left bearing). */
  originX: number;
  lines: string[];
}

interface MeasureCtx {
  font: string;
  measureText(s: string): {
    width: number;
    actualBoundingBoxAscent?: number;
    actualBoundingBoxDescent?: number;
    actualBoundingBoxLeft?: number;
    actualBoundingBoxRight?: number;
  };
}

/** Pure layout: line split, TIGHT glyph bounds (actualBoundingBox
 *  metrics, em-fraction fallback), minimal pad, height cap (#403).
 *  Testable with a fake measuring context. */
export function layoutText(
  content: string,
  font: string,
  ctx: MeasureCtx
): TextLayout {
  const lines = content.split("\n");
  const metrics = (px: number) => {
    ctx.font = `${px}px "${font}"`;
    let w = 1;
    let ascent = 0;
    let descent = 0;
    let left = 0;
    for (const line of lines) {
      const m = ctx.measureText(line);
      // Ink bounds, not advance width (#410): bearings included.
      const lineW =
        (m.actualBoundingBoxLeft ?? 0) + (m.actualBoundingBoxRight ?? m.width);
      w = Math.max(w, lineW);
      left = Math.max(left, m.actualBoundingBoxLeft ?? 0);
      ascent = Math.max(ascent, m.actualBoundingBoxAscent ?? px * 0.8);
      descent = Math.max(descent, m.actualBoundingBoxDescent ?? px * 0.2);
    }
    return { w, ascent, descent, left };
  };
  const dims = (px: number, m: { w: number; ascent: number; descent: number }) => {
    const pad = Math.round(px * 0.05);
    return {
      pad,
      h: Math.round(
        (lines.length - 1) * px * LINE_HEIGHT + m.ascent + m.descent + pad * 2
      ),
      w: Math.max(1, Math.ceil(m.w + pad * 2)),
    };
  };
  let fontPx = FONT_PX;
  let m = metrics(fontPx);
  let d = dims(fontPx, m);
  if (d.h > MAX_RASTER_H) {
    fontPx = Math.max(8, Math.floor((fontPx * MAX_RASTER_H) / d.h));
    m = metrics(fontPx);
    d = dims(fontPx, m);
  }
  return {
    w: d.w,
    h: d.h,
    aspect: d.w / d.h,
    fontPx,
    pad: d.pad,
    ascent: m.ascent,
    originX: d.pad + m.left,
    lines,
  };
}

/** djb2 over the raster-relevant inputs — the node's rasterKey. The
 *  layout version participates so cached rasters refresh when the
 *  measurement rules change. */
const LAYOUT_VERSION = "v3"; // v3: ink-bounds width + bearings (#410)

export function rasterKey(content: string, font: string): string {
  const s = `${content}|${font}|${LAYOUT_VERSION}`;
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
      layout.originX,
      layout.pad + layout.ascent + i * layout.fontPx * LINE_HEIGHT
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

/**
 * Make a project font available to the 2D canvas (#411): CoreText
 * activation is not what the webview consults — load the actual font
 * FILE as a FontFace once, keyed by family.
 */
export async function ensureFontLoaded(
  family: string,
  src: string | undefined
): Promise<void> {
  if (!family || !src) return;
  if (typeof document === "undefined" || !("fonts" in document)) return;
  if (document.fonts.check(`16px "${family}"`)) return;
  try {
    const face = new FontFace(family, `url("${src}")`);
    await face.load();
    document.fonts.add(face);
  } catch (e) {
    console.warn("[finish] font load failed:", family, e);
  }
}
