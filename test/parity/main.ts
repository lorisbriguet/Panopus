// Parity harness page: renders each effect through the REAL WebGL2
// preview executor (same modules the app bundles) and diffs the pixels
// against the wgpu goldens. Driven by run.mjs via window.runParity.

import { GlExecutor } from "../../src/lib/glExecutor";
import { EFFECTS } from "../../src/lib/effects";
import type { FinishGraph } from "../../src/lib/finishGraph";

const W = 512;
const H = 731;

export interface ParityResult {
  effect: string;
  total: number;
  bad: number;
  max: number;
  error?: string;
  /** PNG data URL of the JS render, so run.mjs can dump failures. */
  dump?: string;
}

declare global {
  interface Window {
    runParity: (effectId: string, tol: number) => Promise<ParityResult>;
    parityReady: boolean;
  }
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

async function loadPixels(url: string): Promise<ImageData> {
  const img = await loadImage(url);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

async function renderEffect(
  effectId: string
): Promise<{ data: ImageData; dump: string }> {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  const ex = new GlExecutor(canvas);
  ex.setSource("src", await createImageBitmap(await loadImage("../source.png")));
  const graph: FinishGraph = {
    v: 1,
    nodes: [
      { id: "src", kind: "source", x: 0, y: 0 },
      { id: "e", kind: "effect", effectId, params: {}, x: 0, y: 0 },
      { id: "out", kind: "output", x: 0, y: 0 },
    ],
    wires: [
      { from: "src", to: "e", toIn: 0 },
      { from: "e", to: "out", toIn: 0 },
    ],
  };
  // Effect texture assets load async behind a 1x1 placeholder; the first
  // render kicks the fetch off, onAssetLoaded cues the real one.
  const hasAssets = EFFECTS[effectId].passes.some(
    (p) => (p.textures ?? []).length > 0
  );
  if (hasAssets) {
    const loaded = new Promise<void>((resolve) => {
      ex.onAssetLoaded = () => resolve();
    });
    ex.render(graph, W, H);
    await loaded;
  }
  ex.render(graph, W, H);
  const err = ex.getCompileError("e");
  // Same-task readback (drawing buffer still intact). Alpha is 255
  // everywhere, so the 2D canvas premultiply roundtrip is lossless.
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0);
  const data = ctx.getImageData(0, 0, W, H);
  const dump = c.toDataURL("image/png");
  ex.dispose();
  if (err) throw new Error(err);
  return { data, dump };
}

window.runParity = async (effectId: string, tol: number): Promise<ParityResult> => {
  try {
    const { data: got, dump } = await renderEffect(effectId);
    const want = await loadPixels(`../goldens/${effectId}.png`);
    if (want.width !== W || want.height !== H) {
      throw new Error(`golden is ${want.width}x${want.height}, expected ${W}x${H}`);
    }
    let bad = 0;
    let max = 0;
    const diff = new ImageData(W, H);
    for (let i = 0; i < got.data.length; i += 4) {
      let pixelBad = false;
      let pixelMax = 0;
      for (let ch = 0; ch < 4; ch++) {
        const d = Math.abs(got.data[i + ch] - want.data[i + ch]);
        if (d > max) max = d;
        if (d > pixelMax) pixelMax = d;
        if (d > tol) pixelBad = true;
      }
      if (pixelBad) bad++;
      // amplified diff map (x8) for the failure dump
      const v = Math.min(255, pixelMax * 8);
      diff.data[i] = v;
      diff.data[i + 1] = pixelBad ? v : 0;
      diff.data[i + 2] = 0;
      diff.data[i + 3] = 255;
    }
    const dc = document.createElement("canvas");
    dc.width = W;
    dc.height = H;
    dc.getContext("2d")!.putImageData(diff, 0, 0);
    return {
      effect: effectId,
      total: W * H,
      bad,
      max,
      dump: bad > 0 ? dc.toDataURL("image/png") : dump,
    };
  } catch (e) {
    return { effect: effectId, total: 0, bad: 0, max: 0, error: String(e) };
  }
};
window.parityReady = true;
