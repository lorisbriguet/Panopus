// Levels (#398): classic in/out points + gamma, per channel.
// Alpha passthrough. No version/precision directives - the host
// prepends them.

uniform sampler2D uTex0;
uniform float uInBlack;
uniform float uInWhite;
uniform float uGamma;
uniform float uOutBlack;
uniform float uOutWhite;

in vec2 vUv;
out vec4 fragColor;

void main() {
    vec4 src = texture(uTex0, vUv);
    float lo = min(uInBlack, uInWhite - 0.001);
    vec3 c = clamp((src.rgb - lo) / max(uInWhite - lo, 0.001), 0.0, 1.0);
    c = pow(c, vec3(1.0 / max(uGamma, 0.001)));
    c = mix(vec3(uOutBlack), vec3(uOutWhite), c);
    fragColor = vec4(clamp(c, 0.0, 1.0), src.a);
}
