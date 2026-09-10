/**
 * Gradient-map stop model behind the Photoshop-style editor (#387,
 * node review): stops live in FLAT effect params (c1..c8 / p1..p8 +
 * stops count) so both engines' generic uniform plumbing keeps working;
 * this module is the list <-> slots codec plus the pure interactions
 * (add-at-position with sampled color, remove, move-with-crossing).
 * sampleGradient mirrors gradientmap.frag's chained lerp exactly.
 */

export const MAX_STOPS = 8;

export type GradientStop = { color: string; pos: number };

const DEFAULT_COLORS = [
  "#101014",
  "#f2ede4",
  "#e05252",
  "#ffffff",
  "#ffffff",
  "#ffffff",
  "#ffffff",
  "#ffffff",
];

type Params = Record<string, unknown>;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").flatMap((c) => [c, c]).join("") : h;
  const n = parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Slots -> sorted stop list (2..MAX_STOPS). */
export function readStops(params: Params): GradientStop[] {
  const count = Math.min(
    MAX_STOPS,
    Math.max(2, Math.round(typeof params.stops === "number" ? (params.stops as number) : 2))
  );
  const out: GradientStop[] = [];
  for (let i = 1; i <= count; i++) {
    const c = params[`c${i}`];
    const p = params[`p${i}`];
    out.push({
      color: typeof c === "string" ? c : DEFAULT_COLORS[i - 1],
      pos:
        typeof p === "number" && Number.isFinite(p)
          ? Math.min(1, Math.max(0, p))
          : i === 1
            ? 0
            : 1,
    });
  }
  return out.sort((a, b) => a.pos - b.pos);
}

/** Sorted stop list -> complete flat patch (unused slots parked at 1). */
export function writeStops(
  stops: GradientStop[]
): Record<string, number | string> {
  const sorted = [...stops].sort((a, b) => a.pos - b.pos).slice(0, MAX_STOPS);
  const out: Record<string, number | string> = { stops: sorted.length };
  for (let i = 1; i <= MAX_STOPS; i++) {
    const s = sorted[i - 1];
    out[`c${i}`] = s?.color ?? sorted[sorted.length - 1]?.color ?? "#ffffff";
    out[`p${i}`] = s?.pos ?? 1;
  }
  return out;
}

/** The frag's chained lerp: each segment re-mixes toward the NEXT color. */
export function sampleGradient(stops: GradientStop[], t: number): string {
  const s = [...stops].sort((a, b) => a.pos - b.pos);
  let g = hexToRgb(s[0]?.color ?? "#000000");
  for (let i = 1; i < s.length; i++) {
    const span = Math.max(s[i].pos - s[i - 1].pos, 1e-4);
    const k = Math.min(1, Math.max(0, (t - s[i - 1].pos) / span));
    const c = hexToRgb(s[i].color);
    g = [g[0] + (c[0] - g[0]) * k, g[1] + (c[1] - g[1]) * k, g[2] + (c[2] - g[2]) * k];
  }
  return rgbToHex(g as [number, number, number]);
}

/** Photoshop add: click position picks up the gradient's own color. */
export function addStop(stops: GradientStop[], pos: number): GradientStop[] {
  if (stops.length >= MAX_STOPS) return stops;
  const p = Math.min(1, Math.max(0, pos));
  return [...stops, { color: sampleGradient(stops, p), pos: p }].sort(
    (a, b) => a.pos - b.pos
  );
}

export function removeStop(stops: GradientStop[], index: number): GradientStop[] {
  if (stops.length <= 2) return stops;
  return stops.filter((_, i) => i !== index);
}

/** Photoshop move: stops may cross (list re-sorts); returns the moved
 *  stop's index in the new order so selection can follow it. */
export function moveStop(
  stops: GradientStop[],
  index: number,
  pos: number
): { stops: GradientStop[]; index: number } {
  const moved = { ...stops[index], pos: Math.min(1, Math.max(0, pos)) };
  const rest = stops.filter((_, i) => i !== index);
  const next = [...rest, moved].sort((a, b) => a.pos - b.pos);
  return { stops: next, index: next.indexOf(moved) };
}
