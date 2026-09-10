/**
 * Error-diffusion dithering for the Dithering node's CPU algos
 * (manifest cpuAlgos): sequential by nature, so it runs on the host in
 * BOTH engines — this module is mirrored by
 * src-tauri/src/render/error_diffusion.rs, f64 arithmetic on both sides
 * and identical traversal so the parity harness can compare them.
 * Serpentine scan (odd rows right-to-left, kernel x-mirrored).
 */

export const ED_ALGOS = [
  "floydsteinberg",
  "jjn",
  "stucki",
  "burkes",
  "sierra",
  "atkinson",
] as const;
export type EdAlgo = (typeof ED_ALGOS)[number];

type Kernel = {
  div: number;
  /** [dx, dy, numerator] taps, dy >= 0; dx mirrored on serpentine rows. */
  taps: ReadonlyArray<readonly [number, number, number]>;
};

const KERNELS: Record<EdAlgo, Kernel> = {
  floydsteinberg: {
    div: 16,
    taps: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]],
  },
  jjn: {
    div: 48,
    taps: [
      [1, 0, 7], [2, 0, 5],
      [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3],
      [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1],
    ],
  },
  stucki: {
    div: 42,
    taps: [
      [1, 0, 8], [2, 0, 4],
      [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
      [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1],
    ],
  },
  burkes: {
    div: 32,
    taps: [
      [1, 0, 8], [2, 0, 4],
      [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
    ],
  },
  sierra: {
    div: 32,
    taps: [
      [1, 0, 5], [2, 0, 3],
      [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2],
      [-1, 2, 2], [0, 2, 3], [1, 2, 2],
    ],
  },
  // Diffuses only 6/8 of the error by design — the washed Mac look.
  atkinson: {
    div: 8,
    taps: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]],
  },
};

/**
 * Quantize a grayscale field (0..1, row-major w*h) to `levels` levels,
 * diffusing the error. CONSUMES `gray` as its scratch buffer.
 */
export function diffuse(
  gray: Float64Array,
  w: number,
  h: number,
  algo: EdAlgo,
  levels: number
): Float64Array {
  const { div, taps } = KERNELS[algo];
  const L = Math.max(2, Math.round(levels)) - 1;
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    const rtl = (y & 1) === 1;
    for (let i = 0; i < w; i++) {
      const x = rtl ? w - 1 - i : i;
      const idx = y * w + x;
      const v = Math.min(1, Math.max(0, gray[idx]));
      const q = Math.round(v * L) / L;
      out[idx] = q;
      const err = v - q;
      for (const [dx0, dy, num] of taps) {
        const dx = rtl ? -dx0 : dx0;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= w || ny >= h) continue;
        gray[ny * w + nx] += (err * num) / div;
      }
    }
  }
  return out;
}

export type DitherRgbaOpts = {
  algo: EdAlgo;
  levels: number;
  /** Pattern texel in pixels — the working grid is one sample per texel
   *  block (block-center sample, the GPU snapping rule). */
  texel: number;
  /** Inks as 0..255 RGB. */
  dark: readonly [number, number, number];
  light: readonly [number, number, number];
};

/** Full RGBA pipeline: luma -> coarse grid -> diffuse -> ink mix, alpha
 *  passed through per-pixel (same contract as the frag). */
export function ditherRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  opts: DitherRgbaOpts
): Uint8ClampedArray {
  const texel = Math.max(1, Math.floor(opts.texel));
  const cw = Math.ceil(w / texel);
  const ch = Math.ceil(h / texel);
  const gray = new Float64Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      const sx = Math.min(w - 1, Math.floor((cx + 0.5) * texel));
      const sy = Math.min(h - 1, Math.floor((cy + 0.5) * texel));
      const p = (sy * w + sx) * 4;
      gray[cy * cw + cx] =
        (0.2126 * rgba[p] + 0.7152 * rgba[p + 1] + 0.0722 * rgba[p + 2]) / 255;
    }
  }
  const v = diffuse(gray, cw, ch, opts.algo, opts.levels);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const cy = Math.floor(y / texel) * cw;
    for (let x = 0; x < w; x++) {
      const q = v[cy + Math.floor(x / texel)];
      const o = (y * w + x) * 4;
      out[o] = Math.round(opts.dark[0] + (opts.light[0] - opts.dark[0]) * q);
      out[o + 1] = Math.round(opts.dark[1] + (opts.light[1] - opts.dark[1]) * q);
      out[o + 2] = Math.round(opts.dark[2] + (opts.light[2] - opts.dark[2]) * q);
      out[o + 3] = rgba[o + 3];
    }
  }
  return out;
}
