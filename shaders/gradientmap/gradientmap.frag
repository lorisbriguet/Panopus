// Gradient map (#387): luminance through a piecewise multi-stop
// gradient (2-4 stops, positions ascending - the editor enforces
// order), mixed over the original. Defaults reproduce the original
// two-ink duotone. Alpha passthrough.
// No version/precision directives - the host prepends them.

uniform sampler2D uTex0;
uniform int uStops;
uniform vec3 uC1;
uniform float uP1;
uniform vec3 uC2;
uniform float uP2;
uniform vec3 uC3;
uniform float uP3;
uniform vec3 uC4;
uniform float uP4;
uniform float uMix;

in vec2 vUv;
out vec4 fragColor;

vec3 grad(float t) {
    vec3 g = mix(uC1, uC2, clamp((t - uP1) / max(uP2 - uP1, 1e-4), 0.0, 1.0));
    if (uStops >= 3) {
        g = mix(g, uC3, clamp((t - uP2) / max(uP3 - uP2, 1e-4), 0.0, 1.0));
    }
    if (uStops >= 4) {
        g = mix(g, uC4, clamp((t - uP3) / max(uP4 - uP3, 1e-4), 0.0, 1.0));
    }
    return g;
}

void main() {
    vec4 src = texture(uTex0, vUv);
    float lumaV = dot(src.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 mapped = grad(clamp(lumaV, 0.0, 1.0));
    fragColor = vec4(mix(src.rgb, mapped, clamp(uMix, 0.0, 1.0)), src.a);
}
