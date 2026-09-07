// DitherLab single-pass shader.
// Inputs: 0 = source, 1 = glyph atlas (69 cols x 5 rows, white glyphs
// on transparent/black).
// Algorithms: 0 = Bayer, 1 = Halftone, 2 = ASCII.
//
// Normalized from TouchDesigner (DitherLab/src/glsl_dither.frag) for
// Panopus: TD's packed uParams1-4 / uPal0-3 vectors are unpacked into
// the individual uniforms below (params exposed by effect.json) plus
// consts baked to their TD defaults for everything not exposed. Body
// logic is otherwise unchanged. No version/precision directives here -
// the host prepends a GLSL ES 3.00 (or naga glsl-in) compatible header.

uniform sampler2D uTex0;       // TD: sTD2DInputs[0] (source)
uniform sampler2D uGlyphAtlas; // TD: sTD2DInputs[1] (glyph atlas)
uniform vec2 uRes;             // TD: uTD2DInfos[0].res.zw (width, height)

uniform int uAlgo;    // TD: uParams1.x - 0 = Bayer, 1 = Halftone, 2 = ASCII
uniform float uScale; // TD: uParams1.y - pattern scale (px)
uniform int uLevels;  // TD: uParams1.z - quantization levels 2-16
uniform float uEdge;  // TD: uParams4.x (edgeThreshold); also stands in
                      // for TD's uParams3.z strokeOn: uEdge > 0 = on
uniform float uSeed;  // reserved for future stochastic modes; no TD
                      // equivalent in the source shader, not read yet

// TD params not exposed by effect.json, baked to their TD defaults
// (see DitherLab/build_ditherlab.py parameter pages):
const float CHARSET_ROW = 5.0;      // TD: uParams1.w (fontstyle jgs7 = 1) * 5
                                    //     + (charset detailed = 0)
const vec4 uParams2 = vec4(16.0, 0.0, 0.7853981634, 0.0);
                                    // TD: uParams2 - bayerSize 16,
                                    // halftoneStyle dot, angle 45deg
                                    // in radians, inputInvert off
const float INPUT_BRIGHTNESS = 1.0; // TD: uParams3.x
const float CONTRAST = 1.0;         // TD: uParams3.y
const float STROKE_SCALE = 25.0;    // TD: uParams3.w
const float EDGE_GAIN = 2.0;        // TD: uParams4.y
const float STROKE_INVERT = 0.0;    // TD: uParams4.z
const float PALETTE_SIZE = 2.0;     // TD: uParams4.w
const vec4 uPal0 = vec4(0.0, 0.0, 0.0, 0.0); // TD: uPal0 - dark rgb  | w = colorMode (0 BW)
const vec4 uPal1 = vec4(1.0, 1.0, 1.0, 1.0); // TD: uPal1 - pal[1]    | w = monochrome
const vec4 uPal2 = vec4(1.0, 1.0, 1.0, 0.0); // TD: uPal2 - pal[2]    | w = transparent
const vec4 uPal3 = vec4(1.0, 1.0, 1.0, 0.0); // TD: uPal3 - light rgb | w = input lift

in vec2 vUv;        // TD: vUV.st
out vec4 fragColor;

const float ATLAS_COLS = 69.0;
const float CHAR_ASPECT = 0.5;   // monospace cell width : height
// per-charset vertical crop, matched to the baked atlas margins
// (tools/build_atlas.py self-audit: jgs ink spans y 8-119 of 128,
// braille 25-105). Blocks (row 3) render procedurally and ignore this.
const float GLYPH_VPADS[5] = float[5](0.06, 0.06, 0.06, 0.0, 0.18);
const float ATLAS_ROWS = 20.0;   // 4 font styles x 5 charsets
                                 // (CHARSET_ROW = fontstyle*5 + charset)

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 prep(vec3 c) {
    c = (c - 0.5) * CONTRAST + 0.5;            // contrast
    c = clamp(c * INPUT_BRIGHTNESS + uPal3.w, 0.0, 1.0);  // gain + additive lift
    if (uParams2.w > 0.5) c = 1.0 - c;         // invert
    return c;
}

