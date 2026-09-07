/**
 * WebGL2 preview executor for the Finish graph. Renders each effect node
 * as one or more fullscreen-triangle passes into a ping-pong FBO pool,
 * then blits the output node's input to the canvas.
 *
 * Pure, unit-tested helpers live at the top (uniform naming/declaration
 * generation, param -> uniform value coercion, frag source composition).
 * The GlExecutor class itself needs a real WebGL2 context: happy-dom has
 * none, so the constructor guards a null context and every method becomes
 * a no-op with the error surfaced via getCompileError(). Pixel-level
 * behavior is covered by the parity harness (Task 15), not unit tests.
 */

import { EFFECTS, FRAG_SOURCES } from "./effects";
import type { EffectSpec, ParamSpec } from "./effects";
import { executionOrder } from "./finishGraph";
import type { FinishGraph, GraphWire } from "./finishGraph";

// Effect texture assets (e.g. shaders/dither/glyph-atlas.png) resolve to
// URLs via a `?url` glob so any effect directory's PNGs are picked up
// automatically - no per-effect import needed. Keyed "<effectId>/<file>"
// to match PassSpec.textures.
const textureModules = import.meta.glob("../../shaders/*/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const TEXTURE_URLS: Record<string, string> = {};
for (const [path, url] of Object.entries(textureModules)) {
  const parts = path.split("/");
  TEXTURE_URLS[`${parts[parts.length - 2]}/${parts[parts.length - 1]}`] = url;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** `u` + PascalCase: scale -> uScale, edge_gain -> uEdgeGain. */
export function uniformName(param: string): string {
  const pascal = param
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join("");
  return "u" + pascal;
}

/** Uniform name for a pass texture asset: glyph-atlas.png -> uGlyphAtlas. */
export function textureUniformName(file: string): string {
  return uniformName(file.replace(/\.[^.]*$/, ""));
}

function glslType(p: ParamSpec): string {
  switch (p.type) {
    case "float":
      return "float";
    case "int":
    case "enum":
    case "bool":
      return "int";
    case "color":
      return "vec3";
  }
}

/** One `uniform <type> <uName>;` line per param, in manifest order. */
export function uniformDecls(spec: EffectSpec): string {
  return spec.params
    .map((p) => `uniform ${glslType(p)} ${uniformName(p.name)};\n`)
    .join("");
}

/**
 * Coerce a stored param value to its uniform scalar: enum -> option index
 * (unknown values fall back to the default's index), bool -> 0/1, numbers
 * clamped to min/max (ints rounded). Color params bind as vec3 via
 * colorVec3, not through this scalar path (returns 0).
 */
export function paramValue(spec: ParamSpec, v: unknown): number {
  if (spec.type === "enum") {
    const opts = spec.options ?? [];
    let i = typeof v === "string" ? opts.indexOf(v) : -1;
    if (i < 0 && typeof spec.default === "string") {
      i = opts.indexOf(spec.default);
    }
    return i < 0 ? 0 : i;
  }
  if (spec.type === "bool") {
    const b = typeof v === "boolean" ? v : spec.default === true;
    return b ? 1 : 0;
  }
  if (spec.type === "color") return 0;
  let n =
    typeof v === "number" && Number.isFinite(v) ? v : Number(spec.default);
  if (!Number.isFinite(n)) n = 0;
  if (spec.min !== undefined) n = Math.max(spec.min, n);
  if (spec.max !== undefined) n = Math.min(spec.max, n);
  return spec.type === "int" ? Math.round(n) : n;
}

/** "#rgb" / "#rrggbb" -> [r, g, b] in 0-1; anything else -> black. */
export function colorVec3(v: unknown): [number, number, number] {
  if (typeof v === "string") {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
    if (m) {
      const hex =
        m[1].length === 3
          ? m[1]
              .split("")
              .map((c) => c + c)
              .join("")
          : m[1];
      return [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
      ];
    }
  }
  return [0, 0, 0];
}

/** Shared fullscreen-triangle vertex shader. */
export const VERT_SRC =
  "#version 300 es\nlayout(location=0) in vec2 aPos; out vec2 vUv; " +
  "void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.,1.); }";

/** Uniform names already declared in a frag source. */
function declaredUniforms(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/\buniform\s+\w+\s+(\w+)/g)) out.add(m[1]);
  return out;
}

