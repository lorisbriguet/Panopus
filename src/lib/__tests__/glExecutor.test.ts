import { describe, test, expect } from "vitest";
import {
  uniformDecls,
  paramValue,
  composeFrag,
  uniformName,
  textureUniformName,
  GlExecutor,
} from "../glExecutor";
import { EFFECTS, FRAG_SOURCES } from "../effects";
import type { EffectSpec, ParamSpec } from "../effects";
import { emptyGraph } from "../finishGraph";

const count = (hay: string, needle: string): number =>
  hay.split(needle).length - 1;

describe("uniformName", () => {
  test("u + PascalCase of the param name", () => {
    expect(uniformName("scale")).toBe("uScale");
    expect(uniformName("algo")).toBe("uAlgo");
    expect(uniformName("edge_gain")).toBe("uEdgeGain");
    expect(uniformName("stroke-on")).toBe("uStrokeOn");
    expect(uniformName("strokeOn")).toBe("uStrokeOn");
  });

  test("texture uniform name drops the extension", () => {
    expect(textureUniformName("glyph-atlas.png")).toBe("uGlyphAtlas");
    expect(textureUniformName("lut.png")).toBe("uLut");
  });
});

describe("uniformDecls", () => {
  test("dither params in manifest order with GLSL types", () => {
    expect(uniformDecls(EFFECTS.dither)).toBe(
      "uniform int uAlgo;\n" +
        "uniform float uScale;\n" +
        "uniform int uLevels;\n" +
        "uniform float uEdge;\n" +
        "uniform float uSeed;\n"
    );
  });

  test("enum/bool map to int, color to vec3", () => {
    const spec: EffectSpec = {
      id: "x",
      label: "X",
      inputs: 1,
      passes: [{ frag: "a.frag" }],
      params: [
        { name: "mode", type: "enum", options: ["a", "b"], default: "a" },
        { name: "on", type: "bool", default: false },
        { name: "tint", type: "color", default: "#ffffff" },
        { name: "count", type: "int", min: 0, max: 9, default: 3 },
      ],
    };
    expect(uniformDecls(spec)).toBe(
      "uniform int uMode;\n" +
        "uniform int uOn;\n" +
        "uniform vec3 uTint;\n" +
        "uniform int uCount;\n"
    );
  });
});

describe("paramValue", () => {
  const enumSpec: ParamSpec = {
    name: "algo",
    type: "enum",
    options: ["bayer", "halftone", "ascii"],
    default: "bayer",
  };

  test("enum maps to the option index", () => {
    expect(paramValue(enumSpec, "bayer")).toBe(0);
    expect(paramValue(enumSpec, "halftone")).toBe(1);
    expect(paramValue(enumSpec, "ascii")).toBe(2);
  });

  test("unknown enum value falls back to the default's index", () => {
    const spec: ParamSpec = { ...enumSpec, default: "halftone" };
    expect(paramValue(spec, "nope")).toBe(1);
    expect(paramValue(spec, 42)).toBe(1);
  });

  test("bool maps to 0/1, non-bool falls back to default", () => {
    const spec: ParamSpec = { name: "on", type: "bool", default: true };
    expect(paramValue(spec, true)).toBe(1);
    expect(paramValue(spec, false)).toBe(0);
    expect(paramValue(spec, "garbage")).toBe(1);
  });

  test("float clamps to min/max", () => {
    const spec: ParamSpec = {
      name: "scale",
      type: "float",
      min: 1,
      max: 64,
      default: 8,
    };
    expect(paramValue(spec, 8)).toBe(8);
    expect(paramValue(spec, 0)).toBe(1);
    expect(paramValue(spec, 1000)).toBe(64);
    expect(paramValue(spec, 2.5)).toBe(2.5);
  });

  test("int rounds and clamps; garbage falls back to default", () => {
    const spec: ParamSpec = {
      name: "levels",
      type: "int",
      min: 2,
      max: 16,
      default: 4,
    };
    expect(paramValue(spec, 3.6)).toBe(4);
    expect(paramValue(spec, 100)).toBe(16);
    expect(paramValue(spec, "nan")).toBe(4);
    expect(paramValue(spec, Number.NaN)).toBe(4);
  });
});

describe("composeFrag", () => {
  test("dither pass 0 gets the header without duplicate declarations", () => {
    const src = FRAG_SOURCES["dither/glsl_dither.frag"];
    const out = composeFrag(EFFECTS.dither, 0, src);
    expect(out.startsWith("#version 300 es\n")).toBe(true);
    expect(out).toContain("precision highp float;");
    // the frag already declares the full contract - none may double up
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
      expect(count(out, decl), decl).toBe(1);
    }
  });

  const bare: EffectSpec = {
    id: "mix",
    label: "Mix",
    inputs: 2,
    passes: [{ frag: "a.frag" }, { frag: "b.frag", textures: ["lut.png"] }],
    params: [{ name: "amount", type: "float", min: 0, max: 1, default: 0 }],
  };

  test("bare-body pass 0 gets all wired-input samplers and param uniforms", () => {
    const out = composeFrag(bare, 0, "void main(){ fragColor = vec4(0.); }");
    expect(out).toContain("uniform sampler2D uTex0;");
    expect(out).toContain("uniform sampler2D uTex1;");
    expect(out).toContain("uniform vec2 uRes;");
    expect(out).toContain("uniform float uAmount;");
    expect(out).toContain("in vec2 vUv;");
    expect(out).toContain("out vec4 fragColor;");
  });

  test("pass > 0 gets only uTex0 (previous pass) plus its own textures", () => {
    const out = composeFrag(bare, 1, "void main(){ fragColor = vec4(0.); }");
    expect(out).toContain("uniform sampler2D uTex0;");
    expect(out).not.toContain("uniform sampler2D uTex1;");
    expect(out).toContain("uniform sampler2D uLut;");
  });
});

describe("GlExecutor without WebGL (happy-dom)", () => {
  test("constructor guards a null context - no throw, error state instead", () => {
    const ex = new GlExecutor(document.createElement("canvas"));
    expect(ex.getCompileError("anything")).toBeTypeOf("string");
    expect(() => ex.render(emptyGraph(), 64, 64)).not.toThrow();
    expect(() => ex.setSource("src", {} as ImageBitmap)).not.toThrow();
    expect(() => ex.dispose()).not.toThrow();
  });
});
