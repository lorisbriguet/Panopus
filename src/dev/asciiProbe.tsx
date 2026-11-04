// Dev-only probe: renders the ascii effect twice (font jgs5 vs jgsfont)
// through a FRESH GlExecutor to prove the uFont uniform changes output.
// Served at /ascii-probe.html. Not part of the app.
import { GlExecutor } from "../lib/glExecutor";
import type { FinishGraph } from "../lib/finishGraph";

async function artwork(): Promise<ImageBitmap> {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 731;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 512, 731);
  g.addColorStop(0, "#fff");
  g.addColorStop(1, "#000");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 731);
  ctx.fillStyle = "#888";
  ctx.font = "bold 200px Georgia";
  ctx.fillText("Aa", 60, 400);
  return createImageBitmap(c);
}

function graphFor(font: string): FinishGraph {
  return {
    v: 1,
    nodes: [
      { id: "src", kind: "source", x: 0, y: 0 },
      { id: "e", kind: "effect", effectId: "halftone", params: { pattern: "dots", dots: 14, grunge: 0.65, seed: font === "dots" ? 0 : 5, hard: 0.85, angle: 15 }, x: 0, y: 0 },
      { id: "out", kind: "output", params: { unit: "px", width: 512, height: 731, dpi: 300 }, x: 0, y: 0 },
    ],
    wires: [
      { from: "src", to: "e", toIn: 0 },
      { from: "e", to: "out", toIn: 0 },
    ],
  } as FinishGraph;
}

async function run() {
  const img = await artwork();
  const root = document.getElementById("root")!;
  for (const font of ["dots", "lines"]) {
    const canvas = document.createElement("canvas");
    canvas.style.width = "512px";
    canvas.style.height = "731px";
    const label = document.createElement("div");
    label.textContent = font;
    label.style.cssText = "color:#fff;font:14px monospace;margin:8px 0 2px";
    root.append(label, canvas);
    const ex = new GlExecutor(canvas);
    ex.setSource("src", img);
    ex.onAssetLoaded = () => ex.render(graphFor(font), 512, 731);
    ex.render(graphFor(font), 512, 731);
  }
}
run();
