// Riso (Finish 2 roster, print family): single-ink print on paper with
// a misregistered second impression and ink grain. Dark areas take ink
// (soft threshold on luma). Alpha passthrough.
// No version/precision directives - the host prepends them.

uniform sampler2D uTex0;
uniform vec2 uRes;
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uThreshold; // luma at 50% coverage
uniform float uOffset;    // misregistration of the 2nd impression, px
uniform float uGrain;     // 0..1 ink-coverage noise

in vec2 vUv;
out vec4 fragColor;

// Integer hash - bit-exact across shader compilers (provenance:
// shaders/vhs/signal.frag hash21; float fract/sin chains broke
// preview/export parity there).
float hash21(vec2 p) {
    uvec2 q = uvec2(ivec2(round(p * 8.0)) + 16384);
    uint h = q.x * 1664525u ^ q.y * 1013904223u;
    h = (h ^ (h >> 16u)) * 2246822519u;
    h = (h ^ (h >> 13u)) * 3266489917u;
    h ^= h >> 16u;
    return float(h >> 8u) * (1.0 / 16777216.0);
}

float coverage(vec2 uv, float th) {
    float luma = dot(clamp(texture(uTex0, uv).rgb, 0.0, 1.0),
                     vec3(0.2126, 0.7152, 0.0722));
    return smoothstep(th + 0.22, th - 0.22, luma);
}

void main() {
    float th = clamp(uThreshold, 0.0, 1.0);
    float cov = coverage(vUv, th);
    // Misregistered second impression at half strength.
    vec2 off = vec2(uOffset) / uRes;
    float cov2 = coverage(vUv + off, th) * 0.5;
    // Grain eats into the ink like uneven soy-ink coverage.
    float g = (hash21(vUv * uRes) - 0.5) * clamp(uGrain, 0.0, 1.0);
    float ink = clamp(cov + cov2 - max(g, 0.0) * 1.2 + min(g, 0.0) * 0.4, 0.0, 1.0);
    vec3 col = mix(uPaper, uInk * mix(vec3(1.0), uPaper, 0.25), ink);
    fragColor = vec4(col, texture(uTex0, vUv).a);
}
