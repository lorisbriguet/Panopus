// Gradient map / duotone (Finish 2 roster, grading family): luminance
// drives a lerp between two inks, mixed over the original. Alpha
// passthrough. No version/precision directives - the host prepends them.

uniform sampler2D uTex0;
uniform vec3 uDark;   // ink at luma 0
uniform vec3 uLight;  // ink at luma 1
uniform float uMix;   // 0 = original, 1 = fully mapped

in vec2 vUv;
out vec4 fragColor;

void main() {
    vec4 src = texture(uTex0, vUv);
    float luma = dot(src.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 mapped = mix(uDark, uLight, clamp(luma, 0.0, 1.0));
    fragColor = vec4(mix(src.rgb, mapped, clamp(uMix, 0.0, 1.0)), src.a);
}
