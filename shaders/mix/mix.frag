// Mix: 2-input blend, reduced from TouchDesigner MatrixMixer
// (MatrixMixer/src/glsl_mix.frag). The TD original mixes 10 sources into
// TD_NUM_COLOR_BUFFERS outputs with CHOP-driven weight/mode textures;
// this port keeps its weighted-combine core as a fixed 2-input,
// single-output blend with a mode enum, per the plan's "reduced to a
// 2-input blend".
//
// Contract (the Rust engine test relies on it): uAmount = 0 ->
// output == input A (uTex0) exactly, for every mode.
// No version/precision directives here - the host prepends them.

uniform sampler2D uTex0; // TD: sTD2DInputs[0] (input A / bottom)
uniform sampler2D uTex1; // TD: sTD2DInputs[1] (input B / top)
uniform int uMode;       // TD: modes texture (input 11) - 0 blend, 1 add,
                         //     2 multiply, 3 screen
uniform float uAmount;   // TD: weights texture (input 10) - B contribution

in vec2 vUv; // TD: vUV.st
out vec4 fragColor;

void main() {
    vec4 a = texture(uTex0, vUv);
    vec4 b = texture(uTex1, vUv);
    float amt = clamp(uAmount, 0.0, 1.0);

    vec3 combined;
    if (uMode == 1) {
        combined = a.rgb + b.rgb;                        // add
    } else if (uMode == 2) {
        combined = a.rgb * b.rgb;                        // multiply
    } else if (uMode == 3) {
        combined = 1.0 - (1.0 - a.rgb) * (1.0 - b.rgb);  // screen
    } else {
        combined = b.rgb;                                // blend (crossfade)
    }

    vec3 rgb = mix(a.rgb, clamp(combined, 0.0, 1.0), amt);
    float alpha = mix(a.a, max(a.a, b.a), amt);
    fragColor = vec4(rgb, alpha);
}
