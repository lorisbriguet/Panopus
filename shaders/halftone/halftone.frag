// Halftone (Finish 2 roster, print family; screen library grown in the
// node review, Texturelabs Retratone-inspired): rotated screens with a
// PATTERN family and a GRUNGE control. gray = one black screen on white
// paper; cmyk = four screens at the classic angles (C 15, M 75, Y 0,
// K 45 - all relative to uAngle), combined subtractively like inks.
// Patterns: 0 dots / 1 negdots / 2 lines / 3 crosslines / 4 waves /
// 5 crosswaves / 6 brokenlines / 7 brokenwaves / 8 dust.
// Grunge perturbs the ink with value noise ANCHORED TO SCREEN SPACE
// (Retratone's roughness-texture trick), so the grit rides the screen,
// not the pixels. Hashes are integer (bit-exact across compilers, per
// the dithering ruling); trig is the folded Taylor psin (see below).
// Defaults (dots, grunge 0) reproduce the previous shader byte-for-byte.
// Portability discipline: no function out-params, no local arrays.
// Alpha passthrough.
// No version/precision directives - the host prepends them.

uniform sampler2D uTex0;
uniform vec2 uRes;
uniform int uPattern;    // 0..8, see header
uniform float uDots;     // cell size in px
uniform float uAngle;    // screen rotation, degrees
uniform int uChannels;   // 0 gray, 1 cmyk
uniform float uHard;     // edge: 0 soft .. 1 crisp
uniform float uGrunge;   // 0 clean .. 1 heavy grit

in vec2 vUv;
out vec4 fragColor;

// Portable sine: native trig differs across shader backends beyond our
// tolerance once a rotated lattice amplifies it (SwiftShader libm vs
// Metal fast-math measured ~1e-4 — half a pixel over a 731px frame).
// Odd Taylor on the folded [-pi/2, pi/2] range, max err ~4e-6, and
// bit-stable because only mul/add are involved.
float psin(float x) {
    float P = 3.14159265358979;
    x = x - floor(x / (2.0 * P) + 0.5) * (2.0 * P); // wrap to [-pi, pi]
    if (x > 0.5 * P) x = P - x;
    if (x < -0.5 * P) x = -P - x;
    float x2 = x * x;
    return x * (1.0 + x2 * (-1.0 / 6.0 + x2 * (1.0 / 120.0
        + x2 * (-1.0 / 5040.0 + x2 * (1.0 / 362880.0)))));
}

float pcos(float x) {
    return psin(x + 1.57079632679490);
}

// Continuous rotated grid coordinate (cell units).
vec2 gridOf(vec2 px, float ang, float cell) {
    float r = radians(ang);
    float c = pcos(r);
    float s = psin(r);
    return vec2(c * px.x - s * px.y, s * px.x + c * px.y) / cell;
}

// Source uv of the cell CENTER for a grid coord, texel-snapped (bilinear
// weights at arbitrary fractional uv quantize differently per GPU).
vec2 centerUv(vec2 g, float ang, float cell) {
    float r = radians(ang);
    float c = pcos(r);
    float s = psin(r);
    vec2 world = (floor(g) + 0.5) * cell;
    vec2 cuv = vec2(c * world.x + s * world.y, -s * world.x + c * world.y) / uRes;
    return (floor(cuv * uRes) + 0.5) / uRes;
}

// Integer hash on a lattice point (lowbias-style, bit-exact).
float hash2(vec2 cellIdx) {
    uvec2 u = uvec2(ivec2(cellIdx) + 4096);
    uint h = u.x * 1664525u + u.y * 1013904223u;
    h ^= h >> 16; h *= 2246822519u;
    h ^= h >> 13; h *= 3266489917u;
    h ^= h >> 16;
    return float(h & 0xFFFFu) / 65535.0;
}

