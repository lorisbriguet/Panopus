// Halftone v3 (node review round 2, modeled on Texturelabs Retratone's
// actual pattern tiles, decoded from the plugin's PSD Patt blocks):
// ONE soft threshold over a SUM of smooth fields —
//   coverage = smoothstep(T(g) - aa, T(g) + aa, ink + grunge*G(g))
// where T is a smooth periodic screen RAMP (their tiles are sinusoidal
// threshold maps, not hard shapes), ink is the CONTINUOUS per-pixel
// tone (cell-quantizing the tone is what makes halftones look digital),
// and G is high-frequency RETICULATED grain (their 1200px roughness
// scan is dense cellular veining — smooth value noise reads plastic).
// gray = one black screen on white paper; cmyk = four screens at the
// classic angles (C 15, M 75, Y 0, K 45 - all relative to uAngle).
// Patterns: 0 dots / 1 negdots / 2 lines / 3 crosslines / 4 waves /
// 5 crosswaves / 6 brokenlines / 7 brokenwaves / 8 dust.
// Integer hashes (bit-exact across compilers); folded-Taylor trig.
// Portability discipline: no function out-params, no local arrays.
// Alpha passthrough.
// No version/precision directives - the host prepends them.

uniform sampler2D uTex0;
uniform vec2 uRes;
uniform int uPattern;    // 0..8, see header
uniform float uDots;     // cell size in px
uniform float uAngle;    // screen rotation, degrees
uniform int uChannels;   // 0 gray, 1 cmyk
uniform float uHard;     // threshold edge: 0 soft .. 1 crisp
uniform float uGrunge;   // 0 clean .. 1 heavy grit

in vec2 vUv;
out vec4 fragColor;

float PI2 = 6.28318530717959;

float psin(float x) {
    float P = 3.14159265358979;
    x = x - floor(x / (2.0 * P) + 0.5) * (2.0 * P);
    if (x > 0.5 * P) x = P - x;
    if (x < -0.5 * P) x = -P - x;
    float x2 = x * x;
    return x * (1.0 + x2 * (-1.0 / 6.0 + x2 * (1.0 / 120.0
        + x2 * (-1.0 / 5040.0 + x2 * (1.0 / 362880.0)))));
}

float pcos(float x) {
    return psin(x + 1.57079632679490);
}

vec2 gridOf(vec2 px, float ang, float cell) {
    float r = radians(ang);
    float c = pcos(r);
    float s = psin(r);
    return vec2(c * px.x - s * px.y, s * px.x + c * px.y) / cell;
}

float hash2(vec2 cellIdx) {
    uvec2 u = uvec2(ivec2(cellIdx) + 4096);
    uint h = u.x * 1664525u + u.y * 1013904223u;
    h ^= h >> 16; h *= 2246822519u;
    h ^= h >> 13; h *= 3266489917u;
    h ^= h >> 16;
    return float(h & 0xFFFFu) / 65535.0;
}

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

// Reticulated (ridged) octave: veins where noise crosses its midline —
// the cellular character of the Retratone roughness scan.
float ridge(vec2 p) {
    return 1.0 - abs(2.0 * vnoise(p) - 1.0);
}

// Grit field, centered on 0. Two ridged octaves at sub-cell frequency
// (vein structure + micro grain) and sparse bright specks (their dust
// and roughness scans both carry isolated flecks).
float grit(vec2 g) {
    float veins = 0.55 * ridge(g * 3.7) + 0.30 * ridge(g * 8.9);
    float spark = hash2(floor(g * 6.1));
    float speck = step(0.975, spark) * 0.8 - step(0.985, 1.0 - spark) * 0.5;
    return veins - 0.47 + 0.15 * speck;
}

// Smooth periodic threshold ramps ~[0,1], modeled on the decoded tiles.
float dotRamp(vec2 g) {
    // Separable cosine spot: their "evendots" tile exactly.
    return 0.5 - 0.5 * (pcos(PI2 * g.x) * pcos(PI2 * g.y));
}

float lineRamp(float y) {
    return 0.5 - 0.5 * pcos(PI2 * y);
}

// Soft dash interruption along a line (their broken tiles bake dashes
// into the ramp, phase-shifted per row so runs don't align).
float dashes(vec2 g) {
    float phase = hash2(vec2(0.0, floor(g.y)));
    return 0.42 * (0.5 + 0.5 * pcos(PI2 * (g.x * 0.31 + phase)));
}

float screenRamp(vec2 g) {
    if (uPattern == 1) return 1.0 - dotRamp(g);
    if (uPattern == 2) return lineRamp(g.y);
    if (uPattern == 3) return min(lineRamp(g.y), lineRamp(g.x));
    if (uPattern == 4) return lineRamp(g.y + 0.30 * psin(PI2 * g.x * 0.23));
    if (uPattern == 5) {
        float a = lineRamp(g.y + 0.30 * psin(PI2 * g.x * 0.23));
        float b = lineRamp(g.x + 0.30 * psin(PI2 * g.y * 0.23));
        return min(a, b);
    }
    if (uPattern == 6) return lineRamp(g.y) + dashes(g);
    if (uPattern == 7) return lineRamp(g.y + 0.30 * psin(PI2 * g.x * 0.23)) + dashes(g);
    if (uPattern == 8) {
        // dust: the grit field IS the screen — streaky reticulation with
        // sparse low pockets, so flecks surface before tone fills in.
        return clamp(0.62 + 0.85 * (0.6 * ridge(g * 1.9) + 0.4 * ridge(g * 5.3) - 0.62)
                     - 0.35 * step(0.965, hash2(floor(g * 3.1))), 0.02, 1.2);
    }
    return dotRamp(g); // 0: dots
}

// Coverage: soft threshold of tone + grit against the screen ramp.
float coverage(vec2 g, float ink, float aa) {
    float tone = clamp(ink, 0.0, 1.0);
    if (uGrunge > 0.0) tone = tone + uGrunge * 0.55 * grit(g);
    return smoothstep(screenRamp(g) - aa, screenRamp(g) + aa, tone);
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
    // Threshold softness in tone units; soft ends stay slightly crisp so
    // midtones don't wash to flat gray.
    float aa = mix(0.30, 0.045, clamp(uHard, 0.0, 1.0));
    // Continuous tone at the PIXEL (texel-snapped for cross-GPU
    // stability) — dots deform along image contours like a real screen.
    vec2 suv = (floor(px) + 0.5) / uRes;
    vec4 src = texture(uTex0, suv);
    float alpha = texture(uTex0, vUv).a;

    if (uChannels == 1) {
        vec3 col = vec3(1.0);
        for (int i = 0; i < 4; i++) {
            vec2 g = gridOf(px, uAngle + screenAngle(i), cell);
            float ink = cmykChannel(clamp(src.rgb, 0.0, 1.0), i);
            float m = coverage(g, ink, aa);
            if (i == 0)      col.r *= 1.0 - m;
            else if (i == 1) col.g *= 1.0 - m;
            else if (i == 2) col.b *= 1.0 - m;
            else             col   *= 1.0 - m;
        }
        fragColor = vec4(col, alpha);
    } else {
        vec2 g = gridOf(px, uAngle, cell);
        float luma = dot(clamp(src.rgb, 0.0, 1.0), vec3(0.2126, 0.7152, 0.0722));
        float m = coverage(g, 1.0 - luma, aa);
        fragColor = vec4(vec3(1.0 - m), alpha);
    }
}