// ordered Bayer threshold, procedural for size 2/4/8/16
float bayer(vec2 cell, float size) {
    ivec2 p = ivec2(mod(floor(cell), size));
    int n = int(round(log2(size)));
    int acc = 0;
    for (int i = 0; i < 4; i++) {
        if (i >= n) break;
        // coordinate LSBs must land in the threshold's MSBs, or the
        // matrix degenerates into clustered square blocks
        int xb = (p.x >> i) & 1;
        int yb = (p.y >> i) & 1;
        acc = (acc << 2) | ((xb ^ yb) << 1) | yb;
    }
    return (float(acc) + 0.5) / (size * size);
}

float halftone(vec2 px, float cellPx, float style, float ang) {
    mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec2 f = fract(rot * px / cellPx) - 0.5;
    if (style < 0.5) return clamp(length(f) * 2.828, 0.0, 1.0);        // dot
    if (style < 1.5) return clamp(abs(f.y) * 2.0, 0.0, 1.0);           // line
    return clamp(min(abs(f.x), abs(f.y)) * 4.0, 0.0, 1.0);             // cross
}

// pattern threshold for the non-ASCII algorithms.
// scale semantics: Bayer texel = scale/4 px (at the default scale of 4
// that is 1:1); halftone cell = scale*4 px.
float patternT(vec2 px, float scale) {
    // snap the pattern texel to whole pixels - fractional texels render
    // as mixed 1px/2px "squares" (non-square artifacts)
    float texel = max(1.0, floor(scale * 0.25 + 0.5));
    if (float(uAlgo) < 0.5) return bayer(px / texel, uParams2.x);
    return halftone(px, scale * 4.0, uParams2.y, uParams2.z);
}

// quantize v to uLevels levels, pattern-dithering between steps
float qdither(float v, float t) {
    float L = float(uLevels);
    float s = v * (L - 1.0);
    return clamp((floor(s) + step(t, fract(s))) / (L - 1.0), 0.0, 1.0);
}

vec4 shade(vec3 q) {
    float mode = uPal0.w;
    float transp = uPal2.w;
    if (mode < 0.5) {                                   // BW: dark->light
        float v = q.r;
        return vec4(mix(uPal0.rgb, uPal3.rgb, v),
                    transp > 0.5 ? v : 1.0);
    }
    if (mode < 1.5) {                                   // RGB per channel
        return vec4(q, transp > 0.5 ? max(q.r, max(q.g, q.b)) : 1.0);
    }
    float P = PALETTE_SIZE;                             // palette
    int idx = int(clamp(round(q.r * (P - 1.0)), 0.0, P - 1.0));
    vec3 pal[4] = vec3[4](uPal0.rgb, uPal1.rgb, uPal2.rgb, uPal3.rgb);
    return vec4(pal[idx], transp > 0.5 ? q.r : 1.0);
}

// the source is sampled once per pattern texel (pixelated to the grid),
// so every dither square renders whole instead of being sliced by image
// edges; halftone samples its rotated cell center
vec2 sampleUV(vec2 px, float scale, vec2 res) {
    float a = float(uAlgo);
    if (a > 0.5 && a < 1.5) return px / res;   // halftone: continuous image
    float texel = max(1.0, floor(scale * 0.25 + 0.5));
    return (floor(px / texel) + 0.5) * texel / res;
}

// dithered/quantized value(s) at px: BW/Palette carry luma in .r
vec3 baseValue(vec2 px, float scale) {
    float t = patternT(px, scale);
    vec2 res = uRes;
    vec3 c = prep(texture(uTex0, sampleUV(px, scale, res)).rgb);
    if (uPal0.w > 0.5 && uPal0.w < 1.5)                 // RGB mode
        return vec3(qdither(c.r, t), qdither(c.g, t), qdither(c.b, t));
    return vec3(qdither(luma(c), t));
}

