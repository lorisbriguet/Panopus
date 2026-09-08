/**
 * Preview direct manipulation (D3/D9): pure geometry between the chain
 * frame, the page, and CSS pixels on the preview canvas. One drag
 * implementation serves BOTH text blocks and transform layers — their
 * x/y params are chain-frame fractions (+y = up in GL space).
 */

import type { GraphNode, OutputSettings } from "./finishGraph";

export interface DestRect {
  /** CSS (top-down) rect of the CHAIN frame on the canvas. */
  left: number;
  top: number;
  w: number;
  h: number;
}

/**
 * Where the chain frame lands on the (page-shaped) canvas — mirrors
 * GlExecutor.placeRect (fill/fit/place semantics) with the y-axis
 * flipped to CSS top-down.
 */
export function chainDestRect(
  canvasW: number,
  canvasH: number,
  fit: OutputSettings["fit"],
  tailW: number,
  tailH: number,
  pageW: number
): DestRect | null {
  if (canvasW <= 0 || canvasH <= 0 || tailW <= 0 || tailH <= 0 || pageW <= 0) {
    return null;
  }
  const ar = tailW / tailH;
  const k = canvasW / pageW;
  let dw: number;
  let dh: number;
  if (fit === "place") {
    dw = tailW * k;
    dh = tailH * k;
  } else if (fit === "fit" ? canvasW / canvasH > ar : canvasW / canvasH <= ar) {
    dh = canvasH;
    dw = canvasH * ar;
  } else {
    dw = canvasW;
    dh = canvasW / ar;
  }
  return {
    left: Math.round((canvasW - dw) / 2),
    top: Math.round((canvasH - dh) / 2),
    w: Math.max(1, Math.round(dw)),
    h: Math.max(1, Math.round(dh)),
  };
}

const num = (v: unknown, def: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : def;

/** Is this node draggable on the preview? */
export function isDraggable(node: GraphNode | null | undefined): boolean {
  return (
    !!node &&
    (node.kind === "text" ||
      (node.kind === "effect" && node.effectId === "transform"))
  );
}

/** CSS rect of the selected node's block inside the chain dest rect. */
export function blockRect(
  dest: DestRect,
  node: GraphNode
): { left: number; top: number; w: number; h: number } | null {
  const p = node.params ?? {};
  const x = num(p.x, 0);
  const y = num(p.y, 0);
  let w: number;
  let h: number;
  if (node.kind === "text") {
    h = num(p.size, 0.15) * dest.h;
    w = h * num(p.rasterAspect, 4);
  } else if (node.kind === "effect" && node.effectId === "transform") {
    const s = num(p.scale, 1);
    w = dest.w * s;
    h = dest.h * s;
  } else {
    return null;
  }
  const cx = dest.left + (0.5 + x) * dest.w;
  const cy = dest.top + (0.5 - y) * dest.h; // +y = up
  return { left: cx - w / 2, top: cy - h / 2, w, h };
}

/** Apply a CSS-pixel drag delta to the node's x/y params (clamped). */
export function dragToParams(
  dest: DestRect,
  baseX: number,
  baseY: number,
  pxDx: number,
  pxDy: number
): { x: number; y: number } {
  const clamp = (v: number) => Math.min(1, Math.max(-1, v));
  return {
    x: clamp(baseX + pxDx / dest.w),
    y: clamp(baseY - pxDy / dest.h), // css down = frame down = -y
  };
}
