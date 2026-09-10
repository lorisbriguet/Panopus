// Dithering (node review): the ordered-dither node grown into an algo
// library. Effect id stays "bayer" for saved-graph compat; the label is
// "Dithering". Every algo is a threshold map feeding one quantizer:
//   bayer   - Bayer matrix (2/4/8/16 via the matrix param)
//   cluster - 8x8 clustered-dot screen (newspaper halftone texture)
//   lines   - 45 degree line screen (triangle-wave threshold)
//   dots    - round dot screen on a 2-texel cell
//   noise   - white noise via an integer hash (bit-exact across
//             compilers - float sin() hashes drift between GL and naga)
//   ign     - interleaved gradient noise (Jimenez), blue-noise-ish
// Pattern texels snap to whole pixels (portability rule).
// No version/precision directives - the host prepends them.

uniform sampler2D uTex0;
uniform vec2 uRes;
uniform int uAlgo;    // 0..5 -> bayer/cluster/lines/dots/noise/ign
uniform float uScale;
uniform int uLevels;
uniform int uMatrix;  // 0..3 -> 2/4/8/16 (bayer algo only)
uniform vec3 uDark;
uniform vec3 uLight;

in vec2 vUv;
out vec4 fragColor;

// Classic 8x8 clustered-dot ordering (0..63), row-major.
const float CLUSTER8[64] = float[64](
    24.0, 10.0, 12.0, 26.0, 35.0, 47.0, 49.0, 37.0,
     8.0,  0.0,  2.0, 14.0, 45.0, 59.0, 61.0, 51.0,
    22.0,  6.0,  4.0, 16.0, 43.0, 57.0, 63.0, 53.0,
    30.0, 20.0, 18.0, 28.0, 33.0, 41.0, 55.0, 39.0,
    34.0, 46.0, 48.0, 36.0, 25.0, 11.0, 13.0, 27.0,
    44.0, 58.0, 60.0, 50.0,  9.0,  1.0,  3.0, 15.0,
    42.0, 56.0, 62.0, 52.0, 23.0,  7.0,  5.0, 17.0,
    32.0, 40.0, 54.0, 38.0, 31.0, 21.0, 19.0, 29.0
);

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

float thresholdAt(vec2 px, float texel) {
    if (uAlgo == 1) { // cluster
        ivec2 p = ivec2(mod(floor(px / texel), 8.0));
        return (CLUSTER8[p.y * 8 + p.x] + 0.5) / 64.0;
    }
    if (uAlgo == 2) { // lines
        return abs(fract((px.x + px.y) / (2.0 * texel)) * 2.0 - 1.0);
    }
    if (uAlgo == 3) { // dots
        vec2 f = fract(px / (2.0 * texel)) - 0.5;
        return clamp(length(f) * 2.828427, 0.0, 1.0);
    }
    if (uAlgo == 4) { // noise (lowbias-style integer hash on the cell)
        uvec2 c = uvec2(ivec2(floor(px / texel)) + 4096);
        uint h = c.x * 1664525u + c.y * 1013904223u;
        h ^= h >> 16; h *= 2246822519u;
        h ^= h >> 13; h *= 3266489917u;
        h ^= h >> 16;
        return float(h & 0xFFFFu) / 65535.0;
    }
    if (uAlgo == 5) { // interleaved gradient noise
        vec2 c = floor(px / texel);
        return fract(52.9829189 * fract(0.06711056 * c.x + 0.00583715 * c.y));
    }
    return bayer(px / texel, matrixSize()); // 0: bayer
}

void main() {
    vec2 px = vUv * uRes;
    float texel = max(1.0, floor(uScale * 0.25 + 0.5));
    vec2 cuv = (floor(px / texel) + 0.5) * texel / uRes;
    float t = thresholdAt(px, texel);
    float v = qdither(luma(prep(texture(uTex0, cuv).rgb)), t);
    fragColor = vec4(mix(uDark, uLight, v), texture(uTex0, vUv).a);
}
