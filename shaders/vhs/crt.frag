// VHSEmulator pass 2: CRT emulation
// Port of libretro crt-mattias shader by Mattias Gustavsson
// https://github.com/libretro/glsl-shaders
// Soft blurred picture with RGB misconvergence, ghosting, warm tone curve,
// rolling sine scanlines, subtle column mask, per-pixel noise/flicker
// All effects scale with the amount macro: 0 = exact passthrough.
//
// Normalized from TouchDesigner (TOX/Loris/Renderer/VHSEmulator/shaders/
// crt.frag) for Panopus: packed uCrt1/uCrt2/uGlob unpacked into the
// exposed uniforms below plus consts baked to their TD defaults
// (build_vhs_emulator.py PAGES). TD drove this pass with a separate
// Crtamount macro (default 0 = off); Panopus maps the effect's single
// wear macro onto it so one knob degrades both passes. uGlob.x (time) is
// replaced by uSeed as in pass 1. Body logic is otherwise unchanged.

uniform sampler2D uTex0; // TD: sTD2DInputs[0] (pass 1 output)
uniform vec2 uRes;       // TD: uTD2DInfos[0].res.zw (width, height)

uniform float uWear;     // TD: uGlob.y (par.Crtamount) - see header note
uniform float uNoise;    // TD: uGlob.w (par.Crtnoise) - shared noise knob
uniform float uScanline; // TD: uCrt1.z (par.Scanlines)
uniform float uVignette; // TD: uCrt2.w (par.Vignette)
uniform float uSeed;     // TD: uGlob.x (time expression) - static stand-in
// uGhost is a pass-1 (signal.frag) param; declared by the host header for
// every pass, unread here.

// TD params not exposed by effect.json, baked to their defaults:
const float SCAN_COUNT = 0.0; // TD: uCrt1.w (par.Scancount, 0 = auto 480)
const float MASK_AMT = 0.5;   // TD: uCrt2.x (par.Maskamt)
const float MASK_SCALE = 1.0; // TD: uCrt2.y (par.Maskscale)
const float INTERLACE = 0.2;  // TD: uCrt2.z (par.Interlace)

in vec2 vUv; // TD: vUV.st
out vec4 fragColor;

vec3 sample_(vec2 tc) {
    return pow(texture(uTex0, tc).rgb, vec3(2.2));
}

vec3 blur_in0(vec2 tc, float offs) {
    vec2 iResolution = uRes; // TD: uTD2DInfos[0].res.zw
    vec4 xoffs = offs * vec4(-2.0, -1.0, 1.0, 2.0) / iResolution.x;
    vec4 yoffs = offs * vec4(-2.0, -1.0, 1.0, 2.0) / iResolution.y;
    vec3 color = vec3(0.0);
    color += sample_(tc + vec2(xoffs.x, yoffs.x)) * 0.00366;
    color += sample_(tc + vec2(xoffs.y, yoffs.x)) * 0.01465;
    color += sample_(tc + vec2(0.0, yoffs.x)) * 0.02564;
    color += sample_(tc + vec2(xoffs.z, yoffs.x)) * 0.01465;
    color += sample_(tc + vec2(xoffs.w, yoffs.x)) * 0.00366;
    color += sample_(tc + vec2(xoffs.x, yoffs.y)) * 0.01465;
    color += sample_(tc + vec2(xoffs.y, yoffs.y)) * 0.05861;
    color += sample_(tc + vec2(0.0, yoffs.y)) * 0.09524;
    color += sample_(tc + vec2(xoffs.z, yoffs.y)) * 0.05861;
    color += sample_(tc + vec2(xoffs.w, yoffs.y)) * 0.01465;
    color += sample_(tc + vec2(xoffs.x, 0.0)) * 0.02564;
    color += sample_(tc + vec2(xoffs.y, 0.0)) * 0.09524;
    color += sample_(tc + vec2(0.0, 0.0)) * 0.15018;
    color += sample_(tc + vec2(xoffs.z, 0.0)) * 0.09524;
    color += sample_(tc + vec2(xoffs.w, 0.0)) * 0.02564;
    color += sample_(tc + vec2(xoffs.x, yoffs.z)) * 0.01465;
    color += sample_(tc + vec2(xoffs.y, yoffs.z)) * 0.05861;
    color += sample_(tc + vec2(0.0, yoffs.z)) * 0.09524;
    color += sample_(tc + vec2(xoffs.z, yoffs.z)) * 0.05861;
    color += sample_(tc + vec2(xoffs.w, yoffs.z)) * 0.01465;
    color += sample_(tc + vec2(xoffs.x, yoffs.w)) * 0.00366;
    color += sample_(tc + vec2(xoffs.y, yoffs.w)) * 0.01465;
    color += sample_(tc + vec2(0.0, yoffs.w)) * 0.02564;
    color += sample_(tc + vec2(xoffs.z, yoffs.w)) * 0.01465;
    color += sample_(tc + vec2(xoffs.w, yoffs.w)) * 0.00366;
    return color;
}

