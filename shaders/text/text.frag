// Text overlay (Finish 2 D3): composites a webview-rasterized text
// block (uTex1, white-on-transparent) over the input, placed like the
// transform operator - page-fraction translate, size as fraction of
// frame HEIGHT, rotation in aspect-corrected units. The raster is
// bound by the ENGINES per text node (never wired); uRasterAspect is
// written by the rasterizer alongside the cache.
// Portable trig (provenance: shaders/halftone/halftone.frag - native
// GPU sin/cos is not cross-backend stable).
// No version/precision directives - the host prepends them.

uniform sampler2D uTex0; // input (below)
uniform sampler2D uTex1; // text raster (engine-bound per node)
uniform vec2 uRes;
uniform float uX;
uniform float uY;
uniform float uSize;         // raster height / frame height
uniform float uRotate;       // degrees, counter-clockwise
uniform vec3 uFill;          // multiplies the raster rgb
uniform float uOpacity;
uniform float uRasterAspect; // raster w / h
uniform float uStretch;      // width multiplier (#414)
uniform int uAnchor;         // 0..8 = tl,t,tr,l,c,r,bl,b,br (#415)

in vec2 vUv;
out vec4 fragColor;

float psin(float x) {
    float P = 3.14159265358979;
    x = x - floor(x / (2.0 * P) + 0.5) * (2.0 * P);
    if (x > 0.5 * P) x = P - x;
    if (x < -0.5 * P) x = -P - x;
    float x2 = x * x;
    return x * (1.0 + x2 * (-1.0 / 6.0 + x2 * (1.0 / 120.0
        + x2 * (-1.0 / 5040.0 + x2 * (1.0 / 362880.0)))));
}

float pcos(float x) {
    return psin(x + 1.57079632679490);
}

void main() {
    vec4 base = texture(uTex0, vUv);
    // Frame-height units, centered on the block.
    vec2 aspect = vec2(uRes.x / max(uRes.y, 1.0), 1.0);
    vec2 p = (vUv - 0.5 - vec2(uX, uY)) * aspect;
    float r = radians(-uRotate);
    float c = pcos(r);
    float s = psin(r);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    float h = max(uSize, 1e-4);
    float w = h * max(uRasterAspect, 1e-4) * clamp(uStretch, 0.25, 4.0);
    // Anchor (#415): x/y point at the chosen block corner/edge instead
    // of the center. Rows top->bottom in SCREEN terms (+y is up in GL).
    int aRow = uAnchor / 3;
    int aCol = uAnchor - aRow * 3;
    float bx = float(aCol) * 0.5;
    float by = 1.0 - float(aRow) * 0.5;
    vec2 uv = vec2(p.x / w + bx, p.y / h + by);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        fragColor = base;
        return;
    }
    vec4 glyph = texture(uTex1, uv);
    float a = glyph.a * clamp(uOpacity, 0.0, 1.0);
    vec3 ink = clamp(glyph.rgb * uFill, 0.0, 1.0);
    fragColor = vec4(mix(base.rgb, ink, a),
                     clamp(base.a + a * (1.0 - base.a), 0.0, 1.0));
}
