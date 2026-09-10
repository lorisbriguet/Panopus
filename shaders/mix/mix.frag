// Mix: 4-input COMPOSITE layer stack (#395/#396/#397). Inputs stack in
// slot order (0 = bottom); each layer composites over the running
// result with the blend mode, weighted by ITS OWN alpha - unwired
// slots are transparent no-ops. Opacity lives on the LAYERS
// (transform/text carry it), not here. swapAB flips inputs 0/1.
//
// Contract (engine test): with only input 0 wired, output == input 0
// exactly, for every mode.
// No version/precision directives here - the host prepends them.

uniform sampler2D uTex0;
uniform sampler2D uTex1;
uniform sampler2D uTex2;
uniform sampler2D uTex3;
uniform int uMode;   // see options order in effect.json
uniform int uSwapAB; // 1 = swap inputs 0 and 1

in vec2 vUv;
out vec4 fragColor;

vec3 blendMode(vec3 a, vec3 b) {
    if (uMode == 1) return a * b;                                  // multiply
    if (uMode == 2) return 1.0 - (1.0 - a) * (1.0 - b);            // screen
    if (uMode == 3) {                                              // overlay
        vec3 lo = 2.0 * a * b;
        vec3 hi = 1.0 - 2.0 * (1.0 - a) * (1.0 - b);
        return mix(lo, hi, step(0.5, a));
    }
    if (uMode == 4) return a + b;                                  // add
    if (uMode == 5) return a - b;                                  // subtract
    if (uMode == 6) return abs(a - b);                             // difference
    if (uMode == 7) return min(a, b);                              // darken
    if (uMode == 8) return max(a, b);                              // lighten
    if (uMode == 9) {                                              // softlight
        return mix(a - (1.0 - 2.0 * b) * a * (1.0 - a),
                   a + (2.0 * b - 1.0) * (sqrt(a) - a),
                   step(0.5, b));
    }
    if (uMode == 10) {                                             // hardlight
        vec3 lo = 2.0 * a * b;
        vec3 hi = 1.0 - 2.0 * (1.0 - a) * (1.0 - b);
        return mix(lo, hi, step(0.5, b));
    }
    if (uMode == 11) return a + b - 2.0 * a * b;                   // exclusion
    return b;                                                      // normal
}

vec4 layer(vec4 acc, vec4 l) {
    float w = l.a;
    vec3 rgb = mix(acc.rgb, clamp(blendMode(acc.rgb, l.rgb), 0.0, 1.0), w);
    float alpha = clamp(acc.a + w * (1.0 - acc.a), 0.0, 1.0);
    return vec4(rgb, alpha);
}

void main() {
    vec4 a = texture(uTex0, vUv);
    vec4 b = texture(uTex1, vUv);
    if (uSwapAB == 1) {
        vec4 tmp = a;
        a = b;
        b = tmp;
    }
    vec4 acc = a;
    acc = layer(acc, b);
    acc = layer(acc, texture(uTex2, vUv));
    acc = layer(acc, texture(uTex3, vUv));
    fragColor = acc;
}
