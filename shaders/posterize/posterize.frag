// Posterize (Finish 2 roster, grading family): per-channel quantization
// to N levels, applied in gamma space so the steps distribute where the
// eye lives. Alpha passthrough. No version/precision directives - the
// host prepends them.

uniform sampler2D uTex0;
uniform int uLevels;  // 2..16
uniform float uGamma; // step-distribution curve

in vec2 vUv;
out vec4 fragColor;

void main() {
    vec4 src = texture(uTex0, vUv);
    float n = float(max(uLevels, 2)) - 1.0;
    float g = max(uGamma, 0.001);
    vec3 c = pow(clamp(src.rgb, 0.0, 1.0), vec3(g));
    c = floor(c * n + 0.5) / n;
    c = pow(c, vec3(1.0 / g));
    fragColor = vec4(c, src.a);
}
