import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Select, Toggle } from "../ui";
import { ColorPicker, type ColorPickerHandle } from "../ui/ColorPicker";
import { EFFECTS } from "../../lib/effects";
import type { ParamSpec } from "../../lib/effects";
import { outputPx, outputSettingsFrom } from "../../lib/finishGraph";
import type { GraphNode } from "../../lib/finishGraph";
import {
  addStop,
  moveStop,
  readStops,
  removeStop,
  writeStops,
  type GradientStop,
} from "../../lib/gradientStops";
import { useT } from "../../i18n/useT";

/**
 * TD-style scrub bar: a native range input restyled as a flat value-fill
 * bar with a thin caret — no fader chrome. Keyboard/AT still get a
 * regular slider.
 */
function ScrubBar({
  p,
  value,
  onChange,
}: {
  p: ParamSpec;
  value: number;
  onChange: (v: number) => void;
}) {
  const min = p.min ?? 0;
  const max = p.max ?? 1;
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={p.step ?? 1}
      value={value}
      aria-label={p.name}
      onChange={(e) =>
        onChange(
          p.type === "int"
            ? Math.round(Number(e.target.value))
            : Number(e.target.value)
        )
      }
      className="flex-1 min-w-0 h-4 appearance-none rounded-[2px] cursor-ew-resize outline-none focus-visible:ring-1 focus-visible:ring-accent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-[3px] [&::-webkit-slider-thumb]:rounded-none [&::-webkit-slider-thumb]:bg-white/90"
      style={{
        background: `linear-gradient(to right, color-mix(in srgb, var(--color-accent) 45%, transparent) ${pct}%, rgba(255,255,255,0.08) ${pct}%)`,
      }}
    />
  );
}

interface ParamsPanelProps {
  node: GraphNode;
  onParamsChange: (params: Record<string, number | string | boolean>) => void;
  /** Compile error from executor, if any */
  compileError?: string | null;
  /** Output operator: opens the export dialog. */
  onExport?: () => void;
  /** Source operator: the SELECTED source node's artwork + picker
   *  (primary = project artwork; extras = the node's sourcePath). */
  sourceInfo?: SourceInfo;
  /** Text operator: the project's font families (D3). */
  textFonts?: string[];
  /** family -> font file path (coverage checks, #416). */
  textFontPaths?: Record<string, string>;
}

export interface SourceInfo {
  path: string | null;
  missing: boolean;
  pending?: boolean;
  onPick: () => void;
}

// TD-style parameter dialog rows: flat hairlines, name | control | value.
const ROW = "flex items-center gap-3 px-3 py-2";
const NAME = "w-20 shrink-0 text-[10px] tracking-[0.08em] uppercase text-muted";
const READOUT =
  "w-10 shrink-0 text-right text-[10px] tabular-nums text-[var(--color-text-secondary)]";

/** Typeable value for scrub rows (#408): the readout IS an input. */
function ValueField({
  name,
  value,
  min,
  max,
  int,
  onChange,
}: {
  name: string;
  value: number;
  min: number;
  max: number;
  int?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      aria-label={`${name} value`}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (!Number.isFinite(n)) return;
        const c = Math.min(max, Math.max(min, n));
        onChange(int ? Math.round(c) : c);
      }}
      className="w-14 shrink-0 bg-transparent text-right text-[10px] tabular-nums text-[var(--color-text-secondary)] outline-none border-b border-transparent focus:border-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}

/** Flat mono number field for the output settings. */
function NumField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      aria-label={label}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
      className="flex-1 min-w-0 h-6 bg-white/[0.06] border border-white/10 rounded-[2px] px-2 text-right text-[11px] tabular-nums text-[var(--color-text-secondary)] outline-none focus:border-accent"
    />
  );
}

