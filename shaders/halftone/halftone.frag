// Halftone v3 (node review round 2, modeled on Texturelabs Retratone's
// actual pattern tiles, decoded from the plugin's PSD Patt blocks):
// ONE soft threshold over a SUM of smooth fields —
//   print = chew(smoothstep(T(g) - aa, T(g) + aa, ink), grunge)
// where T is a smooth periodic screen RAMP (their tiles are sinusoidal
// threshold maps, not hard shapes), ink is the CONTINUOUS per-pixel
// tone (cell-quantizing the tone is what makes halftones look digital),
// and G is high-frequency RETICULATED grain (their 1200px roughness
// scan is dense cellular veining — smooth value noise reads plastic).
// gray = one black screen on white paper; cmyk = four screens at the
// classic angles (C 15, M 75, Y 0, K 45 - all relative to uAngle).
// Patterns: 0 dots / 1 negdots / 2 lines / 3 crosslines / 4 waves /
// 5 crosswaves / 6 brokenlines / 7 brokenwaves / 8 dust /
// 9 scratches (dust & scratches: directional strokes + flecks, after
// the streak-veined press-plate scan in Retratone's dust pattern).
// Integer hashes (bit-exact across compilers); folded-Taylor trig.
// Portability discipline: no function out-params, no local arrays.
// Alpha passthrough.
// No version/precision directives - the host prepends them.

uniform sampler2D uTex0;
uniform sampler2D uGrungeAtlas; // 4x2 atlas of 512px scan tiles
uniform vec2 uRes;
uniform int uPattern;    // 0..8, see header
uniform float uDots;     // cell size in px
uniform float uAngle;    // screen rotation, degrees
uniform int uChannels;   // 0 gray, 1 cmyk
uniform float uHard;     // threshold edge: 0 soft .. 1 crisp
uniform float uRoughness; // pre-screen: vivid-light grain deforms dots
uniform float uGrunge;   // post-screen: dust & scratches damage
uniform float uSeed;     // 0..8: loops through the atlas tiles; the
                         // fraction pans inside a tile for variation

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
    if (uPattern == 9) {
        // dust & scratches: sparse scratch lanes running along the screen
        // angle — segmented lengths, slight wobble, intensity varying
        // along the stroke — plus isolated dust flecks. The base sits
        // just under full tone so only near-black floods around them.
        float lane = g.x * 2.0;
        float ci = floor(lane);
        float xo = 0.15 + 0.7 * hash2(vec2(ci, 11.0));
        float seg = floor(g.y * 0.12); // strokes ~8 cells long
        float on = smoothstep(0.35, 0.95, hash2(vec2(ci, seg)));
        float wob = 0.10 * (vnoise(vec2(ci * 7.3, g.y * 0.7)) - 0.5);
        float d = abs(lane - ci - xo + wob);
        float widthv = 0.02 + 0.05 * hash2(vec2(ci, seg + 101.0));
        // Depth GRADES along the stroke (squared -> mostly shallow), so
        // highlights carry only faint broken slivers and shadows pull
        // the full stroke out — tone drives the screen, like any ramp.
        float along = vnoise(vec2(ci * 3.1, g.y * 3.7));
        float depthc = on * (0.12 + 0.88 * along * along);
        float scratch = (1.0 - smoothstep(widthv, widthv * 2.6, d)) * depthc;
        vec2 fcell = floor(g * 2.7);
        vec2 flocal = g * 2.7 - fcell - 0.5;
        float fid = hash2(fcell);
        float fleck = step(0.962, fid)
                      * (1.0 - smoothstep(0.10, 0.26, length(flocal)))
                      * (0.35 + 0.65 * hash2(fcell + vec2(5.0, 9.0)));
        return clamp(0.99 - 0.95 * max(scratch, fleck), 0.03, 1.05);
    }
    return dotRamp(g); // 0: dots
}

