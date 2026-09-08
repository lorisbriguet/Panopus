// Halftone (Finish 2 roster, print family): rotated-grid dot screens.
// gray = one black screen on white paper; cmyk = four screens at the
// classic angles (C 15, M 75, Y 0, K 45 - all relative to uAngle),
// combined subtractively like inks. Pure grid math - deterministic,
// no hashes. Portability discipline: no function out-params, no local
// arrays (less-trodden glsl-in paths). Alpha passthrough.
// No version/precision directives - the host prepends them.

uniform sampler2D uTex0;
uniform vec2 uRes;
uniform float uDots;     // cell size in px
uniform float uAngle;    // screen rotation, degrees
uniform int uChannels;   // 0 gray, 1 cmyk
uniform float uHard;     // dot edge: 0 soft .. 1 crisp

in vec2 vUv;
out vec4 fragColor;

// Portable sine: native trig differs across shader backends beyond our
// tolerance once a rotated lattice amplifies it (SwiftShader libm vs
// Metal fast-math measured ~1e-4 — half a pixel over a 731px frame).
// Odd Taylor on the folded [-pi/2, pi/2] range, max err ~4e-6, and
// bit-stable because only mul/add are involved (cf. the integer-hash
// ruling in shaders/vhs/signal.frag).
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

// Rotated-grid cell as a vec4: xy = source uv of the cell CENTER,
// zw = in-cell position (cell units, -0.5..0.5).
vec4 cellOf(vec2 px, float ang, float cell) {
    float r = radians(ang);
    float c = pcos(r);
    float s = psin(r);
    vec2 g = vec2(c * px.x - s * px.y, s * px.x + c * px.y) / cell;
    vec2 center = floor(g) + 0.5;
    vec2 local = g - center;
    vec2 world = center * cell;
    vec2 cuv = vec2(c * world.x + s * world.y, -s * world.x + c * world.y) / uRes;
    // Snap to the nearest texel center: bilinear weights at arbitrary
    // fractional uv are quantized differently per GPU (the v1 dither
    // learned this) — nearest sampling is bit-stable across engines.
    cuv = (floor(cuv * uRes) + 0.5) / uRes;
    return vec4(cuv, local);
}

float dotMask(vec2 local, float ink, float aa) {
    // sqrt: dot AREA tracks coverage; 0.76 lets solid darks close up.
    float radius = sqrt(clamp(ink, 0.0, 1.0)) * 0.76;
    return 1.0 - smoothstep(radius - aa, radius + aa, length(local));
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
            vec4 cc = cellOf(px, uAngle + screenAngle(i), cell);
            float ink = cmykChannel(clamp(texture(uTex0, cc.xy).rgb, 0.0, 1.0), i);
            float m = dotMask(cc.zw, ink, aa);
            if (i == 0)      col.r *= 1.0 - m; // cyan eats red
            else if (i == 1) col.g *= 1.0 - m; // magenta eats green
            else if (i == 2) col.b *= 1.0 - m; // yellow eats blue
            else             col   *= 1.0 - m; // black eats all
        }
        fragColor = vec4(col, alpha);
    } else {
        vec4 cc = cellOf(px, uAngle, cell);
        float luma = dot(clamp(texture(uTex0, cc.xy).rgb, 0.0, 1.0),
                         vec3(0.2126, 0.7152, 0.0722));
        float m = dotMask(cc.zw, 1.0 - luma, aa);
        fragColor = vec4(vec3(1.0 - m), alpha);
    }
}
