// VHSEmulator pass 1: NTSC composite signal degradation + tape artifacts
// NTSC composite emulation inspired by libretro glsl-shaders ntsc passes
// Single-pass encode/decode: RGB -> composite signal -> YIQ reconstruction
// Luma filtered sharply, chroma decoded blurrier and offset (VHS look)
// Fused tape effects: scanline jitter, luma grain + chroma noise
//
// Normalized from TouchDesigner (TOX/Loris/Renderer/VHSEmulator/shaders/
// signal.frag) for Panopus: the packed uSig1-3 / uGlob vectors are
// unpacked into the exposed uniforms below plus consts baked to their TD
// defaults (build_vhs_emulator.py PAGES). uGlob.x (time) is replaced by
// uSeed - a static render has no clock, the seed scrubs the temporal
// artifacts instead. Body logic is otherwise unchanged. No version /
// precision directives here - the host prepends its own header.

uniform sampler2D uTex0; // TD: sTD2DInputs[0] (source)
uniform vec2 uRes;       // TD: uTD2DInfos[0].res.zw (width, height)

uniform float uWear;  // TD: uGlob.y (par.Tapewear) - tape wear macro
uniform float uNoise; // TD: uSig3.y (par.Tapenoise) - luma grain + chroma noise
uniform float uGhost; // TD: uSig2.z (par.Ghostamt) - ghosting amount
uniform float uSeed;  // TD: uGlob.x (time expression) - static seed stand-in
// uScanline / uVignette belong to pass 2 (crt.frag); the host declares
// them for every pass, unread here.

// TD params not exposed by effect.json, baked to their defaults
// (build_vhs_emulator.py PAGES):
const float LUMA_SOFT = 0.3;                 // TD: uSig1.x (par.Lumasoft)
const float CHROMA_BLEED = 0.35;             // TD: uSig1.y (par.Chromableed)
const vec2 CHROMA_SHIFT_PX = vec2(1.5, 0.0); // TD: uSig1.zw (par.Chromashiftx/y)
const float SAT_LEVEL = 1.0;                 // TD: uSig2.x (par.Satlevel)
const float SAT_DRIFT = 0.15;                // TD: uSig2.y (par.Satdrift)
const float GHOST_OFF = 0.03;                // TD: uSig2.w (par.Ghostoff)
const float JITTER = 0.15;                   // TD: uSig3.x (par.Jitter)
const float ARTIFACTS = 0.7;                 // TD: uGlob.z (par.Artifacts)

in vec2 vUv; // TD: vUV.st
out vec4 fragColor;

const float PI = 3.14159265358979323846;
const float TAU = 6.28318530717958647693;

vec3 rgb2yiq(vec3 c) {
    return vec3(dot(c, vec3(0.299, 0.587, 0.114)),
                dot(c, vec3(0.596, -0.274, -0.322)),
                dot(c, vec3(0.211, -0.523, 0.312)));
}

vec3 yiq2rgb(vec3 c) {
    return vec3(c.x + 0.956 * c.y + 0.621 * c.z,
                c.x - 0.272 * c.y - 0.647 * c.z,
                c.x - 1.106 * c.y + 1.703 * c.z);
}

float sinc(float x) {
    return (abs(x) < 1e-5) ? 1.0 : sin(PI * x) / (PI * x);
}

float blackman(float n, float Nf) {
    return 0.42 - 0.5 * cos(TAU * n / (Nf - 1.0)) + 0.08 * cos(2.0 * TAU * n / (Nf - 1.0));
}

float hash21(vec2 p) {
    // Integer hash (bit-exact across shader compilers): the float
    // fract-chain hash this replaces decorrelated between the WebGL2
    // preview and the wgpu export (fma contraction flips every bit),
    // breaking parity. Inputs quantize to 1/8 steps — every call site
    // feeds values at least ~0.1 apart, so rounding is stable.
    uvec2 q = uvec2(ivec2(round(p * 8.0)) + 16384);
    uint h = q.x * 1664525u ^ q.y * 1013904223u;
    h = (h ^ (h >> 16u)) * 2246822519u;
    h = (h ^ (h >> 13u)) * 3266489917u;
    h ^= h >> 16u;
    return float(h >> 8u) * (1.0 / 16777216.0);
}

