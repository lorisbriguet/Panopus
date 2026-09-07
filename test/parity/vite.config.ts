// Build config for the parity harness: bundles the REAL preview executor
// + effect registry (including the shaders/ globs) into a static page
// that run.mjs serves and drives with Playwright.
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: __dirname,
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "harness.html"),
    },
  },
});
