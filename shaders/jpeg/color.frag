// JPEGCompressor pass 1: RGB -> YCbCr (JFIF full range) + chroma bleed (4:2:0 emulation)
// Output: (Y - 0.5, Cb, Cr, A)  -- level-shifted luma, centered chroma.
// Needs a float render target (the executor's FBO pool is RGBA16F).
//
// Normalized from TouchDesigner (TOX/Loris/Renderer/JPEGCompressor/
// shaders/color.frag) for Panopus: uJpeg unpacked - quality (uJpeg.x) is
// unused here, chroma sub (uJpeg.y) baked to its TD default. Body logic
// is otherwise unchanged.

uniform sampler2D uTex0; // TD: sTD2DInputs[0]
uniform vec2 uRes;       // TD: uTD2DInfos[0].res.zw (width, height)
// uQuality / uBlockSize are later-pass params; declared by the host
// header for every pass, unread here.

const float CHROMA_SUB = 0.5; // TD: uJpeg.y (par.Chromasub)

in vec2 vUv; // TD: vUV.st
out vec4 fragColor;

vec3 rgb2ycbcr(vec3 c) {
    return vec3(dot(c, vec3(0.299, 0.587, 0.114)),
                dot(c, vec3(-0.168736, -0.331264, 0.5)),
                dot(c, vec3(0.5, -0.418688, -0.081312)));
}

void main() {
    vec2 uv = vUv;
    vec2 px = 1.0 / uRes; // TD: uTD2DInfos[0].res.xy
    vec4 src = texture(uTex0, uv);
    vec3 ycc = rgb2ycbcr(src.rgb);

    // 3x3 box blur on chroma only, blended by Chroma Sub
    vec2 cc = vec2(0.0);
    for (int dx = -1; dx <= 1; dx++) {
        for (int dy = -1; dy <= 1; dy++) {
            cc += rgb2ycbcr(texture(uTex0,
                    uv + vec2(float(dx), float(dy)) * px).rgb).yz;
        }
    }
    cc /= 9.0;
    ycc.yz = mix(ycc.yz, cc, clamp(CHROMA_SUB, 0.0, 1.0));

    ycc.x -= 0.5; // JPEG level shift

    fragColor = vec4(ycc, src.a); // TD: TDOutputSwizzle(...)
}
