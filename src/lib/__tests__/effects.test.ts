import { describe, test, expect } from "vitest";
import { EFFECTS, FRAG_SOURCES, defaultParams } from "../effects";

describe("effect registry", () => {
  test("dither effect exists with 1 input and at least 4 params", () => {
    const dither = EFFECTS.dither;
    expect(dither).toBeDefined();
    expect(dither.id).toBe("dither");
    expect(dither.inputs).toBe(1);
    expect(dither.params.length).toBeGreaterThanOrEqual(4);
    const names = dither.params.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining(["algo", "scale", "levels", "edge"])
    );
  });

  test("every pass frag has a matching FRAG_SOURCES entry", () => {
    expect(Object.keys(EFFECTS).length).toBeGreaterThan(0);
    for (const spec of Object.values(EFFECTS)) {
      for (const pass of spec.passes) {
        const key = `${spec.id}/${pass.frag}`;
        expect(FRAG_SOURCES[key], key).toBeTypeOf("string");
        expect(FRAG_SOURCES[key].length).toBeGreaterThan(0);
      }
    }
  });

  test("defaultParams returns each param's default keyed by name", () => {
    expect(defaultParams(EFFECTS.dither)).toEqual({
      algo: "bayer",
      scale: 8,
      levels: 4,
      edge: 0,
      seed: 0,
    });
  });

  test("every enum param has options and its default is one of them", () => {
    for (const spec of Object.values(EFFECTS)) {
      for (const p of spec.params) {
        if (p.type === "enum") {
          expect(p.options, `${spec.id}/${p.name}`).toBeDefined();
          expect(p.options!.length).toBeGreaterThan(0);
          expect(p.options).toContain(p.default);
        }
      }
    }
    const algo = EFFECTS.dither.params.find((p) => p.name === "algo");
    expect(algo?.options).toEqual(["bayer", "halftone", "ascii"]);
  });

  test("registry has the four core effects", () => {
    expect(Object.keys(EFFECTS)).toEqual(
      expect.arrayContaining(["dither", "vhs", "jpeg", "mix"])
    );
    expect(Object.keys(EFFECTS).length).toBeGreaterThanOrEqual(4);
  });

  test("vhs has 2 passes with sources present", () => {
    const vhs = EFFECTS.vhs;
    expect(vhs.inputs).toBe(1);
    expect(vhs.passes.map((p) => p.frag)).toEqual([
      "signal.frag",
      "crt.frag",
    ]);
    for (const pass of vhs.passes) {
      expect(FRAG_SOURCES[`vhs/${pass.frag}`]).toBeTypeOf("string");
    }
    const names = vhs.params.map((p) => p.name);
    expect(names).toEqual([
      "wear",
      "noise",
      "ghost",
      "scanline",
      "vignette",
      "seed",
    ]);
  });

  test("jpeg has 4 passes and quality/blockSize params", () => {
    const jpeg = EFFECTS.jpeg;
    expect(jpeg.inputs).toBe(1);
    expect(jpeg.passes.map((p) => p.frag)).toEqual([
      "color.frag",
      "dct1d.frag",
      "quant.frag",
      "final.frag",
    ]);
    const blockSize = jpeg.params.find((p) => p.name === "blockSize");
    expect(blockSize?.type).toBe("enum");
    expect(blockSize?.options).toEqual(["8", "16"]);
    expect(blockSize?.default).toBe("8");
    const quality = jpeg.params.find((p) => p.name === "quality");
    expect(quality?.min).toBe(1);
    expect(quality?.max).toBe(100);
    expect(quality?.default).toBe(25);
  });

  test("mix is a 2-input single-pass blend", () => {
    const mixSpec = EFFECTS.mix;
    expect(mixSpec.inputs).toBe(2);
    expect(mixSpec.passes.length).toBe(1);
    const mode = mixSpec.params.find((p) => p.name === "mode");
    expect(mode?.options).toEqual(["blend", "add", "multiply", "screen"]);
    expect(mode?.default).toBe("blend");
    const amount = mixSpec.params.find((p) => p.name === "amount");
    expect(amount?.default).toBe(0.5);
  });

  test("every param name is uniform-name safe", () => {
    for (const spec of Object.values(EFFECTS)) {
      for (const p of spec.params) {
        expect(p.name, `${spec.id}/${p.name}`).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    }
  });

  test("no TD-specific constructs survive normalization in any frag", () => {
    for (const [key, src] of Object.entries(FRAG_SOURCES)) {
      expect(src, key).not.toMatch(/#version/);
      const code = src.replace(/\/\/[^\n]*/g, "");
      expect(code, key).not.toMatch(
        /sTD2DInputs|uTD2DInfos|TDOutputSwizzle|TD_NUM_COLOR_BUFFERS|vUV\.st/
      );
    }
  });

  test("dither frag is normalized to the host uniform contract", () => {
    const src = FRAG_SOURCES["dither/glsl_dither.frag"];
    expect(src).not.toMatch(/#version/);
    // no TouchDesigner-specific constructs may survive normalization in
    // CODE - comments keep the TD originals as required provenance, so
    // strip them before checking
    const code = src.replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/sTD2DInputs|uTD2DInfos|TDOutputSwizzle|vUV\.st/);
    for (const decl of [
      "uniform sampler2D uTex0",
      "uniform sampler2D uGlyphAtlas",
      "uniform vec2 uRes",
      "uniform int uAlgo",
      "uniform float uScale",
      "uniform int uLevels",
      "uniform float uEdge",
      "uniform float uSeed",
      "in vec2 vUv",
      "out vec4 fragColor",
    ]) {
      expect(src, decl).toContain(decl);
    }
  });
});
