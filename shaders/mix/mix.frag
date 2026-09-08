// Mix: 2-input COMPOSITE (Finish 2 D8). Input B composites OVER input A
// with a blend mode and an opacity (uAmount), weighted by B's alpha —
// so a transparent-background layer (transform/text output, or an
// UNWIRED input, which the engines bind as transparent black) sits
// correctly and an absent B is a clean passthrough of A.
//
// Contract (the Rust engine test relies on it): uAmount = 0 ->
// output == input A (uTex0) exactly, for every mode. Unwired B gives
// the same for every amount.
// No version/precision directives here - the host prepends them.
//
// Historical note: v1 was a reduced TouchDesigner MatrixMixer port
// (crossfade toward B); old graphs' stored `amount` values keep their
// meaning (0 = A, 1 = full B-over-A), old "blend" mode falls back to
// normal via the registry's unknown-enum rule.

uniform sampler2D uTex0; // input A (bottom)
uniform sampler2D uTex1; // input B (top / overlay)
uniform int uMode;       // 0 normal, 1 multiply, 2 screen, 3 overlay,
                         // 4 add, 5 difference, 6 darken, 7 lighten
uniform float uAmount;   // opacity of B over A

in vec2 vUv;
out vec4 fragColor;

void main() {
    vec4 a = texture(uTex0, vUv);
    vec4 b = texture(uTex1, vUv);
    float w = clamp(uAmount, 0.0, 1.0) * b.a;

    vec3 blended;
    if (uMode == 1) {
        blended = a.rgb * b.rgb;                              // multiply
    } else if (uMode == 2) {
        blended = 1.0 - (1.0 - a.rgb) * (1.0 - b.rgb);        // screen
    } else if (uMode == 3) {                                  // overlay
        vec3 lo = 2.0 * a.rgb * b.rgb;
        vec3 hi = 1.0 - 2.0 * (1.0 - a.rgb) * (1.0 - b.rgb);
        blended = mix(lo, hi, step(0.5, a.rgb));
    } else if (uMode == 4) {
        blended = a.rgb + b.rgb;                              // add
    } else if (uMode == 5) {
        blended = abs(a.rgb - b.rgb);                         // difference
    } else if (uMode == 6) {
        blended = min(a.rgb, b.rgb);                          // darken
    } else if (uMode == 7) {
        blended = max(a.rgb, b.rgb);                          // lighten
    } else {
        blended = b.rgb;                                      // normal (over)
    }

    vec3 rgb = mix(a.rgb, clamp(blended, 0.0, 1.0), w);
    float alpha = clamp(a.a + w * (1.0 - a.a), 0.0, 1.0);
    fragColor = vec4(rgb, alpha);
}
