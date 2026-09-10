// Dev-only visual harness: mounts the real NodeCanvas over a busy artwork
// background (FinishTab's layering) with a representative graph, so node
// legibility can be reviewed in a plain browser — no Tauri, no DB.
// NOT part of the app. Served by vite at /nodecanvas-harness.html.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { NodeCanvas } from "../components/finish/NodeCanvas";
import type { FinishGraph } from "../lib/finishGraph";
import "../index.css";
import "./nodecanvasVariants.css";

const variant = new URLSearchParams(location.search).get("variant");
if (variant) document.body.dataset.variant = variant;

function thumb(w: number, h: number, hue: number, dark = false): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, `hsl(${hue} 80% ${dark ? 20 : 60}%)`);
  g.addColorStop(1, `hsl(${(hue + 60) % 360} 70% ${dark ? 10 : 35}%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `bold ${Math.round(h * 0.28)}px Georgia`;
  ctx.fillText("Aa", w * 0.14, h * 0.42);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(w * 0.1, h * 0.62, w * 0.8, h * 0.16);
  return c.toDataURL();
}

const graph: FinishGraph = {
  nodes: [
    { id: "src", kind: "source", x: 30, y: 180 },
    { id: "vhs", kind: "effect", effectId: "vhs", x: 190, y: 160, bypass: true },
    { id: "riso", kind: "effect", effectId: "riso", x: 350, y: 150 },
    { id: "txt", kind: "text", x: 350, y: 360 },
    { id: "mix", kind: "effect", effectId: "mix", x: 520, y: 220 },
    { id: "scale", kind: "scale", x: 680, y: 230 },
    { id: "out", kind: "output", x: 840, y: 210 },
  ],
  wires: [
    { from: "src", to: "vhs", toIn: 0 },
    { from: "vhs", to: "riso", toIn: 0 },
    { from: "riso", to: "mix", toIn: 0 },
    { from: "txt", to: "mix", toIn: 1 },
    { from: "mix", to: "scale", toIn: 0 },
    { from: "scale", to: "out", toIn: 0 },
  ],
} as FinishGraph;

const thumbnails: Record<string, string> = {
  src: thumb(192, 274, 210),
  vhs: thumb(192, 274, 210),
  riso: thumb(192, 274, 340),
  txt: thumb(192, 274, 0, true),
  mix: thumb(192, 274, 20),
  scale: thumb(192, 274, 20),
  out: thumb(192, 274, 20),
};

function Harness() {
  const [selected, setSelected] = useState<string | null>("riso");
  const [g, setG] = useState(graph);
  const [previewNode, setPreviewNode] = useState<string | null>("mix");
  return (
    <div className="relative" style={{ width: 1360, height: 850 }}>
      {/* artwork preview beneath the network, like FinishTab */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 120% at 30% 20%, hsl(18 85% 55%) 0%, hsl(340 70% 35%) 45%, hsl(250 60% 18%) 100%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            fontFamily: "Georgia, serif",
            color: "rgba(255,255,255,0.9)",
            fontSize: 170,
            fontWeight: 700,
            lineHeight: 0.95,
            padding: 40,
            letterSpacing: -4,
          }}
        >
          GRAND
          <br />
          HÔTEL
          <br />
          <span style={{ color: "rgba(20,10,40,0.85)" }}>SAVANT</span>
        </div>
      </div>
      <div className="absolute inset-0 z-10">
        <NodeCanvas
          graph={g}
          onGraphChange={setG}
          selectedNodeId={selected}
          onNodeSelect={setSelected}
          thumbnails={thumbnails}
          ratio={10571 / 15118}
          sourceRatio={10571 / 15118}
          previewNodeId={previewNode}
          onPreviewNode={setPreviewNode}
          recipes={[]}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);

// ?openadd — auto-open the Add menu for headless screenshots.
if (new URLSearchParams(location.search).has("openadd")) {
  setTimeout(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      /add/i.test(b.textContent ?? "")
    );
    btn?.click();
  }, 500);
}