// Roughness (Retratone's own pipeline, decoded from its layer-style
// calls): the reticulated grain composites in VIVID LIGHT over the tone
// BEFORE the Hard-Mix-style threshold — burns/dodges locally, so dot
// boundaries warp and shatter instead of staying round. Paper space,
// scaled with the cell like the plugin scales roughness with pattern.
float roughField(vec2 q) {
    return clamp(0.5 + 0.8 * (0.55 * ridge(q * 1.7) + 0.35 * ridge(q * 4.3) - 0.585)
                 + 0.24 * (vnoise(q * 9.1) - 0.5), 0.0, 1.0);
}

float vividLight(float b, float s) {
    return s < 0.5 ? 1.0 - (1.0 - b) / max(2.0 * s, 1e-3)
                   : b / max(2.0 * (1.0 - s), 1e-3);
}

// Coverage: soft threshold of (roughened) tone against the screen ramp.
float coverage(vec2 g, float ink, float aa, float R) {
    float tone = clamp(ink, 0.0, 1.0);
    if (uRoughness > 0.0) {
        tone = clamp(mix(tone, vividLight(tone, R), uRoughness * 0.7), 0.0, 1.0);
    }
    return smoothstep(screenRamp(g) - aa, screenRamp(g) + aa, tone);
}

// Grunge applied AFTER the screen: REAL scan tiles (grunge-atlas.png,
// built by scripts/build_grunge_atlas.mjs from the user's Texturelabs
// grunge library — round 4: procedural damage never matched scans).
// uSeed picks the tile (looping 0..8) and its fraction pans inside it.
// Tiles are mean-0.5 normalized; sample - 0.5 = signed damage: dark
// scan areas erase ink, bright ones deposit flecks. Unrotated space —
// the paper doesn't turn with the screen. Mirror-wrap makes the
// non-tiling scans seamless; texel-snap keeps both engines bit-equal.
float damage(vec2 q) {
    float slot = mod(floor(uSeed), 8.0);
    vec2 quad = vec2(mod(slot, 4.0), floor(slot / 4.0));
    vec2 pan = fract(uSeed) * vec2(0.37, 0.61);
    vec2 t = q * 0.045 + pan;
    vec2 m = abs(fract(t * 0.5) * 2.0 - 1.0); // mirror repeat
    vec2 uv = (quad + m * 0.98 + 0.01) * vec2(0.25, 0.5);
    vec2 atlasSize = vec2(2048.0, 1024.0);
    uv = (floor(uv * atlasSize) + 0.5) / atlasSize;
    return (texture(uGrungeAtlas, uv).r - 0.5) * 2.0;
}

float chewed(float m, float G, float aa) {
    if (uGrunge <= 0.0) return m;
    return smoothstep(0.5 - max(aa, 0.12), 0.5 + max(aa, 0.12),
                      m + uGrunge * 1.5 * G);
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

    // Shared paper-space fields: roughness grain and damage are common
    // to every ink (the paper is one surface).
    float R = uRoughness > 0.0 ? roughField(px / cell) : 0.5;
    float G = uGrunge > 0.0 ? damage(px / cell) : 0.0;

    if (uChannels == 1) {
        vec3 col = vec3(1.0);
        for (int i = 0; i < 4; i++) {
            vec2 g = gridOf(px, uAngle + screenAngle(i), cell);
            float ink = cmykChannel(clamp(src.rgb, 0.0, 1.0), i);
            float m = chewed(coverage(g, ink, aa, R), G, aa);
            if (i == 0)      col.r *= 1.0 - m;
            else if (i == 1) col.g *= 1.0 - m;
            else if (i == 2) col.b *= 1.0 - m;
            else             col   *= 1.0 - m;
        }
        fragColor = vec4(col, alpha);
    } else {
        vec2 g = gridOf(px, uAngle, cell);
        float luma = dot(clamp(src.rgb, 0.0, 1.0), vec3(0.2126, 0.7152, 0.0722));
        float m = chewed(coverage(g, 1.0 - luma, aa, R), G, aa);
        fragColor = vec4(vec3(1.0 - m), alpha);
    }
}
