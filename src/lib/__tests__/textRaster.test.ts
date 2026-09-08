import { describe, test, expect } from "vitest";
import { layoutText, rasterKey } from "../textRaster";

const fakeCtx = (widthPerChar = 10) => ({
  font: "",
  measureText: (s: string) => ({ width: s.length * widthPerChar }),
});

describe("layoutText", () => {
  test("single line: width from measure + padding, height from line count", () => {
    const l = layoutText("PANOPUS", "Alpha", fakeCtx(50));
    expect(l.fontPx).toBe(160);
    expect(l.pad).toBe(24);
    expect(l.h).toBe(Math.round(160 * 1.2 + 48));
    expect(l.w).toBe(Math.ceil(7 * 50 + 48));
    expect(l.aspect).toBeCloseTo(l.w / l.h, 6);
  });

  test("multi-line grows height and measures the longest line", () => {
    const l = layoutText("AB\nABCD\nA", "Alpha", fakeCtx(10));
    expect(l.lines.length).toBe(3);
    expect(l.w).toBe(Math.ceil(40 + l.pad * 2));
    expect(l.h).toBe(Math.round(3 * 160 * 1.2 + l.pad * 2));
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
