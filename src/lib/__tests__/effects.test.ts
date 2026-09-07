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
