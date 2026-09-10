// Effect manifest registry. Each effect lives in shaders/<id>/ at the
// repo root (inside the vite root, so import.meta.glob reaches it from
// here via ../../): an effect.json manifest, one or more *.frag passes
// normalized to the host uniform contract, and optional texture assets.
//
// Multi-pass rule: the NODE's wired inputs bind to pass 1's
// uTex0..uTexK; every later pass N reads pass N-1's output as its uTex0.
// All passes of an effect receive the effect's full param uniform set.

export type ParamSpec = {
  name: string;
  type: "float" | "int" | "enum" | "bool" | "color";
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  default: number | string | boolean;
};

export type PassSpec = { frag: string; textures?: string[] };

export type EffectSpec = {
  id: string;
  label: string;
  inputs: number;
  passes: PassSpec[];
  params: ParamSpec[];
  /** Algo enum values the host must run on the CPU (error diffusion is
   *  sequential — no fragment-shader formulation). When params.algo is
   *  one of these, both engines bypass the frag for the CPU dither. */
  cpuAlgos?: string[];
};

// JSON modules arrive as namespace objects carrying the parsed value on
// `default` (vite's json plugin); tolerate a bare object too.
const manifestModules = import.meta.glob("../../shaders/*/effect.json", {
  eager: true,
}) as Record<string, EffectSpec | { default: EffectSpec }>;

const fragModules = import.meta.glob("../../shaders/*/*.frag", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

export const EFFECTS: Record<string, EffectSpec> = {};
for (const mod of Object.values(manifestModules)) {
  const spec = "default" in mod ? mod.default : mod;
  EFFECTS[spec.id] = spec;
}

// "<effectId>/<frag>" -> raw GLSL source, keyed to match PassSpec.frag
// under the effect's directory name.
export const FRAG_SOURCES: Record<string, string> = {};
for (const [path, src] of Object.entries(fragModules)) {
  const parts = path.split("/");
  const key = `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  FRAG_SOURCES[key] = src;
}

export function defaultParams(
  spec: EffectSpec
): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  for (const p of spec.params) out[p.name] = p.default;
  return out;
}
