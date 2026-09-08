#!/usr/bin/env node
// Parity runner (pre-release gate, see RELEASING.md — not part of `npm
// test`): builds the harness, serves test/parity over localhost, drives
// Playwright chromium through every graph CASE in cases/*.json and
// diffs each output against the wgpu goldens. Pass: >=99% of pixels
// within 6/255 per channel.
//
// Regenerate goldens first when shaders/cases change:
//   (cd src-tauri && cargo test --test parity_goldens -- --ignored)

import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(dir, "../..");
const TOLERANCE = 6; // per-channel, 0-255
const MAX_BAD_RATIO = 0.01;

execFileSync("npx", ["vite", "build", "--config", path.join(dir, "vite.config.ts")], {
  stdio: "inherit",
  cwd: repoRoot,
});

const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".png": "image/png",
  ".json": "application/json",
  ".map": "application/json",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const file = path.normalize(path.join(dir, decodeURIComponent(url.pathname)));
    if (!file.startsWith(dir + path.sep)) throw new Error("outside root");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

const caseFiles = (await readdir(path.join(dir, "cases")))
  .filter((f) => f.endsWith(".json"))
  .sort();

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.error("[page]", m.text());
});
page.on("pageerror", (e) => console.error("[pageerror]", e));
await page.goto(`http://127.0.0.1:${port}/dist/harness.html`);
await page.waitForFunction(() => window.parityReady);

let failed = false;
const rows = [];
for (const file of caseFiles) {
  const kase = JSON.parse(await readFile(path.join(dir, "cases", file), "utf8"));
  const outputs = kase.graph.nodes.filter((n) => n.kind === "output");
  for (const out of outputs) {
    const oname =
      typeof out.params?.name === "string" && out.params.name.trim() !== ""
        ? out.params.name
        : "output";
    const golden =
      outputs.length === 1 ? `${kase.name}.png` : `${kase.name}-${oname}.png`;
    const label = outputs.length === 1 ? kase.name : `${kase.name}/${oname}`;
    const r = await page.evaluate(
      ([graph, outputId, goldenName, tol]) =>
        window.runParityCase(graph, outputId, goldenName, tol),
      [kase.graph, out.id, golden, TOLERANCE]
    );
    const ratio = r.total > 0 ? r.bad / r.total : 1;
    const pass = !r.error && ratio <= MAX_BAD_RATIO;
    if (!pass) {
      failed = true;
      if (r.dump) {
        // Dump the diff/render next to the golden for eyeball diffing.
        const b64 = r.dump.replace(/^data:image\/png;base64,/, "");
        await writeFile(
          path.join(dir, `failed-${label.replace("/", "-")}.png`),
          Buffer.from(b64, "base64")
        );
      }
    }
    rows.push({
      case: label,
      result: pass ? "PASS" : "FAIL",
      "bad px": r.bad,
      "bad %": (ratio * 100).toFixed(3),
      "max diff": r.max,
      error: r.error ?? "",
    });
  }
}
console.table(rows);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
