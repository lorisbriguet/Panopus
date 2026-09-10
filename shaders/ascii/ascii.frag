// ASCII (#400): the glyph half of the retired DitherLab port with the
// charset and coloring promoted to params. Atlas layout unchanged
// (69 cols x 20 rows: 4 font styles x 5 charsets, font style baked to
// jgs7 = row offset 5).
// No version/precision directives - the host prepends them.

uniform sampler2D uTex0;
uniform sampler2D uGlyphAtlas;
uniform vec2 uRes;
uniform float uScale;
uniform int uCharset;  // 0..4 -> detailed/simple/minimal/blocks/braille
uniform int uInvert;
uniform int uTinted;
uniform vec3 uDark;
uniform vec3 uLight;

in vec2 vUv;
out vec4 fragColor;

const float ATLAS_COLS = 69.0;
const float CHAR_ASPECT = 0.5;
const float ATLAS_ROWS = 20.0;
const float GLYPH_VPADS[5] = float[5](0.06, 0.06, 0.06, 0.0, 0.18);

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 prep(vec3 c) {
    if (uInvert == 1) c = 1.0 - c;
    return clamp(c, 0.0, 1.0);
}

float bayer(vec2 cell, float size) {
    ivec2 p = ivec2(mod(floor(cell), size));
    int n = int(round(log2(size)));
    int acc = 0;
    for (int i = 0; i < 4; i++) {
        if (i >= n) break;
        int xb = (p.x >> i) & 1;
        int yb = (p.y >> i) & 1;
        acc = (acc << 2) | ((xb ^ yb) << 1) | yb;
    }
    return (float(acc) + 0.5) / (size * size);
}

float glyphMask(float b, vec2 inCell) {
    float charsetRow = 5.0 + float(uCharset); // font style jgs7 baked
    float charset = float(uCharset);
    if (abs(charset - 3.0) < 0.5) {           // blocks: procedural
        float s = floor(clamp(b, 0.0, 1.0) * 4.999) / 4.0;
        return step(bayer(inCell * 8.0, 4.0), s);
    }
    float gi = min(floor(clamp(b, 0.0, 1.0) * ATLAS_COLS), ATLAS_COLS - 1.0);
    float vpad = GLYPH_VPADS[uCharset];
    float vy = vpad + inCell.y * (1.0 - 2.0 * vpad);
    vec2 auv = vec2((gi + inCell.x) / ATLAS_COLS,
                    (ATLAS_ROWS - 1.0 - charsetRow + vy) / ATLAS_ROWS);
    return step(0.5, texture(uGlyphAtlas, auv).r);
}

void main() {
    vec2 px = vUv * uRes;
    vec2 cellPx = vec2(uScale * CHAR_ASPECT, uScale);
    vec2 cuv = (floor(px / cellPx) + 0.5) * cellPx / uRes;
    vec3 c = prep(texture(uTex0, cuv).rgb);
    float b = luma(c);
    vec2 ic = fract(px / cellPx);
    float mask = glyphMask(b, ic);
    vec2 pc = ic * cellPx;
    mask *= step(1.0, pc.x) * step(1.0, pc.y);
    vec3 vivid = c / max(max(c.r, max(c.g, c.b)), 1e-4);
    vec3 glyphCol = (uTinted == 1) ? vivid : uLight;
    fragColor = vec4(mix(uDark, glyphCol, mask), texture(uTex0, vUv).a);
}
