import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Lazily registers one @font-face per library font so the grid can proof
 * 6'345 files without declaring 6'345 faces up front. All rules live in a
 * single <style id="panopus-fontfaces"> element; a module-level Set keeps
 * each id registered exactly once for the lifetime of the window.
 */
const registered = new Set<number>();

const SHEET_ID = "panopus-fontfaces";

function getSheet(): HTMLStyleElement {
  let el = document.getElementById(SHEET_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = SHEET_ID;
    document.head.appendChild(el);
  }
  return el;
}

/**
 * Ensure a @font-face rule exists for font `id` at `path` and return the
 * generated family name (`pf<id>`). Idempotent — repeat calls are no-ops.
 */
export function ensureFontFace(id: number, path: string): string {
  const family = `pf${id}`;
  if (registered.has(id)) return family;
  const el = getSheet();
  // Quotes are the only character that can break out of url("..."); escape them.
  const url = convertFileSrc(path).replace(/"/g, '\\"');
  const sheet = el.sheet;
  if (sheet) {
    sheet.insertRule(
      `@font-face { font-family: "${family}"; src: url("${url}"); }`,
      sheet.cssRules.length
    );
    registered.add(id);
  }
  return family;
}

/** Test hook: drop the singleton sheet and the id cache. */
export function __resetForTest(): void {
  registered.clear();
  document.getElementById(SHEET_ID)?.remove();
}