/**
 * Prepend the WebGL2 header (version, precision, vUv/fragColor io, input
 * samplers, uRes, param uniforms) to a pass's frag source. Declarations
 * the source already carries (the registry's normalized frags declare
 * their full contract) are skipped so nothing redeclares. Pass 0 gets
 * uTex0..uTex(inputs-1) for the node's wired inputs; later passes get
 * only uTex0 (the previous pass's output). Each pass also gets samplers
 * for its own texture assets.
 */
export function composeFrag(
  spec: EffectSpec,
  passIndex: number,
  src: string
): string {
  const have = declaredUniforms(src);
  const lines: string[] = [
    "#version 300 es",
    "precision highp float;",
    "precision highp int;",
  ];
  if (!/\bin\s+vec2\s+vUv\b/.test(src)) lines.push("in vec2 vUv;");
  if (!/\bout\s+vec4\s+fragColor\b/.test(src)) lines.push("out vec4 fragColor;");
  const inputCount = passIndex === 0 ? spec.inputs : 1;
  for (let k = 0; k < inputCount; k++) {
    if (!have.has(`uTex${k}`)) lines.push(`uniform sampler2D uTex${k};`);
  }
  for (const f of spec.passes[passIndex]?.textures ?? []) {
    const name = textureUniformName(f);
    if (!have.has(name)) lines.push(`uniform sampler2D ${name};`);
  }
  if (!have.has("uRes")) lines.push("uniform vec2 uRes;");
  for (const p of spec.params) {
    const name = uniformName(p.name);
    if (!have.has(name)) lines.push(`uniform ${glslType(p)} ${name};`);
  }
  return lines.join("\n") + "\n" + src;
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

const COPY_FRAG =
  "#version 300 es\nprecision highp float;\n" +
  "in vec2 vUv; out vec4 fragColor; uniform sampler2D uTex0;\n" +
  "void main(){ fragColor = texture(uTex0, vUv); }";

type ProgramEntry = { prog: WebGLProgram | null; error: string | null };
type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer };

export class GlExecutor {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private ctxError: string | null = null;
  private disposed = false;

  private vao: WebGLVertexArrayObject | null = null;
  private buf: WebGLBuffer | null = null;
  private black: WebGLTexture | null = null;
  private copyProg: ProgramEntry | null = null;

  /** `${effectId}/${passIndex}` -> compiled program or its error. */
  private programs = new Map<string, ProgramEntry>();
  /** nodeId -> compile/effect error from the last render (null = ok). */
  private nodeErrors = new Map<string, string | null>();
  /** source nodeId -> uploaded texture. */
  private sourceTex = new Map<string, WebGLTexture>();
  /** `${effectId}/${file}` -> effect texture asset (async-loaded). */
  private assetTex = new Map<string, WebGLTexture>();

  private pool: Target[] = [];
  private poolW = 0;
  private poolH = 0;
  private poolCursor = 0;

