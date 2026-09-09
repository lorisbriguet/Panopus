import { describe, test, expect } from "vitest";
import { layoutText, rasterKey } from "../textRaster";

const fakeCtx = (
  widthPerChar = 10,
  bounds?: { ascent: number; descent: number }
) => ({
  font: "",
  measureText: (s: string) => ({
    width: s.length * widthPerChar,
    actualBoundingBoxAscent: bounds?.ascent,
    actualBoundingBoxDescent: bounds?.descent,
  }),
});

describe("layoutText (tight bounds, #403)", () => {
  test("single line without metrics: em-fraction fallback + minimal pad", () => {
    const l = layoutText("PANOPUS", "Alpha", fakeCtx(50));
    expect(l.fontPx).toBe(160);
    expect(l.pad).toBe(8);
    // (lines-1)*advance + ascent(0.8em) + descent(0.2em) + 2*pad
    expect(l.h).toBe(Math.round(160 * 0.8 + 160 * 0.2 + 16));
    expect(l.w).toBe(Math.ceil(7 * 50 + 16));
    expect(l.ascent).toBeCloseTo(128);
    expect(l.aspect).toBeCloseTo(l.w / l.h, 6);
  });

  test("real glyph metrics tighten the box", () => {
    const l = layoutText("xxxx", "Alpha", fakeCtx(10, { ascent: 90, descent: 6 }));
    expect(l.h).toBe(Math.round(90 + 6 + 16));
    expect(l.ascent).toBe(90);
  });

  test("multi-line grows by line advance and measures the longest line", () => {
    const l = layoutText("AB\nABCD\nA", "Alpha", fakeCtx(10));
    expect(l.lines.length).toBe(3);
    expect(l.w).toBe(Math.ceil(40 + 16));
    expect(l.h).toBe(Math.round(2 * 160 * 1.2 + 160 + 16));
  });

  test("many lines shrink the font so height stays capped", () => {
    const l = layoutText(Array(20).fill("X").join("\n"), "Alpha", fakeCtx());
    expect(l.h).toBeLessThanOrEqual(1024 + 2); // rounding slack
    expect(l.fontPx).toBeLessThan(160);
  });

  test("sets the font string on the context", () => {
    const ctx = fakeCtx();
    layoutText("hi", "Syne Extra", ctx);
    expect(ctx.font).toBe('160px "Syne Extra"');
  });
});

describe("rasterKey", () => {
  test("stable and input-sensitive", () => {
    expect(rasterKey("A", "F")).toBe(rasterKey("A", "F"));
    expect(rasterKey("A", "F")).not.toBe(rasterKey("B", "F"));
    expect(rasterKey("A", "F")).not.toBe(rasterKey("A", "G"));
  });
});