float rand(vec2 co) {
    float a = 12.9898;
    float b = 78.233;
    float c = 43758.5453;
    float dt = dot(co.xy, vec2(a, b));
    float sn = mod(dt, 3.14);
    return fract(sin(sn) * c);
}

void main() {
    vec2 uv = vUv;
    vec4 res = vec4(1.0 / uRes, uRes); // TD: uTD2DInfos[0].res
    float amt = clamp(uWear, 0.0, 1.0); // TD: clamp(uGlob.y, ...)

    if (amt < 0.001) {
        fragColor = texture(uTex0, uv); // TD: TDOutputSwizzle(...)
        return;
    }
    float scanAmt = uScanline;          // TD: uCrt1.z
    float scanFreq = (SCAN_COUNT > 0.5 ? SCAN_COUNT : 480.0) * 3.0;
    float maskAmt = MASK_AMT;           // TD: uCrt2.x
    float maskScale = max(MASK_SCALE, 1.0);
    float interlace = INTERLACE;        // TD: uCrt2.z
    float vig = uVignette;              // TD: uCrt2.w
    // TD: uGlob.z carried the live frame parity; derive a stable 0/1
    // from the seed instead.
    float parity = mod(floor(uSeed), 2.0);
    float time = uSeed;                 // TD: uGlob.x
    float noiseAmt = uNoise;            // TD: uGlob.w

    // Mattias pipeline
    float x = sin(0.1 * time + uv.y * 21.0) * sin(0.23 * time + uv.y * 29.0) * sin(0.3 + 0.11 * time + uv.y * 31.0) * 0.0017;
    float o = interlace * 2.0 * mod(gl_FragCoord.y + parity, 2.0) / res.z;
    x += o;

    vec3 col;
    col.r = blur_in0(vec2(uv.x + x + 0.0009, uv.y + 0.0009), 1.2).x + 0.005;
    col.g = blur_in0(vec2(uv.x + x + 0.000, uv.y - 0.0015), 1.2).y + 0.005;
    col.b = blur_in0(vec2(uv.x + x - 0.0015, uv.y + 0.000), 1.2).z + 0.005;
    col.r += 0.2 * blur_in0(vec2(uv.x + x + 0.0009, uv.y + 0.0009), 2.25).x - 0.005;
    col.g += 0.2 * blur_in0(vec2(uv.x + x + 0.000, uv.y - 0.0015), 1.75).y - 0.005;
    col.b += 0.2 * blur_in0(vec2(uv.x + x - 0.0015, uv.y + 0.000), 1.25).z - 0.005;

    float ghs = 0.05;
    col.r += ghs * (1.0 - 0.299) * blur_in0(0.75 * vec2(0.01, -0.027) + vec2(uv.x + 0.001, uv.y + 0.001), 7.0).x;
    col.g += ghs * (1.0 - 0.587) * blur_in0(0.75 * vec2(-0.022, -0.02) + vec2(uv.x + 0.000, uv.y - 0.002), 5.0).y;
    col.b += ghs * (1.0 - 0.114) * blur_in0(0.75 * vec2(-0.02, -0.0) + vec2(uv.x - 0.002, uv.y + 0.000), 3.0).z;

    col = clamp(col * 0.4 + 0.6 * col * col * 1.0, 0.0, 1.0);

    float vigPow = 16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
    vigPow = pow(vigPow, 0.3);
    col *= mix(1.0, vigPow, vig);

    col *= vec3(0.95, 1.05, 0.95);
    col = mix(col, col * col, 0.3) * 3.8;

    float scans = clamp(0.35 + 0.15 * sin(3.5 * time + uv.y * scanFreq), 0.0, 1.0);
    col *= mix(1.0, pow(scans, 0.9) * 2.2, scanAmt);

    col *= 1.0 + 0.0015 * sin(300.0 * time);

    col *= 1.0 - 0.3 * maskAmt * vec3(clamp((mod(gl_FragCoord.x / maskScale + o * res.z, 2.0) - 1.0) * 2.0, 0.0, 1.0));

    col *= vec3(1.0) - 0.5 * noiseAmt * vec3(rand(uv + 0.0001 * time), rand(uv + 0.0001 * time + 0.3), rand(uv + 0.0001 * time + 0.5));

    col = pow(col, vec3(0.45));

    // Crossfade with plain sample at same uv
    vec3 orig = texture(uTex0, uv).rgb;
    vec3 finalCol = mix(orig, col, amt);

    float alpha = texture(uTex0, uv).a;
    fragColor = vec4(finalCol, alpha); // TD: TDOutputSwizzle(...)
}