  /** Fired when an async effect texture finishes loading (re-render cue). */
  onAssetLoaded: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl2", { premultipliedAlpha: false });
    } catch {
      // some DOM shims throw instead of returning null; gl stays null
    }
    if (!gl) {
      // happy-dom (tests) and WebGL-less webviews land here: store the
      // error, never throw - all methods no-op on a null context.
      this.ctxError = "WebGL2 context unavailable";
      return;
    }
    this.gl = gl;
    this.buf = gl.createBuffer();
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    this.black = this.makeTex(1, 1);
    gl.bindTexture(gl.TEXTURE_2D, this.black);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255])
    );
  }

  /** Upload a source node's image (replaces any previous upload). */
  setSource(nodeId: string, image: ImageBitmap): void {
    const gl = this.gl;
    if (!gl) return;
    let tex = this.sourceTex.get(nodeId);
    if (!tex) {
      tex = this.makeTex(1, 1)!;
      this.sourceTex.set(nodeId, tex);
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // UNPACK_FLIP_Y_WEBGL is specified to have no effect on ImageBitmap
    // uploads, so route through a 2D canvas (where it does apply) to get
    // GL orientation (v=0 = bottom) - the atlas shader math and the final
    // unflipped canvas blit both rely on it.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    const scratch = document.createElement("canvas");
    scratch.width = image.width;
    scratch.height = image.height;
    const ctx = scratch.getContext("2d");
    if (ctx) {
      ctx.drawImage(image, 0, 0);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        scratch
      );
    } else {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image
      );
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  /** Compile/effect error for a node after the last render, if any. */
  getCompileError(nodeId: string): string | null {
    if (!this.gl) return this.ctxError;
    return this.nodeErrors.get(nodeId) ?? null;
  }

  render(graph: FinishGraph, width: number, height: number): void {
    const gl = this.gl;
    if (!gl || width <= 0 || height <= 0) return;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.ensurePool(width, height);
    this.poolCursor = 0;
    gl.bindVertexArray(this.vao);

    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const incoming = new Map<string, GraphWire[]>();
    for (const w of graph.wires) {
      const arr = incoming.get(w.to);
      if (arr) arr.push(w);
      else incoming.set(w.to, [w]);
    }
    const outputs = new Map<string, WebGLTexture>();
    const black = this.black!;
    const inputTex = (id: string, slot: number): WebGLTexture => {
      const w = (incoming.get(id) ?? []).find((x) => x.toIn === slot);
      return (w && outputs.get(w.from)) || black;
    };

    for (const id of executionOrder(graph)) {
      const node = byId.get(id);
      if (!node) continue;
      if (node.kind === "source") {
        outputs.set(id, this.sourceTex.get(id) ?? black);
        continue;
      }
      if (node.kind === "output") {
        this.blitToCanvas(inputTex(id, 0), width, height);
        continue;
      }
      const spec = node.effectId ? EFFECTS[node.effectId] : undefined;
      if (!spec) {
        this.nodeErrors.set(id, `unknown effect: ${node.effectId ?? "?"}`);
        outputs.set(id, inputTex(id, 0));
        continue;
      }
      let prev: WebGLTexture | null = null;
      let failed: string | null = null;
      for (let pi = 0; pi < spec.passes.length; pi++) {
        const entry = this.getProgram(spec, pi);
        if (!entry.prog) {
          failed = entry.error ?? "shader compile failed";
          break;
        }
        const target = this.acquireTarget();
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        gl.viewport(0, 0, width, height);
        gl.useProgram(entry.prog);
        let unit = 0;
        if (pi === 0) {
          // wired inputs bind uTex0..uTexK by toIn index; unwired = black
          for (let k = 0; k < spec.inputs; k++) {
            unit = this.bindTex(entry.prog, `uTex${k}`, inputTex(id, k), unit);
          }
        } else {
          // multi-pass: pass N>1 reads the previous pass as uTex0
          unit = this.bindTex(entry.prog, "uTex0", prev ?? black, unit);
        }
        for (const f of spec.passes[pi].textures ?? []) {
          unit = this.bindTex(
            entry.prog,
            textureUniformName(f),
            this.getAsset(spec.id, f),
            unit
          );
        }
        // getUniformLocation may return null for uniforms the compiler
        // stripped (e.g. dither's declared-but-unread uSeed) - skip
        // silently in that case.
        const locRes = gl.getUniformLocation(entry.prog, "uRes");
        if (locRes) gl.uniform2f(locRes, width, height);
        for (const p of spec.params) {
          const loc = gl.getUniformLocation(entry.prog, uniformName(p.name));
          if (!loc) continue;
          const v = node.params?.[p.name] ?? p.default;
          if (p.type === "color") {
            const [r, g, b] = colorVec3(v);
            gl.uniform3f(loc, r, g, b);
          } else if (p.type === "float") {
            gl.uniform1f(loc, paramValue(p, v));
          } else {
            gl.uniform1i(loc, paramValue(p, v));
          }
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        prev = target.tex;
      }
      this.nodeErrors.set(id, failed);
      outputs.set(id, failed ? inputTex(id, 0) : prev ?? black);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  dispose(): void {
    this.disposed = true;
    const gl = this.gl;
    if (!gl) return;
    for (const e of this.programs.values()) {
      if (e.prog) gl.deleteProgram(e.prog);
    }
    this.programs.clear();
    if (this.copyProg?.prog) gl.deleteProgram(this.copyProg.prog);
    this.copyProg = null;
    for (const t of this.sourceTex.values()) gl.deleteTexture(t);
    this.sourceTex.clear();
    for (const t of this.assetTex.values()) gl.deleteTexture(t);
    this.assetTex.clear();
    for (const t of this.pool) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    this.pool = [];
    if (this.black) gl.deleteTexture(this.black);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.buf) gl.deleteBuffer(this.buf);
    this.black = null;
    this.vao = null;
    this.buf = null;
    this.gl = null;
    this.ctxError = "disposed";
  }

  // -- internals ------------------------------------------------------------

  private makeTex(w: number, h: number): WebGLTexture | null {
    const gl = this.gl!;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      w,
      h,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    return tex;
  }

  private compile(fragSrc: string): ProgramEntry {
    const gl = this.gl!;
    const mk = (type: number, src: string): WebGLShader | string => {
      const sh = gl.createShader(type);
      if (!sh) return "createShader failed";
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh) ?? "unknown compile error";
        gl.deleteShader(sh);
        return log;
      }
      return sh;
    };
    const vs = mk(gl.VERTEX_SHADER, VERT_SRC);
    if (typeof vs === "string") return { prog: null, error: vs };
    const fs = mk(gl.FRAGMENT_SHADER, fragSrc);
    if (typeof fs === "string") {
      gl.deleteShader(vs);
      return { prog: null, error: fs };
    }
    const prog = gl.createProgram();
    if (!prog) return { prog: null, error: "createProgram failed" };
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog) ?? "unknown link error";
      gl.deleteProgram(prog);
      return { prog: null, error: log };
    }
    return { prog, error: null };
  }

  private getProgram(spec: EffectSpec, passIndex: number): ProgramEntry {
    const key = `${spec.id}/${passIndex}`;
    const cached = this.programs.get(key);
    if (cached) return cached;
    const src = FRAG_SOURCES[`${spec.id}/${spec.passes[passIndex].frag}`];
    const entry =
      src === undefined
        ? {
            prog: null,
            error: `missing frag source: ${spec.id}/${spec.passes[passIndex].frag}`,
          }
        : this.compile(composeFrag(spec, passIndex, src));
    this.programs.set(key, entry);
    return entry;
  }

  private getAsset(effectId: string, file: string): WebGLTexture {
    const key = `${effectId}/${file}`;
    const existing = this.assetTex.get(key);
    if (existing) return existing;
    const gl = this.gl!;
    // 1x1 black placeholder until the async load lands, then the same
    // texture object is re-uploaded in place - later renders pick it up.
    const tex = this.makeTex(1, 1)!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255])
    );
    this.assetTex.set(key, tex);
    const url = TEXTURE_URLS[key];
    if (url) {
      const img = new Image();
      img.onload = () => {
        if (this.disposed || !this.gl) return;
        const g = this.gl;
        g.bindTexture(g.TEXTURE_2D, tex);
        g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true);
        g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, img);
        g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
        this.onAssetLoaded?.();
      };
      img.src = url;
    }
    return tex;
  }

  private bindTex(
    prog: WebGLProgram,
    name: string,
    tex: WebGLTexture,
    unit: number
  ): number {
    const gl = this.gl!;
    const loc = gl.getUniformLocation(prog, name);
    if (!loc) return unit;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
    return unit + 1;
  }

  private ensurePool(w: number, h: number): void {
    if (w === this.poolW && h === this.poolH) return;
    const gl = this.gl!;
    for (const t of this.pool) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    this.pool = [];
    this.poolW = w;
    this.poolH = h;
  }

  private acquireTarget(): Target {
    if (this.poolCursor < this.pool.length) {
      return this.pool[this.poolCursor++];
    }
    const gl = this.gl!;
    const tex = this.makeTex(this.poolW, this.poolH)!;
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      tex,
      0
    );
    const target = { tex, fbo };
    this.pool.push(target);
    this.poolCursor++;
    return target;
  }

  private blitToCanvas(tex: WebGLTexture, w: number, h: number): void {
    const gl = this.gl!;
    if (!this.copyProg) this.copyProg = this.compile(COPY_FRAG);
    if (!this.copyProg.prog) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.copyProg.prog);
    this.bindTex(this.copyProg.prog, "uTex0", tex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
