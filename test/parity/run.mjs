#!/usr/bin/env node
// Parity runner (pre-release gate, see RELEASING.md — not part of `npm
// test`): builds the harness, serves test/parity over localhost, drives
// Playwright chromium through every effect and diffs against the wgpu
// goldens. Pass: >=99% of pixels within 6/255 per channel.
//
// Regenerate goldens first when shaders change:
//   (cd src-tauri && cargo test --test parity_goldens -- --ignored)

import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(dir, "../..");
const EFFECTS = ["dither", "vhs", "jpeg", "mix"];
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
for (const effect of EFFECTS) {
  const r = await page.evaluate(
    ([id, tol]) => window.runParity(id, tol),
    [effect, TOLERANCE]
  );
  const ratio = r.total > 0 ? r.bad / r.total : 1;
  const pass = !r.error && ratio <= MAX_BAD_RATIO;
  if (!pass) {
    failed = true;
    if (r.dump) {
      // Dump the JS render next to the golden for eyeball diffing.
      const b64 = r.dump.replace(/^data:image\/png;base64,/, "");
      await writeFile(path.join(dir, `failed-${effect}.png`), Buffer.from(b64, "base64"));
    }
  }
  rows.push({
    effect,
    result: pass ? "PASS" : "FAIL",
    "bad px": r.bad,
    "bad %": (ratio * 100).toFixed(3),
    "max diff": r.max,
    error: r.error ?? "",
  });
}
console.table(rows);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
