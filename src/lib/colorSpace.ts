/**
 * Color conversions for the Photoshop-style picker (node review): hex,
 * RGB 0-255, HSV (h 0-360, s/v 0-1). Pure and dependency-free.
 */

export function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.trim().replace(/^#/, "").toLowerCase();
  const full =
    h.length === 3 && /^[0-9a-f]{3}$/.test(h)
      ? h.split("").flatMap((c) => [c, c]).join("")
      : h;
  if (!/^[0-9a-f]{6}$/.test(full)) return null;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** "abc" / "#AABBCC" / " #ff8000 " -> "#aabbcc" form; null when invalid. */
export function normalizeHex(input: string): string | null {
  const rgb = hexToRgb(input);
  return rgb ? rgbToHex(...rgb) : null;
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, max === 0 ? 0 : d / max, max];
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  const [rn, gn, bn] =
    hh < 60 ? [c, x, 0]
    : hh < 120 ? [x, c, 0]
    : hh < 180 ? [0, c, x]
    : hh < 240 ? [0, x, c]
    : hh < 300 ? [x, 0, c]
    : [c, 0, x];
  return [
    Math.round((rn + m) * 255),
    Math.round((gn + m) * 255),
    Math.round((bn + m) * 255),
  ];
}
