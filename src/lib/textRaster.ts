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

/** Default glyph size in raster px; total height caps at MAX_RASTER_H.
 *  Callers pass a target height derived from the OUTPUT size so print
 *  text stays sharp (#417). */
const FONT_PX = 160;
const LINE_HEIGHT = 1.2;
const MAX_RASTER_H = 4096;

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
export interface TextOpts {
  targetHeight?: number;
  letterSpacing?: number; // em fraction (#405)
  lineHeight?: number;    // multiple of font size (#405)
  align?: "left" | "center" | "right";
}

export function layoutText(
  content: string,
  font: string,
  ctx: MeasureCtx,
  opts: TextOpts = {}
): TextLayout {
  const targetHeight = opts.targetHeight;
  const lineH = opts.lineHeight && opts.lineHeight > 0 ? opts.lineHeight : LINE_HEIGHT;
  const lines = content.split("\n");
  const metrics = (px: number) => {
    ctx.font = `${px}px "${font}"`;
    const spacing = opts.letterSpacing ?? 0;
    if ("letterSpacing" in ctx) {
      (ctx as { letterSpacing?: string }).letterSpacing = `${spacing * px}px`;
    }
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
        (lines.length - 1) * px * lineH + m.ascent + m.descent + pad * 2
      ),
      w: Math.max(1, Math.ceil(m.w + pad * 2)),
    };
  };
  let fontPx = targetHeight
    ? Math.min(2048, Math.max(16, Math.round(targetHeight / (lines.length * lineH))))
    : FONT_PX;
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
const LAYOUT_VERSION = "v8"; // v8: letterSpacing/lineHeight/align (#405)

export function rasterKey(content: string, font: string, bucket = ""): string {
  const s = `${content}|${font}|${bucket}|${LAYOUT_VERSION}`;
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
  font: string,
  opts: TextOpts = {}
): Promise<TextRaster | null> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const layout = layoutText(content, font, ctx, opts);
  canvas.width = layout.w;
  canvas.height = layout.h;
  ctx.clearRect(0, 0, layout.w, layout.h);
  ctx.font = `${layout.fontPx}px "${font}"`;
  if ("letterSpacing" in ctx) {
    (ctx as unknown as { letterSpacing: string }).letterSpacing =
      `${(opts.letterSpacing ?? 0) * layout.fontPx}px`;
  }
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "alphabetic";
  const lineH = opts.lineHeight && opts.lineHeight > 0 ? opts.lineHeight : LINE_HEIGHT;
  const align = opts.align ?? "left";
  layout.lines.forEach((line, i) => {
    let x = layout.originX;
    if (align !== "left") {
      const lw = ctx.measureText(line).width;
      const inner = layout.w - layout.pad * 2;
      x = layout.originX + (align === "center" ? (inner - lw) / 2 : inner - lw);
    }
    ctx.fillText(line, x, layout.pad + layout.ascent + i * layout.fontPx * lineH);
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
 * activation is not what the webview's canvas consults, and
 * document.fonts.check() LIES about activated families in WKWebView's
 * split-process world — so we keep OUR OWN registry of FontFaces
 * loaded from the actual files and never trust check().
 */
const loadedFaces = new Set<string>();

export function isFontLoaded(family: string): boolean {
  return loadedFaces.has(family);
}

export async function ensureFontLoaded(
  family: string,
  src: string | undefined
): Promise<void> {
  if (!family || !src || loadedFaces.has(family)) return;
  if (typeof FontFace === "undefined") return;
  if (typeof document === "undefined" || !("fonts" in document)) return;
  try {
    const face = new FontFace(family, `url("${src}")`);
    await face.load();
    document.fonts.add(face);
    loadedFaces.add(family);
    console.warn("[finish] font loaded:", family);
  } catch (e) {
    console.warn("[finish] font load failed:", family, src, e);
  }
}
