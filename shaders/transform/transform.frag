// Transform (Finish 2 D9): reposition the input inside its frame —
// translate (page-fraction units, resolution-independent), scale and
// rotate around the center. Outside the source: TRANSPARENT, so a
// downstream mix composites the layer over a base. Implemented as an
// INVERSE uv transform (pure frag, zero engine involvement — parity by
// construction).
//
// Rotation happens in aspect-corrected page units so circles stay
// circles on non-square frames. +x moves the layer right, +y moves it
// UP (GL uv orientation, v = 0 at the bottom — both engines share it).
// No version/precision directives here - the host prepends them.

uniform sampler2D uTex0;
uniform vec2 uRes;
uniform float uX;      // translate, fraction of frame width
uniform float uY;      // translate, fraction of frame height (up)
uniform float uScale;  // 1 = 100%
uniform float uRotate; // degrees, counter-clockwise
uniform int uPixel;    // 1 = nearest sampling (in-shader emulation)

in vec2 vUv;
out vec4 fragColor;

void main() {
    vec2 aspect = vec2(uRes.x / max(uRes.y, 1.0), 1.0);
    // Inverse map: where in the SOURCE does this frame pixel come from?
    vec2 p = (vUv - 0.5 - vec2(uX, uY)) * aspect;
    float ang = radians(-uRotate);
    float c = cos(ang);
    float s = sin(ang);
    p = mat2(c, -s, s, c) * p;
    p = p / max(uScale, 1e-4) / aspect + 0.5;

    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) {
        fragColor = vec4(0.0);
        return;
    }
    vec2 uv = p;
    if (uPixel == 1) {
        // Nearest: snap to the source texel center.
        uv = (floor(p * uRes) + 0.5) / uRes;
    }
    fragColor = texture(uTex0, uv);
}
