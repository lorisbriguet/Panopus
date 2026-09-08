import { describe, test, expect } from "vitest";
import {
  blockRect,
  chainDestRect,
  dragToParams,
  isDraggable,
} from "../previewDrag";
import type { GraphNode } from "../finishGraph";

const textNode = (params: Record<string, number> = {}): GraphNode => ({
  id: "t",
  kind: "text",
  params: { size: 0.2, rasterAspect: 4, x: 0, y: 0, ...params },
  x: 0,
  y: 0,
});

describe("chainDestRect", () => {
  test("fill covers the canvas (overflow allowed, centered)", () => {
    const d = chainDestRect(500, 731, "fill", 512, 731, 512)!;
    expect(d.h).toBe(731);
    expect(d.w).toBeGreaterThanOrEqual(500); // cover: no bars
    expect(d.left).toBeLessThanOrEqual(0);
  });

  test("fit letterboxes a squarer chain inside a taller page", () => {
    const d = chainDestRect(512, 800, "fit", 512, 731, 512)!;
    expect(d.h).toBe(731);
    expect(d.top).toBe(Math.round((800 - 731) / 2));
  });

  test("place maps chain pixels 1:1 through the page scale", () => {
    // canvas half the page's real px -> chain drawn at half its size
    const d = chainDestRect(256, 366, "place", 100, 50, 512)!;
    expect(d.w).toBe(50);
    expect(d.h).toBe(25);
  });

  test("degenerate sizes return null", () => {
    expect(chainDestRect(0, 100, "fill", 10, 10, 10)).toBeNull();
  });
});

describe("blockRect", () => {
  const dest = { left: 0, top: 0, w: 500, h: 1000 };

  test("text block: height from size, width from raster aspect, centered", () => {
    const r = blockRect(dest, textNode())!;
    expect(r.h).toBeCloseTo(200);
    expect(r.w).toBeCloseTo(800);
    expect(r.left).toBeCloseTo(250 - 400);
    expect(r.top).toBeCloseTo(500 - 100);
  });

  test("+y moves the block UP in css", () => {
    const r = blockRect(dest, textNode({ y: 0.25 }))!;
    expect(r.top).toBeCloseTo(500 - 250 - 100);
  });

  test("transform block scales the whole frame", () => {
    const n: GraphNode = {
      id: "tr",
      kind: "effect",
      effectId: "transform",
      params: { scale: 0.5, x: 0.1, y: 0 },
      x: 0,
      y: 0,
    };
    const r = blockRect(dest, n)!;
    expect(r.w).toBeCloseTo(250);
    expect(r.h).toBeCloseTo(500);
    expect(r.left).toBeCloseTo(0 + (0.6 * 500) - 125);
  });

  test("non-draggable kinds yield null", () => {
    expect(
      blockRect(dest, { id: "e", kind: "effect", effectId: "dither", x: 0, y: 0 })
    ).toBeNull();
  });
});

describe("dragToParams", () => {
  const dest = { left: 0, top: 0, w: 500, h: 1000 };

  test("css deltas convert to frame fractions with y inverted", () => {
    const r = dragToParams(dest, 0.1, -0.2, 50, 100);
    expect(r.x).toBeCloseTo(0.2);
    expect(r.y).toBeCloseTo(-0.3);
  });

  test("clamps to the param range", () => {
    const r = dragToParams(dest, 0.9, 0.9, 500, -500);
    expect(r.x).toBe(1);
    expect(r.y).toBe(1);
  });
});

describe("isDraggable", () => {
  test("text and transform only", () => {
    expect(isDraggable(textNode())).toBe(true);
    expect(
      isDraggable({ id: "tr", kind: "effect", effectId: "transform", x: 0, y: 0 })
    ).toBe(true);
    expect(
      isDraggable({ id: "e", kind: "effect", effectId: "dither", x: 0, y: 0 })
    ).toBe(false);
    expect(isDraggable({ id: "s", kind: "source", x: 0, y: 0 })).toBe(false);
    expect(isDraggable(null)).toBe(false);
  });
});