/** Source operator: the attached artwork, untouched by the chain. */
function SourceParams({ info }: { info?: SourceInfo }) {
  const t = useT();
  const name = info?.path ? info.path.split("/").pop() : null;
  return (
    <div className="h-full border border-white/10 rounded-[3px] bg-[var(--color-surface)] overflow-y-auto font-mono">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/10">
        <span className="inline-block w-1.5 h-1.5 rounded-[1px] bg-white/35" />
        <h3 className="text-[10px] tracking-[0.08em] uppercase text-[var(--color-text-secondary)]">
          Source
        </h3>
      </div>
      <div className="divide-y divide-white/[0.06]">
        <div className={ROW}>
          <label className={NAME}>{t.project_artwork_title}</label>
          <span
            className="flex-1 min-w-0 text-right text-[10px] text-[var(--color-text-secondary)] truncate"
            title={info?.path ?? undefined}
          >
            {name ?? "—"}
          </span>
        </div>
        {info?.missing && (
          <div className={ROW}>
            <p className="text-xs text-[var(--color-danger-text)]">
              {t.artwork_missing}
            </p>
          </div>
        )}
        <div className={ROW}>
          <Button
            variant="ghost"
            size="sm"
            onClick={info?.onPick}
            loading={info?.pending}
          >
            {t.project_pick_artwork}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Scale operator: factor or absolute size, resample filter. */
function ScaleParams({
  node,
  onParamsChange,
}: {
  node: GraphNode;
  onParamsChange: ParamsPanelProps["onParamsChange"];
}) {
  const p = node.params ?? {};
  const factor = typeof p.factor === "number" && Number.isFinite(p.factor) ? p.factor : 0.5;
  const width = typeof p.width === "number" && p.width > 0 ? p.width : 0;
  const height = typeof p.height === "number" && p.height > 0 ? p.height : 0;
  const filter = p.filter === "pixel" ? "pixel" : "smooth";
  const set = (patch: Record<string, number | string | boolean>) =>
    onParamsChange({ factor, width, height, filter, ...patch });

  return (
    <div className="h-full border border-white/10 rounded-[3px] bg-[var(--color-surface)] overflow-y-auto font-mono">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/10">
        <span className="inline-block w-1.5 h-1.5 rounded-[1px] bg-white/50" />
        <h3 className="text-[10px] tracking-[0.08em] uppercase text-[var(--color-text-secondary)]">
          Scale
        </h3>
      </div>
      <div className="divide-y divide-white/[0.06]">
        <div className={ROW}>
          <label className={NAME}>factor</label>
          <ScrubBar
            p={{ name: "factor", type: "float", min: 0.05, max: 4, step: 0.05, default: 0.5 }}
            value={factor}
            onChange={(v) => set({ factor: v })}
          />
          <ValueField
            name="factor"
            value={factor}
            min={0.05}
            max={4}
            onChange={(v) => set({ factor: v })}
          />
        </div>
        <div className={ROW}>
          <label className={NAME}>width</label>
          <NumField
            label="width"
            value={width}
            min={0}
            max={16384}
            onChange={(v) => set({ width: v })}
          />
        </div>
        <div className={ROW}>
          <label className={NAME}>height</label>
          <NumField
            label="height"
            value={height}
            min={0}
            max={16384}
            onChange={(v) => set({ height: v })}
          />
        </div>
        <div className={ROW}>
          <span className={NAME} />
          <span className="flex-1 text-right text-[10px] text-muted">
            width+height &gt; 0 override factor
          </span>
        </div>
        <div className={ROW}>
          <label className={NAME}>filter</label>
          <Select
            value={filter}
            onChange={(e) => set({ filter: e.target.value })}
          >
            <option value="smooth">smooth</option>
            <option value="pixel">pixel</option>
          </Select>
        </div>
      </div>
    </div>
  );
}

const TEXT_SCRUBS: { name: string; min: number; max: number; step: number; def: number }[] = [
  { name: "size", min: 0.01, max: 1, step: 0.005, def: 0.15 },
  { name: "stretch", min: 0.25, max: 4, step: 0.01, def: 1 },
  { name: "x", min: -1, max: 1, step: 0.005, def: 0 },
  { name: "y", min: -1, max: 1, step: 0.005, def: 0 },
  { name: "rotate", min: -180, max: 180, step: 0.5, def: 0 },
  { name: "opacity", min: 0, max: 1, step: 0.01, def: 1 },
  { name: "letterSpacing", min: -0.1, max: 1, step: 0.01, def: 0 },
  { name: "lineHeight", min: 0.8, max: 2, step: 0.05, def: 1.2 },
];

const ANCHORS = ["tl", "t", "tr", "l", "c", "r", "bl", "b", "br"] as const;

/** Text operator (D3): content + project font + placement. */
function TextParams({
  node,
  onParamsChange,
  textFonts,
  textFontPaths,
}: {
  node: GraphNode;
  onParamsChange: ParamsPanelProps["onParamsChange"];
  textFonts: string[];
  textFontPaths?: Record<string, string>;
}) {
  const t = useT();
  const p = node.params ?? {};
  const anchor = typeof p.anchor === "string" ? p.anchor : "c";
  const align = typeof p.align === "string" ? p.align : "left";
  // Coverage warning (#416): characters the chosen face cannot draw.
  const [missing, setMissing] = useState<string[]>([]);
  const covContent = typeof p.content === "string" ? p.content : "";
  const covFont = typeof p.font === "string" ? p.font : "";
  const covPath = textFontPaths?.[covFont];
  useEffect(() => {
    let cancelled = false;
    if (!covPath || covContent === "") {
      setMissing([]);
      return;
    }
    invoke<string[]>("check_font_coverage", { path: covPath, text: covContent })
      .then((chars) => {
        if (!cancelled) setMissing(Array.isArray(chars) ? chars : []);
      })
      .catch(() => {
        if (!cancelled) setMissing([]);
      });
    return () => {
      cancelled = true;
    };
  }, [covPath, covContent]);
  const content = typeof p.content === "string" ? p.content : "";
  const font = typeof p.font === "string" ? p.font : "";
  const fill = typeof p.fill === "string" ? p.fill : "#f2ede4";
  const set = (patch: Record<string, number | string | boolean>) =>
    onParamsChange({ ...p, ...patch });
  const fontMissing =
    font !== "" &&
    typeof document !== "undefined" &&
    "fonts" in document &&
    !document.fonts.check(`12px "${font}"`);

  return (
    <div className="h-full border border-white/10 rounded-[3px] bg-[var(--color-surface)] overflow-y-auto font-mono">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/10">
        <span className="inline-block w-1.5 h-1.5 rounded-[1px] bg-accent" />
        <h3 className="text-[10px] tracking-[0.08em] uppercase text-[var(--color-text-secondary)]">
          Text
        </h3>
      </div>
      <div className="divide-y divide-white/[0.06]">
        <div className="px-3 py-2">
          <textarea
            value={content}
            aria-label="content"
            rows={3}
            onChange={(e) => set({ content: e.target.value })}
            className="w-full bg-white/[0.06] border border-white/10 rounded-[2px] px-2 py-1 text-[11px] text-[var(--color-text-secondary)] outline-none focus:border-accent resize-y"
          />
        </div>
        <div className={ROW}>
          <label className={NAME}>font</label>
          <Select value={font} onChange={(e) => set({ font: e.target.value })}>
            <option value="">system</option>
            {textFonts.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
            {font !== "" && !textFonts.includes(font) && (
              <option value={font}>{font}</option>
            )}
          </Select>
        </div>
        {fontMissing && (
          <div className={ROW}>
            <p className="text-xs text-[var(--color-danger-text)]">{t.font_inactive}</p>
          </div>
        )}
        {missing.length > 0 && (
          <div className={ROW}>
            <p className="text-xs text-[var(--color-danger-text)]">
              {t.font_no_glyphs}: {missing.join(" ")}
            </p>
          </div>
        )}
        <div className={ROW}>
          <label className={NAME}>anchor</label>
          <div className="grid grid-cols-3 gap-0.5">
            {ANCHORS.map((a) => (
              <button
                key={a}
                type="button"
                aria-label={`anchor ${a}`}
                onClick={() => set({ anchor: a })}
                className={`w-4 h-4 rounded-[2px] border ${
                  anchor === a
                    ? "bg-accent border-accent"
                    : "bg-white/[0.06] border-white/15 hover:border-white/40"
                }`}
              />
            ))}
          </div>
        </div>
        <div className={ROW}>
          <label className={NAME}>align</label>
          <Select value={align} onChange={(e) => set({ align: e.target.value })}>
            <option value="left">left</option>
            <option value="center">center</option>
            <option value="right">right</option>
          </Select>
        </div>
        <div className={ROW}>
          <label className={NAME}>fill</label>
          <ColorPicker value={fill} onChange={(v) => set({ fill: v })} ariaLabel="fill color" />
        </div>
        {TEXT_SCRUBS.map((s) => {
          const value = typeof p[s.name] === "number" ? (p[s.name] as number) : s.def;
          return (
            <div key={s.name} className={ROW}>
              <label className={NAME}>{s.name}</label>
              <ScrubBar
                p={{ name: s.name, type: "float", min: s.min, max: s.max, step: s.step, default: s.def }}
                value={value}
                onChange={(v) => set({ [s.name]: v })}
              />
              <ValueField
                name={s.name}
                value={value}
                min={s.min}
                max={s.max}
                onChange={(v) => set({ [s.name]: v })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Photoshop-grammar gradient editor for the gradient map (#387, node
 *  review): click the bar to ADD a stop (it picks up the gradient's
 *  color there), drag markers to move (stops may cross and reorder),
 *  drag a marker off the bar to DELETE it, double-click for the color
 *  picker. 2-8 stops, stored flat (gradientStops codec). Exported for
 *  tests. */
export function GradientMapParams({
  node,
  onParamsChange,
}: {
  node: GraphNode;
  onParamsChange: ParamsPanelProps["onParamsChange"];
}) {
  const p = node.params ?? {};
  const stops = readStops(p);
  const mixV =
    typeof p.mix === "number" && Number.isFinite(p.mix) ? (p.mix as number) : 1;
  const [sel, setSel] = useState(0);
  const [ghost, setGhost] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const colorRef = useRef<ColorPickerHandle>(null);
  const selStop = stops[Math.min(sel, stops.length - 1)];

  const commit = (next: GradientStop[]) =>
    onParamsChange({ ...writeStops(next), mix: mixV });
  const barT = (clientX: number) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r) return 0;
    return (clientX - r.left) / Math.max(1, r.width);
  };
  /** Off-bar distance = Photoshop's delete gesture (only past 2 stops). */
  const offBar = (clientY: number) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r) return false;
    return clientY > r.bottom + 28 || clientY < r.top - 28;
  };
  const capture = (el: HTMLElement, pointerId: number) => {
    try {
      el.setPointerCapture(pointerId);
    } catch {
      // test DOMs without pointer capture
    }
  };

  const gradient = `linear-gradient(to right, ${stops
    .map((s) => `${s.color} ${s.pos * 100}%`)
    .join(", ")})`;

  return (
    <div className="h-full border border-white/10 rounded-[3px] bg-[var(--color-surface)] overflow-y-auto font-mono">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/10">
        <span className="inline-block w-1.5 h-1.5 rounded-[1px] bg-[#b98cff]" />
        <h3 className="text-[10px] tracking-[0.08em] uppercase text-[var(--color-text-secondary)]">
          Gradient Map
        </h3>
      </div>
      <div className="p-3 flex flex-col gap-2">
        <div className="pb-4">
          <div
            ref={barRef}
            data-testid="gradient-bar"
            className="relative h-7 rounded-[3px] border border-white/15 cursor-copy"
            style={{ background: gradient }}
            onPointerDown={(e) => {
              if (e.target !== e.currentTarget) return;
              // Photoshop add: new stop at the click, sampled color,
              // and it's immediately the dragged selection.
              const t = barT(e.clientX);
              const next = addStop(stops, t);
              if (next === stops) return; // at MAX_STOPS
              commit(next);
              setSel(next.findIndex((s) => s.pos === Math.min(1, Math.max(0, t))));
              dragging.current = true;
              capture(e.currentTarget, e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!dragging.current) return;
              if (offBar(e.clientY) && stops.length > 2) {
                setGhost(true);
                return;
              }
              setGhost(false);
              const { stops: next, index } = moveStop(stops, sel, barT(e.clientX));
              commit(next);
              setSel(index);
            }}
            onPointerUp={() => {
              if (dragging.current && ghost) {
                commit(removeStop(stops, sel));
                setSel(0);
              }
              dragging.current = false;
              setGhost(false);
            }}
          >
            {stops.map((s, i) => (
              <button
                key={i}
                type="button"
                aria-label={`stop ${i + 1}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSel(i);
                  dragging.current = true;
                  capture(e.currentTarget.parentElement as HTMLElement, e.pointerId);
                }}
                onDoubleClick={(e) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  colorRef.current?.open({
                    left: r.left + r.width / 2 - 108,
                    top: r.bottom + 6,
                  });
                }}
                className={`absolute top-full -translate-x-1/2 flex flex-col items-center pt-[1px] ${
                  ghost && sel === i ? "opacity-30" : ""
                }`}
                style={{ left: `${s.pos * 100}%` }}
              >
                <span
                  className="block w-0 h-0 border-x-[5px] border-x-transparent border-b-[5px]"
                  style={{
                    borderBottomColor:
                      sel === i ? "var(--color-accent)" : "rgba(255,255,255,0.75)",
                  }}
                />
                <span
                  className={`block w-3 h-3 border ${
                    sel === i ? "border-accent" : "border-white/70"
                  }`}
                  style={{ background: s.color }}
                />
              </button>
            ))}
          </div>
        </div>
        {/* No stop row: the markers ARE the UI — double-click opens the
            picker at the marker, drag off the bar deletes. */}
        <ColorPicker
          ref={colorRef}
          trigger={false}
          value={selStop?.color ?? "#ffffff"}
          onChange={(v) => {
            const next = stops.map((s, i) =>
              i === sel ? { ...s, color: v } : s
            );
            commit(next);
          }}
          ariaLabel="stop color"
        />
        <div className={ROW}>
          <label className={NAME}>mix</label>
          <ScrubBar
            p={{ name: "mix", type: "float", min: 0, max: 1, step: 0.01, default: 1 }}
            value={mixV}
            onChange={(v) => onParamsChange({ ...writeStops(stops), mix: v })}
          />
          <ValueField
            name="mix"
            value={mixV}
            min={0}
            max={1}
            onChange={(v) => onParamsChange({ ...writeStops(stops), mix: v })}
          />
        </div>
      </div>
    </div>
  );
}

/** Output operator settings: size (mm or px), density, color space. */
function OutputParams({
  node,
  onParamsChange,
  onExport,
}: {
  node: GraphNode;
  onParamsChange: ParamsPanelProps["onParamsChange"];
  onExport?: () => void;
}) {
  const s = outputSettingsFrom(node.params);
  const px = outputPx(s);
  const set = (patch: Partial<typeof s>) =>
    onParamsChange({ ...s, ...patch });

  return (
    <div className="h-full border border-white/10 rounded-[3px] bg-[var(--color-surface)] overflow-y-auto font-mono">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/10">
        <span className="inline-block w-1.5 h-1.5 rounded-[1px] bg-white/70" />
        <h3 className="text-[10px] tracking-[0.08em] uppercase text-[var(--color-text-secondary)]">
          Output
        </h3>
      </div>
      <div className="divide-y divide-white/[0.06]">
        <div className={ROW}>
          <label className={NAME}>name</label>
          <input
            type="text"
            value={s.name}
            aria-label="name"
            onChange={(e) => set({ name: e.target.value })}
            className="flex-1 min-w-0 h-6 bg-white/[0.06] border border-white/10 rounded-[2px] px-2 text-right text-[11px] text-[var(--color-text-secondary)] outline-none focus:border-accent"
          />
        </div>
        <div className={ROW}>
          <label className={NAME}>unit</label>
          <Select
            value={s.unit}
            onChange={(e) => {
              // Convert the current size so switching units keeps the
              // physical output identical.
              const unit = e.target.value === "px" ? "px" : "mm";
              if (unit === s.unit) return;
              const w =
                unit === "px" ? px.w : Math.round((s.width / s.dpi) * 25.4);
              const h =
                unit === "px" ? px.h : Math.round((s.height / s.dpi) * 25.4);
              set({ unit, width: w, height: h });
            }}
          >
            <option value="mm">mm</option>
            <option value="px">px</option>
          </Select>
        </div>
        <div className={ROW}>
          <label className={NAME}>width</label>
          <NumField
            label="width"
            value={s.width}
            min={s.unit === "px" ? 16 : 10}
            max={s.unit === "px" ? 16384 : 5000}
            onChange={(v) => set({ width: v })}
          />
        </div>
        <div className={ROW}>
          <label className={NAME}>height</label>
          <NumField
            label="height"
            value={s.height}
            min={s.unit === "px" ? 16 : 10}
            max={s.unit === "px" ? 16384 : 5000}
            onChange={(v) => set({ height: v })}
          />
        </div>
        <div className={ROW}>
          <label className={NAME}>density</label>
          <NumField
            label="density"
            value={s.dpi}
            min={36}
            max={1200}
            onChange={(v) => set({ dpi: v })}
          />
          <div className={READOUT}>dpi</div>
        </div>
        <div className={ROW}>
          <label className={NAME}>color</label>
          <Select
            value={s.color}
            onChange={(e) =>
              set({ color: e.target.value as typeof s.color })
            }
          >
            <option value="srgb">sRGB</option>
            <option value="rgb">RGB</option>
            <option value="cmyk">CMYK</option>
          </Select>
        </div>
        <div className={ROW}>
          <label className={NAME}>fit</label>
          <Select
            value={s.fit}
            onChange={(e) => set({ fit: e.target.value as typeof s.fit })}
          >
            <option value="fill">fill</option>
            <option value="fit">fit</option>
            <option value="place">place 100%</option>
          </Select>
        </div>
        <div className={ROW}>
          <span className={NAME}>render</span>
          <span className="flex-1 text-right text-[10px] tabular-nums text-muted">
            {px.w} × {px.h} px
          </span>
        </div>
        {onExport && (
          <div className={ROW}>
            <ExportRowButton onExport={onExport} />
          </div>
        )}
      </div>
    </div>
  );
}

function ExportRowButton({ onExport }: { onExport: () => void }) {
  const t = useT();
  return (
    <Button variant="primary" size="sm" onClick={onExport}>
      {t.export_run}
    </Button>
  );
}

/**
 * Generated param controls from the selected effect node's EffectSpec.
 * float/int → range input, enum → Select, bool → Toggle, color → color input.
 * Red compile-error state renders getCompileError text.
 */
export function ParamsPanel({
  node,
  onParamsChange,
  compileError,
  onExport,
  sourceInfo,
  textFonts,
  textFontPaths,
}: ParamsPanelProps) {
  const t = useT();
  const spec = node.effectId ? EFFECTS[node.effectId] : undefined;

  if (node.kind === "source") {
    return (
      <SourceParams
        info={sourceInfo}
      />
    );
  }

  if (node.kind === "scale") {
    return <ScaleParams node={node} onParamsChange={onParamsChange} />;
  }

  if (node.kind === "effect" && node.effectId === "gradientmap") {
    return <GradientMapParams node={node} onParamsChange={onParamsChange} />;
  }

  if (node.kind === "text") {
    return (
      <TextParams
        node={node}
        onParamsChange={onParamsChange}
        textFonts={textFonts ?? []}
        textFontPaths={textFontPaths}
      />
    );
  }

  if (node.kind === "output") {
    return <OutputParams node={node} onParamsChange={onParamsChange} onExport={onExport} />;
  }

  if (!spec) {
    return (
      <div className="h-full border border-white/10 rounded-[3px] bg-[var(--color-surface)] p-4 font-mono">
        <p className="text-xs text-muted">{t.finish_params_empty}</p>
      </div>
    );
  }

  const params = node.params ?? {};

  const handleParamChange = (name: string, value: number | string | boolean) => {
    onParamsChange({ ...params, [name]: value });
  };

  const row = ROW;
  const name = NAME;

  return (
    <div className="h-full border border-white/10 rounded-[3px] bg-[var(--color-surface)] overflow-y-auto font-mono">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/10">
        <span className="inline-block w-1.5 h-1.5 rounded-[1px] bg-accent" />
        <h3 className="text-[10px] tracking-[0.08em] uppercase text-[var(--color-text-secondary)]">
          {spec.label}
        </h3>
      </div>

      {compileError && (
        <div className="m-2 p-2 bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-[3px]">
          <p className="text-xs text-[var(--color-danger-text)]">{compileError}</p>
        </div>
      )}

      <div className="divide-y divide-white/[0.06]">
        {spec.params.map((p) => {
          const value = params[p.name] ?? p.default;

          if (p.type === "float" || p.type === "int") {
            return (
              <div key={p.name} className={row}>
                <label className={name}>{p.name}</label>
                <ScrubBar
                  p={p}
                  value={Number(value)}
                  onChange={(v) => handleParamChange(p.name, v)}
                />
                <ValueField
                  name={p.name}
                  value={Number(value)}
                  min={p.min ?? 0}
                  max={p.max ?? 1}
                  int={p.type === "int"}
                  onChange={(v) => handleParamChange(p.name, v)}
                />
              </div>
            );
          }

          if (p.type === "enum") {
            return (
              <div key={p.name} className={row}>
                <label className={name}>{p.name}</label>
                <Select
                  value={String(value)}
                  onChange={(e) => handleParamChange(p.name, e.target.value)}
                >
                  {(p.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </Select>
              </div>
            );
          }

          if (p.type === "bool") {
            return (
              <div key={p.name} className={row}>
                <label className={name}>{p.name}</label>
                <Toggle
                  checked={Boolean(value)}
                  onChange={(checked: boolean) => handleParamChange(p.name, checked)}
                  ariaLabel={p.name}
                />
              </div>
            );
          }

          if (p.type === "color") {
            return (
              <div key={p.name} className={row}>
                <label className={name}>{p.name}</label>
                <ColorPicker
                  value={String(value)}
                  onChange={(v) => handleParamChange(p.name, v)}
                  ariaLabel={`${p.name} color`}
                />
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