// glyph mask lookup: brightness b picks the atlas column, inCell is the
// 0-1 position inside the screen cell. NOTE: if charsets appear
// vertically flipped after the first build, replace CHARSET_ROW with
// (ATLAS_ROWS - 1.0 - CHARSET_ROW) - the Layout TOP row order decides.
float glyphMask(float b, vec2 inCell) {
    float charset = mod(CHARSET_ROW, 5.0);
    // blocks charset renders procedurally: font block glyphs don't
    // fill the line box, ordered shades always fill 100%
    if (abs(charset - 3.0) < 0.5) {
        float s = floor(clamp(b, 0.0, 1.0) * 4.999) / 4.0;
        return step(bayer(inCell * 8.0, 4.0), s);
    }
    float gi = min(floor(clamp(b, 0.0, 1.0) * ATLAS_COLS), ATLAS_COLS - 1.0);
    // crop the font's vertical leading so glyphs stretch to fill the
    // whole cell (tight terminal packing)
    float vpad = GLYPH_VPADS[int(charset + 0.5)];
    float vy = vpad + inCell.y * (1.0 - 2.0 * vpad);
    // Layout TOP stacks row 0 (ramp) at the TOP; GL v=0 is the bottom
    vec2 auv = vec2((gi + inCell.x) / ATLAS_COLS,
                    (ATLAS_ROWS - 1.0 - CHARSET_ROW + vy) / ATLAS_ROWS);
    // hard threshold kills the bake's anti-aliasing softness - pixel-
    // font edges stay razor sharp at any cell size
    return step(0.5, texture(uGlyphAtlas, auv).r);
}

vec4 asciiRender(vec2 px, float scale) {
    vec2 res = uRes;
    // monospace glyphs are ~1:2 - cells are half as wide as tall
    vec2 cellPx = vec2(scale * CHAR_ASPECT, scale);
    vec2 cuv = (floor(px / cellPx) + 0.5) * cellPx / res;
    vec3 c = prep(texture(uTex0, cuv).rgb);
    float b = luma(c);
    vec2 ic = fract(px / cellPx);
    float mask = glyphMask(b, ic);
    // 1px hairline between cells so full-block glyphs don't fuse
    vec2 pc = ic * cellPx;
    mask *= step(1.0, pc.x) * step(1.0, pc.y);
    // tinted mode: normalize to full value (chromaspiral look) - the
    // glyph choice already encodes brightness, color carries hue/sat
    vec3 vivid = c / max(max(c.r, max(c.g, c.b)), 1e-4);
    vec3 glyphCol = (uPal1.w > 0.5) ? uPal3.rgb : vivid;
    return vec4(mix(uPal0.rgb, glyphCol, mask),
                uPal2.w > 0.5 ? mask : 1.0);
}

// graded edge strength 0-1 (Sobel), gated by threshold, gain applied
float edgeVal(vec2 uv) {
    vec2 e = 1.0 / uRes;                    // TD: uTD2DInfos[0].res.xy (1/w, 1/h)
    float tl = luma(texture(uTex0, uv + vec2(-e.x,  e.y)).rgb);
    float tc = luma(texture(uTex0, uv + vec2( 0.0,  e.y)).rgb);
    float tr = luma(texture(uTex0, uv + vec2( e.x,  e.y)).rgb);
    float ml = luma(texture(uTex0, uv + vec2(-e.x,  0.0)).rgb);
    float mr = luma(texture(uTex0, uv + vec2( e.x,  0.0)).rgb);
    float bl = luma(texture(uTex0, uv + vec2(-e.x, -e.y)).rgb);
    float bc = luma(texture(uTex0, uv + vec2( 0.0, -e.y)).rgb);
    float br = luma(texture(uTex0, uv + vec2( e.x, -e.y)).rgb);
    float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
    float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
    float g = clamp(length(vec2(gx, gy)) * EDGE_GAIN, 0.0, 1.0);
    g *= step(uEdge, g);                                // threshold gate
    if (STROKE_INVERT > 0.5) g = 1.0 - g;               // stroke invert
    return g;
}

// the edge mask, always rendered as Bayer at its own strokeScale
// (texel-snapped and sampled per texel center - whole squares)
float strokePattern(vec2 px, vec2 uv) {
    float texel = max(1.0, floor(STROKE_SCALE * 0.25 + 0.5));
    vec2 res = uRes;
    vec2 cuv = (floor(px / texel) + 0.5) * texel / res;
    return step(bayer(px / texel, uParams2.x), edgeVal(cuv));
}

void main() {
    vec2 res = uRes;
    vec2 uv = vUv;
    vec2 px = uv * res;
    float scale = uScale;

    vec4 outc = (float(uAlgo) > 1.5) ? asciiRender(px, scale)
                                     : shade(baseValue(px, scale));

    if (uEdge > 0.0) {                      // stroke on/off (TD: uParams3.z)
        float sp = strokePattern(px, uv);
        outc.rgb = mix(outc.rgb, uPal3.rgb, sp);
        if (uPal2.w > 0.5) outc.a = max(outc.a, sp);
    }
    fragColor = outc;                       // TD: TDOutputSwizzle(outc)
}
