// Parity harness page: renders graph CASES through the REAL WebGL2
// preview executor (same modules the app bundles) and diffs the pixels
// against the wgpu goldens. Driven by run.mjs via window.runParityCase.

import { GlExecutor } from "../../src/lib/glExecutor";
import { EFFECTS } from "../../src/lib/effects";
import { outputPx, outputSettingsFrom } from "../../src/lib/finishGraph";
import type { FinishGraph } from "../../src/lib/finishGraph";

export interface ParityResult {
  total: number;
  bad: number;
  max: number;
  error?: string;
  /** PNG data URL (amplified diff on failure), so run.mjs can dump it. */
  dump?: string;
}

declare global {
  interface Window {
    runParityCase: (
      graph: FinishGraph,
      outputId: string,
      goldenName: string,
      tol: number
    ) => Promise<ParityResult>;
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

async function renderCase(
  graph: FinishGraph,
  outputId: string
): Promise<{ data: ImageData; dump: string }> {
  const out = graph.nodes.find((n) => n.id === outputId);
  const px = outputPx(outputSettingsFrom(out?.params));
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  const ex = new GlExecutor(canvas);
  // Convention (mirrors parity_goldens.rs): a case source node's
  // sourcePath (and a text node's rasterPath) names a file in the
  // parity dir; source default = source.png.
  for (const n of graph.nodes) {
    if (n.kind === "source") {
      const file = n.sourcePath ?? "source.png";
      ex.setSource(n.id, await createImageBitmap(await loadImage(`../${file}`)));
    } else if (n.kind === "text" && n.rasterPath) {
      ex.setNodeRaster(
        n.id,
        await createImageBitmap(await loadImage(`../${n.rasterPath}`))
      );
    }
  }
  ex.previewOutput = outputId;
  // Effect texture assets load async behind a 1x1 placeholder; the first
  // render kicks the fetch off, onAssetLoaded cues the real one.
  const hasAssets = graph.nodes.some(
    (n) =>
      n.kind === "effect" &&
      EFFECTS[n.effectId ?? ""]?.passes.some((p) => (p.textures ?? []).length > 0)
  );
  if (hasAssets) {
    const loaded = new Promise<void>((resolve) => {
      ex.onAssetLoaded = () => resolve();
    });
    ex.render(graph, px.w, px.h);
    await loaded;
  }
  ex.render(graph, px.w, px.h);
  const errs = graph.nodes
    .map((n) => ex.getCompileError(n.id))
    .filter((e): e is string => e !== null);
  // Same-task readback (drawing buffer still intact). Alpha is 255
  // everywhere, so the 2D canvas premultiply roundtrip is lossless.
  const c = document.createElement("canvas");
  c.width = px.w;
  c.height = px.h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0);
  const data = ctx.getImageData(0, 0, px.w, px.h);
  const dump = c.toDataURL("image/png");
  ex.dispose();
  if (errs.length > 0) throw new Error(errs[0]);
  return { data, dump };
}

window.runParityCase = async (
  graph: FinishGraph,
  outputId: string,
  goldenName: string,
  tol: number
): Promise<ParityResult> => {
  try {
    const { data: got, dump } = await renderCase(graph, outputId);
    const want = await loadPixels(`../goldens/${goldenName}`);
    if (want.width !== got.width || want.height !== got.height) {
      throw new Error(
        `golden is ${want.width}x${want.height}, render is ${got.width}x${got.height}`
      );
    }
    let bad = 0;
    let max = 0;
    const diff = new ImageData(got.width, got.height);
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
    dc.width = got.width;
    dc.height = got.height;
    dc.getContext("2d")!.putImageData(diff, 0, 0);
    return {
      total: got.width * got.height,
      bad,
      max,
      dump: bad > 0 ? dc.toDataURL("image/png") : dump,
    };
  } catch (e) {
    return { total: 0, bad: 0, max: 0, error: String(e) };
  }
};
window.parityReady = true;