void main() {
    vec2 uv = vUv;
    vec2 px = 1.0 / uRes; // TD: uTD2DInfos[0].res.xy (1/width, 1/height)
    vec2 res = uRes;
    float time = uSeed;   // TD: uGlob.x
    float wear = uWear;   // TD: uGlob.y

    float lumaSoft = clamp(LUMA_SOFT + wear * 0.4, 0.0, 1.0);
    float chromaBleed = clamp(CHROMA_BLEED + wear * 0.5, 0.0, 1.0);
    vec2 chromaShift = CHROMA_SHIFT_PX * px;
    float satLevel = SAT_LEVEL;
    float satDrift = clamp(SAT_DRIFT + wear * 0.3, 0.0, 1.0);
    float ghostAmt = clamp(uGhost + wear * 0.25, 0.0, 1.0);
    float ghostOff = GHOST_OFF;
    float jitter_eff = clamp(JITTER + wear * 0.4, 0.0, 1.0);
    float noise_eff = clamp(uNoise + wear * 0.5, 0.0, 1.0);
    float artifacts = clamp(ARTIFACTS + wear * 0.3, 0.0, 1.0);

    float pixelX = uv.x * res.x;
    float line = floor(uv.y * res.y);
    float frameSeed = floor(time * 60.0);
    // TD: uGlob.w carried the live frame parity; a static render derives
    // a stable 0/1 from the seed instead.
    float phase0 = PI * mod(line, 2.0) + PI * mod(floor(uSeed), 2.0);

    // Jitter: per-scanline horizontal offset on random subset of lines
    float jr = hash21(vec2(line, frameSeed));
    float jx = hash21(vec2(line * 1.7, frameSeed + 13.0)) - 0.5;
    float jmask = step(1.0 - jitter_eff * 0.35, jr);
    uv.x += jx * jmask * jitter_eff * 0.02;

    const int N = 15;
    const float Nf = 15.0;
    float centerIdx = (Nf - 1.0) / 2.0;

    float fcY = mix(0.35, 0.10, lumaSoft);
    float fcC = mix(0.10, 0.03, chromaBleed);

    float wY[15];
    float wC[15];
    float sumY = 0.0;
    float sumC = 0.0;

    for (int i = 0; i < N; i++) {
        float j = float(i) - centerIdx;
        wY[i] = sinc(2.0 * fcY * j) * blackman(float(i), Nf);
        wC[i] = sinc(2.0 * fcC * j) * blackman(float(i), Nf);
        sumY += wY[i];
        sumC += wC[i];
    }

    for (int i = 0; i < N; i++) {
        wY[i] /= sumY;
        wC[i] /= sumC;
    }

    float Y = 0.0;
    float I = 0.0;
    float Q = 0.0;
    float Icl = 0.0;
    float Qcl = 0.0;

    for (int i = 0; i < N; i++) {
        float j = float(i) - centerIdx;
        vec2 tapUV = uv + vec2(j * px.x, 0.0);

        vec3 yiqT = rgb2yiq(texture(uTex0, tapUV).rgb);
        float ph = TAU * 0.25 * (pixelX + j) + phase0;
        float sig = yiqT.x + artifacts * (yiqT.y * cos(ph) + yiqT.z * sin(ph));
        Y += sig * wY[i];

        vec3 yiqC = rgb2yiq(texture(uTex0, tapUV + chromaShift).rgb);
        float sigC = yiqC.x + artifacts * (yiqC.y * cos(ph) + yiqC.z * sin(ph));
        I += sigC * cos(ph) * wC[i];
        Q += sigC * sin(ph) * wC[i];

        Icl += yiqC.y * wC[i];
        Qcl += yiqC.z * wC[i];
    }

    I *= 2.0;
    Q *= 2.0;

    I = mix(Icl, I, artifacts);
    Q = mix(Qcl, Q, artifacts);

    float sat = satLevel * (1.0 - satDrift * 0.4 * (0.5 + 0.5 * sin(time * 0.6)));
    I *= sat;
    Q *= sat;

    Y += ghostAmt * 0.5 * rgb2yiq(texture(uTex0, uv - vec2(ghostOff, 0.0)).rgb).x;
    Y /= 1.0 + ghostAmt * 0.5;

    // Explicit dot crawl + fringing: chroma re-modulated onto luma
    vec3 yiq0 = rgb2yiq(texture(uTex0, uv).rgb);
    float phC = TAU * 0.25 * pixelX + phase0;
    Y += artifacts * 0.35 * (yiq0.y * cos(phC) + yiq0.z * sin(phC));

    vec3 rgb = yiq2rgb(vec3(Y, I, Q));
    rgb = max(rgb, vec3(0.0));

    // Noise: luma grain + chroma noise
    float grain = hash21(uv * res + vec2(frameSeed * 17.0, frameSeed * 31.0)) - 0.5;
    rgb += grain * noise_eff * 0.25;
    vec3 cnoise = vec3(
        hash21(uv * res + vec2(frameSeed, 3.0)),
        hash21(uv * res + vec2(frameSeed, 5.0)),
        hash21(uv * res + vec2(frameSeed, 7.0))) - 0.5;
    rgb += cnoise * noise_eff * 0.08;

    float alpha = texture(uTex0, uv).a;
    fragColor = vec4(rgb, alpha); // TD: TDOutputSwizzle(...)
}
