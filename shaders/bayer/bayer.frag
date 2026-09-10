// Bayer (#400): the ordered-dither half of the retired DitherLab port
// (shaders/dither, kept for legacy graphs) with the baked TD constants
// promoted to params: matrix size and two inks (invert + edge stroke
// retired in the node review).
// Pattern texels snap to whole pixels (portability rule).
// No version/precision directives - the host prepends them.

uniform sampler2D uTex0;
uniform vec2 uRes;
uniform float uScale;
uniform int uLevels;
uniform int uMatrix;  // 0..3 -> 2/4/8/16
uniform vec3 uDark;
uniform vec3 uLight;

in vec2 vUv;
out vec4 fragColor;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 prep(vec3 c) {
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

float matrixSize() {
    return uMatrix == 0 ? 2.0 : uMatrix == 1 ? 4.0 : uMatrix == 2 ? 8.0 : 16.0;
}

float qdither(float v, float t) {
    float L = float(uLevels);
    float s = v * (L - 1.0);
    return clamp((floor(s) + step(t, fract(s))) / (L - 1.0), 0.0, 1.0);
}

void main() {
    vec2 px = vUv * uRes;
    float texel = max(1.0, floor(uScale * 0.25 + 0.5));
    vec2 cuv = (floor(px / texel) + 0.5) * texel / uRes;
    float t = bayer(px / texel, matrixSize());
    float v = qdither(luma(prep(texture(uTex0, cuv).rgb)), t);
    fragColor = vec4(mix(uDark, uLight, v), texture(uTex0, vUv).a);
}
