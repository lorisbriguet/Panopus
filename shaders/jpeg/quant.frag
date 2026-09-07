// JPEGCompressor pass: quantize DCT coefficients.
// Standard JPEG Annex-K tables, libjpeg-style quality scaling.
// Coefficient index = pixel position mod block. Needs a float render
// target (the executor's FBO pool is RGBA16F).
//
// Normalized from TouchDesigner (TOX/Loris/Renderer/JPEGCompressor/
// shaders/quant.frag) for Panopus: TD's uJpeg.x quality knob (0..1,
// internally mapped *99+1 to libjpeg's 1..100) is exposed directly as
// uQuality in 1..100. Panopus extension: uBlockSize scales the
// coefficient grid to match dct1d.frag. In the reduced 1D chain only the
// vertical coefficient index varies, so v drives the table row and u is
// fixed at DC - the quantization stays column-coherent with the 1D DCT.
// Body logic otherwise unchanged.

uniform sampler2D uTex0; // TD: sTD2DInputs[0]
uniform vec2 uRes;       // TD: uTD2DInfos[0].res.zw
uniform float uQuality;  // TD: uJpeg.x (par.Quality, 0..1) - now 1..100
uniform int uBlockSize;  // enum index: 0 -> 8-px blocks, 1 -> 16-px

in vec2 vUv; // TD: vUV.st
out vec4 fragColor;

const float QY[64] = float[64](
    16.0, 11.0, 10.0, 16.0, 24.0, 40.0, 51.0, 61.0,
    12.0, 12.0, 14.0, 19.0, 26.0, 58.0, 60.0, 55.0,
    14.0, 13.0, 16.0, 24.0, 40.0, 57.0, 69.0, 56.0,
    14.0, 17.0, 22.0, 29.0, 51.0, 87.0, 80.0, 62.0,
    18.0, 22.0, 37.0, 56.0, 68.0, 109.0, 103.0, 77.0,
    24.0, 35.0, 55.0, 64.0, 81.0, 104.0, 113.0, 92.0,
    49.0, 64.0, 78.0, 87.0, 103.0, 121.0, 120.0, 101.0,
    72.0, 92.0, 95.0, 98.0, 112.0, 100.0, 103.0, 99.0);

const float QC[64] = float[64](
    17.0, 18.0, 24.0, 47.0, 99.0, 99.0, 99.0, 99.0,
    18.0, 21.0, 26.0, 66.0, 99.0, 99.0, 99.0, 99.0,
    24.0, 26.0, 56.0, 99.0, 99.0, 99.0, 99.0, 99.0,
    47.0, 66.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0,
    99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0,
    99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0,
    99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0,
    99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0);

void main() {
    vec2 res = uRes; // TD: uTD2DInfos[0].res.zw
    float unit = (uBlockSize == 1) ? 2.0 : 1.0; // Panopus blockSize grid scale
    // 1D chain: only the vertical index varies (dct1d ran along y);
    // TD's 2D chain also derived u from x here.
    int u = 0;
    int v = int(mod(floor(vUv.t * res.y / unit), 8.0));
    int idx = v * 8 + u;

    float q = clamp(uQuality, 1.0, 100.0); // TD: clamp(uJpeg.x,0,1)*99+1
    float scale = (q < 50.0) ? 50.0 / q : 2.0 - q / 50.0;
    scale = max(scale, 0.02);

    vec4 c = texture(uTex0, vUv);
    float stepY = QY[idx] * scale / 255.0;
    float stepC = QC[idx] * scale / 255.0;
    c.r = round(c.r / stepY) * stepY;
    c.g = round(c.g / stepC) * stepC;
    c.b = round(c.b / stepC) * stepC;

    fragColor = c; // TD: TDOutputSwizzle(c)
}
