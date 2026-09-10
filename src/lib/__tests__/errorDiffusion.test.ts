import { test, expect } from "vitest";
import { ED_ALGOS, diffuse, ditherRgba } from "../errorDiffusion";

// Hand-computed serpentine Floyd-Steinberg, 2x2 constant 0.5, 2 levels:
// (0,0) q=1 err=-.5 -> right -.21875, below -.15625, below-right -.03125
// (1,0) v=.28125 q=0 err=+.28125 -> below +.0879, below-left +.0527
// row 1 right-to-left: (1,1) v=.55664 q=1, err spreads left; (0,1) q=0.
test("floyd-steinberg 2x2 gray checkerboards (hand-computed)", () => {
  const out = diffuse(new Float64Array([0.5, 0.5, 0.5, 0.5]), 2, 2, "floydsteinberg", 2);
  expect(Array.from(out)).toEqual([1, 0, 0, 1]);
});

test("every algo is deterministic and stays in range", () => {
  const w = 17, h = 13;
  const src = new Float64Array(w * h);
  let s = 42;
  for (let i = 0; i < src.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    src[i] = (s % 1000) / 999;
  }
  for (const algo of ED_ALGOS) {
    const a = diffuse(src.slice(), w, h, algo, 2);
    const b = diffuse(src.slice(), w, h, algo, 2);
    expect(Array.from(a)).toEqual(Array.from(b));
    for (const v of a) expect(v === 0 || v === 1).toBe(true);
  }
});

test("full-diffusion kernels preserve the mean (Atkinson excluded by design)", () => {
  const w = 64, h = 64;
  const src = new Float64Array(w * h).fill(0.37);
  const mean = (arr: Float64Array) => arr.reduce((a, b) => a + b, 0) / arr.length;
  for (const algo of ED_ALGOS) {
    if (algo === "atkinson") continue;
    expect(mean(diffuse(src.slice(), w, h, algo, 2))).toBeCloseTo(0.37, 1);
  }
});

test("representable levels pass through exactly", () => {
  // 0.5 is a level at levels=3 -> zero error everywhere.
  const out = diffuse(new Float64Array(16).fill(0.5), 4, 4, "stucki", 3);
  expect(Array.from(out)).toEqual(new Array(16).fill(0.5));
});

test("ditherRgba mixes inks on the texel grid and keeps alpha", () => {
  // 2x2 image, texel 2 -> ONE coarse cell sampled at the block center
  // (pixel 1,1 in a 2x2 block per the GPU snapping rule), here white ->
  // every output pixel takes the light ink; alpha rides through per-pixel.
  const rgba = new Uint8Array([
    0, 0, 0, 255,      255, 255, 255, 200,
    255, 255, 255, 10,  255, 255, 255, 77,
  ]);
  const out = ditherRgba(rgba, 2, 2, {
    algo: "floydsteinberg",
    levels: 2,
    texel: 2,
    dark: [0, 0, 0],
    light: [255, 32, 64],
  });
  expect(Array.from(out.slice(0, 4))).toEqual([255, 32, 64, 255]);
  expect(out[7]).toBe(200);
  expect(out[11]).toBe(10);
  expect(out[15]).toBe(77);
});