// Value noise: bilinear hash blend, smoothstep weights (mul/add only).
float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = p - i;
    f = f * f * (3.0 - 2.0 * f);
    float a = hash2(i);
    float b = hash2(i + vec2(1.0, 0.0));
    float c = hash2(i + vec2(0.0, 1.0));
    float d = hash2(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Retratone-style grit: blotches (~2 cells) + sub-cell grain perturb
// the ink BEFORE the screen mask, in screen space so it sticks to the
// pattern. Exactly ink when uGrunge == 0.
float grunged(float ink, vec2 g) {
    if (uGrunge <= 0.0) return ink;
    float blotch = 0.65 * vnoise(g * 0.53) + 0.35 * vnoise(g * 1.71);
    float grain = vnoise(g * 6.13);
    float p = (blotch - 0.5) * 0.9 + (grain - 0.5) * 0.35;
    return clamp(ink + uGrunge * p, 0.0, 1.0);
}

float dotMask(vec2 local, float ink, float aa) {
    // sqrt: dot AREA tracks coverage; 0.76 lets solid darks close up.
    float radius = sqrt(clamp(ink, 0.0, 1.0)) * 0.76;
    return 1.0 - smoothstep(radius - aa, radius + aa, length(local));
}

float lineMask(float d, float ink, float aa) {
    float hw = clamp(ink, 0.0, 1.0) * 0.5;
    return 1.0 - smoothstep(hw - aa, hw + aa, abs(d));
}

// Ink coverage of one screen cell for the selected pattern.
float screenMask(vec2 g, float ink, float aa) {
    // Parenthesized exactly like the pre-refactor cellOf: g - (floor+.5)
    // — a different float op order flips boundary pixels.
    vec2 local = g - (floor(g) + 0.5);
    if (uPattern == 1) { // negdots: paper dots grow in the light
        return 1.0 - dotMask(local, 1.0 - ink, aa);
    }
    if (uPattern == 2) { // lines
        return lineMask(local.y, ink, aa);
    }
    if (uPattern == 3) { // crosslines: union of two perpendicular screens
        float a1 = lineMask(local.y, ink * 0.75, aa);
        float b1 = lineMask(local.x, ink * 0.75, aa);
        return a1 + b1 - a1 * b1;
    }
    if (uPattern == 4) { // waves: line center wobbles along the row
        float w = local.y + 0.28 * psin(g.x * 2.399);
        return lineMask(w, ink, aa);
    }
    if (uPattern == 5) { // crosswaves
        float a1 = lineMask(local.y + 0.28 * psin(g.x * 2.399), ink * 0.75, aa);
        float b1 = lineMask(local.x + 0.28 * psin(g.y * 2.399), ink * 0.75, aa);
        return a1 + b1 - a1 * b1;
    }
    if (uPattern == 6) { // brokenlines: segments drop out along the run
        float seg = hash2(vec2(floor(g.x * 0.5), floor(g.y)));
        return lineMask(local.y, ink, aa) * step(0.3, seg);
    }
    if (uPattern == 7) { // brokenwaves
        float seg = hash2(vec2(floor(g.x * 0.5), floor(g.y)));
        float w = local.y + 0.28 * psin(g.x * 2.399);
        return lineMask(w, ink, aa) * step(0.3, seg);
    }
    if (uPattern == 8) { // dust: jittered, size-varied speckle
        float r1 = hash2(floor(g));
        float r2 = hash2(floor(g) + vec2(37.0, 17.0));
        vec2 off = (vec2(r1, r2) - 0.5) * 0.5;
        return dotMask(local - off, clamp(ink * (0.5 + r1), 0.0, 1.0), aa);
    }
    return dotMask(local, ink, aa); // 0: dots
}

float cmykChannel(vec3 rgb, int i) {
    float k = 1.0 - max(rgb.r, max(rgb.g, rgb.b));
    if (i == 3) return k;
    if (k >= 1.0) return 0.0;
    vec3 cmy = (1.0 - rgb - k) / (1.0 - k);
    return i == 0 ? cmy.x : i == 1 ? cmy.y : cmy.z;
}

float screenAngle(int i) {
    return i == 0 ? 15.0 : i == 1 ? 75.0 : i == 2 ? 0.0 : 45.0;
}

void main() {
    vec2 px = vUv * uRes;
    float cell = clamp(uDots, 2.0, 64.0);
    float aa = mix(0.28, 0.03, clamp(uHard, 0.0, 1.0));
    float alpha = texture(uTex0, vUv).a;

    if (uChannels == 1) {
        // CMYK: four screens, each sampled at ITS OWN cell center.
        vec3 col = vec3(1.0);
        for (int i = 0; i < 4; i++) {
            float ang = uAngle + screenAngle(i);
            vec2 g = gridOf(px, ang, cell);
            float ink = cmykChannel(
                clamp(texture(uTex0, centerUv(g, ang, cell)).rgb, 0.0, 1.0), i);
            float m = screenMask(g, grunged(ink, g), aa);
            if (i == 0)      col.r *= 1.0 - m; // cyan eats red
            else if (i == 1) col.g *= 1.0 - m; // magenta eats green
            else if (i == 2) col.b *= 1.0 - m; // yellow eats blue
            else             col   *= 1.0 - m; // black eats all
        }
        fragColor = vec4(col, alpha);
    } else {
        vec2 g = gridOf(px, uAngle, cell);
        float luma = dot(clamp(texture(uTex0, centerUv(g, uAngle, cell)).rgb, 0.0, 1.0),
                         vec3(0.2126, 0.7152, 0.0722));
        float m = screenMask(g, grunged(1.0 - luma, g), aa);
        fragColor = vec4(vec3(1.0 - m), alpha);
    }
}
