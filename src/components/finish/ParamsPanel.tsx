import { Button, Select, Toggle } from "../ui";
import { EFFECTS } from "../../lib/effects";
import type { ParamSpec } from "../../lib/effects";
import { outputPx, outputSettingsFrom } from "../../lib/finishGraph";
import type { GraphNode } from "../../lib/finishGraph";
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
  /** Source operator: attached artwork + picker. */
  artworkPath?: string | null;
  artworkMissing?: boolean;
  onPickArtwork?: () => void;
  pickPending?: boolean;
}

// TD-style parameter dialog rows: flat hairlines, name | control | value.
const ROW = "flex items-center gap-3 px-3 py-2";
const NAME = "w-20 shrink-0 text-[10px] tracking-[0.08em] uppercase text-muted";
const READOUT =
  "w-10 shrink-0 text-right text-[10px] tabular-nums text-[var(--color-text-secondary)]";

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
function SourceParams({
  artworkPath,
  artworkMissing,
  onPickArtwork,
  pickPending,
}: Pick<
  ParamsPanelProps,
  "artworkPath" | "artworkMissing" | "onPickArtwork" | "pickPending"
>) {
  const t = useT();
  const name = artworkPath ? artworkPath.split("/").pop() : null;
  return (
    <div className="h-full border border-white/10 rounded-[3px] bg-black/50 backdrop-blur-[3px] overflow-y-auto font-mono">
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
            title={artworkPath ?? undefined}
          >
            {name ?? "—"}
          </span>
        </div>
        {artworkMissing && (
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
            onClick={onPickArtwork}
            loading={pickPending}
          >
            {t.project_pick_artwork}
          </Button>
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
    <div className="h-full border border-white/10 rounded-[3px] bg-black/50 backdrop-blur-[3px] overflow-y-auto font-mono">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/10">
        <span className="inline-block w-1.5 h-1.5 rounded-[1px] bg-white/70" />
        <h3 className="text-[10px] tracking-[0.08em] uppercase text-[var(--color-text-secondary)]">
          Output
        </h3>
      </div>
      <div className="divide-y divide-white/[0.06]">
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
  artworkPath,
  artworkMissing,
  onPickArtwork,
  pickPending,
}: ParamsPanelProps) {
  const t = useT();
  const spec = node.effectId ? EFFECTS[node.effectId] : undefined;

  if (node.kind === "source") {
    return (
      <SourceParams
        artworkPath={artworkPath}
        artworkMissing={artworkMissing}
        onPickArtwork={onPickArtwork}
        pickPending={pickPending}
      />
    );
  }

  if (node.kind === "output") {
    return <OutputParams node={node} onParamsChange={onParamsChange} onExport={onExport} />;
  }

  if (!spec) {
    return (
      <div className="h-full border border-white/10 rounded-[3px] bg-black/50 backdrop-blur-[3px] p-4 font-mono">
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
  const readout = READOUT;

  return (
    <div className="h-full border border-white/10 rounded-[3px] bg-black/50 backdrop-blur-[3px] overflow-y-auto font-mono">
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
                <div className={readout}>{value}</div>
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
                <input
                  type="color"
                  value={String(value)}
                  onChange={(e) => handleParamChange(p.name, e.target.value)}
                  className="flex-1 h-7 rounded-[3px] border border-white/15 bg-[var(--color-input-bg)]"
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
