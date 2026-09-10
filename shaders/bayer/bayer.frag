// Dithering (node review): ordered algos live here in the frag; the
// error-diffusion algos (floydsteinberg..atkinson, manifest cpuAlgos)
// are sequential and run on the HOST CPU in both engines — when one of
// those is selected the executors bypass this shader entirely, so the
// uAlgo values 4..9 never reach it (fallback: bayer8).
//   0 bayer2 / 1 bayer4 / 2 bayer8 - Bayer matrices
//   3 voidcluster - 64x64 void-and-cluster blue-noise threshold texture
//     (bluenoise-64.png, baked by scripts/build_bluenoise.mjs)
//   10 diffusion - interleaved gradient noise threshold (DitherLab's
//      "Diffusion": the error-diffusion LOOK, temporally stable)
// Pattern texels snap to whole pixels (portability rule).
// No version/precision directives - the host prepends them.

uniform sampler2D uTex0;
uniform sampler2D uBluenoise64;
uniform vec2 uRes;
uniform int uAlgo;    // 0..9, see header (4..9 handled on CPU)
uniform float uScale;
uniform int uLevels;
uniform vec3 uDark;
uniform vec3 uLight;

in vec2 vUv;
out vec4 fragColor;

const float BN_SIDE = 64.0;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

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

float qdither(float v, float t) {
    float L = float(uLevels);
    float s = v * (L - 1.0);
    return clamp((floor(s) + step(t, fract(s))) / (L - 1.0), 0.0, 1.0);
}

float thresholdAt(vec2 px, float texel) {
    if (uAlgo == 0) return bayer(px / texel, 2.0);
    if (uAlgo == 1) return bayer(px / texel, 4.0);
    if (uAlgo == 3) { // void-and-cluster blue noise
        vec2 cell = mod(floor(px / texel), BN_SIDE);
        // Texel centers; the texture is NEAREST-sampled by size anyway.
        return texture(uBluenoise64, (cell + 0.5) / BN_SIDE).r;
    }
    if (uAlgo == 10) { // diffusion: interleaved gradient noise (Jimenez)
        vec2 cell = floor(px / texel);
        return fract(52.9829189 * fract(0.06711056 * cell.x + 0.00583715 * cell.y));
    }
    return bayer(px / texel, 8.0); // 2 (and CPU-algo fallback): bayer8
}

void main() {
    vec2 px = vUv * uRes;
    float texel = max(1.0, floor(uScale * 0.25 + 0.5));
    vec2 cuv = (floor(px / texel) + 0.5) * texel / uRes;
    float t = thresholdAt(px, texel);
    float v = qdither(clamp(luma(texture(uTex0, cuv).rgb), 0.0, 1.0), t);
    fragColor = vec4(mix(uDark, uLight, v), texture(uTex0, vUv).a);
}
