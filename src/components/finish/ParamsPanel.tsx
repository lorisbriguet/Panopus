import { Input, Select, Toggle } from "../ui";
import { EFFECTS } from "../../lib/effects";
import type { GraphNode } from "../../lib/finishGraph";
import { useT } from "../../i18n/useT";

interface ParamsPanelProps {
  node: GraphNode;
  onParamsChange: (params: Record<string, number | string | boolean>) => void;
  /** Compile error from executor, if any */
  compileError?: string | null;
}

/**
 * Generated param controls from the selected effect node's EffectSpec.
 * float/int → range input, enum → Select, bool → Toggle, color → color input.
 * Red compile-error state renders getCompileError text.
 */
export function ParamsPanel({ node, onParamsChange, compileError }: ParamsPanelProps) {
  const t = useT();
  const spec = node.effectId ? EFFECTS[node.effectId] : undefined;

  if (!spec) {
    return (
      <div className="h-full border border-[var(--color-input-border)] rounded-lg bg-[var(--color-surface)] p-4">
        <p className="text-sm text-muted">{t.finish_params_empty}</p>
      </div>
    );
  }

  const params = node.params ?? {};

  const handleParamChange = (name: string, value: number | string | boolean) => {
    onParamsChange({ ...params, [name]: value });
  };

  return (
    <div className="h-full border border-[var(--color-input-border)] rounded-lg bg-[var(--color-surface)] p-4 overflow-y-auto">
      <h3 className="text-sm font-semibold mb-3">{spec.label}</h3>

      {compileError && (
        <div className="mb-3 p-2 bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-lg">
          <p className="text-sm text-[var(--color-danger-text)]">{compileError}</p>
        </div>
      )}

      <div className="space-y-3">
        {spec.params.map((p) => {
          const value = params[p.name] ?? p.default;

          if (p.type === "float" || p.type === "int") {
            return (
              <div key={p.name}>
                <label className="block text-xs text-muted mb-1">{p.name}</label>
                <Input
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={p.step ?? 1}
                  value={Number(value)}
                  onChange={(e) =>
                    handleParamChange(
                      p.name,
                      p.type === "int"
                        ? Math.round(Number(e.target.value))
                        : Number(e.target.value)
                    )
                  }
                  aria-label={p.name}
                />
                <div className="text-xs text-muted mt-0.5">{value}</div>
              </div>
            );
          }

          if (p.type === "enum") {
            return (
              <div key={p.name}>
                <label className="block text-xs text-muted mb-1">{p.name}</label>
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
              <div key={p.name} className="flex items-center gap-2">
                <Toggle
                  checked={Boolean(value)}
                  onChange={(checked: boolean) => handleParamChange(p.name, checked)}
                  ariaLabel={p.name}
                />
                <label className="text-xs text-muted">{p.name}</label>
              </div>
            );
          }

          if (p.type === "color") {
            return (
              <div key={p.name}>
                <label className="block text-xs text-muted mb-1">{p.name}</label>
                <input
                  type="color"
                  value={String(value)}
                  onChange={(e) => handleParamChange(p.name, e.target.value)}
                  className="w-full h-8 rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)]"
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
