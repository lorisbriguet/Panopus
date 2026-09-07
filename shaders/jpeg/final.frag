// JPEGCompressor final pass: inverse 1D DCT along y + level unshift +
// YCbCr -> RGB. Input: quantized coefficients. Output: displayable RGB.
//
// Normalized from TouchDesigner (TOX/Loris/Renderer/JPEGCompressor/
// shaders/final.frag) for Panopus. In TD this inverted the column DCT of
// a full 2D chain; in the reduced 4-pass chain it inverts dct1d.frag's
// single vertical forward pass (same math either way). Panopus extension:
// uBlockSize scales the DCT grid to match dct1d.frag. Body logic
// otherwise unchanged.

uniform sampler2D uTex0; // TD: sTD2DInputs[0]
uniform vec2 uRes;       // TD: uTD2DInfos[0].res.zw
uniform int uBlockSize;  // enum index: 0 -> 8-px blocks, 1 -> 16-px
// uQuality is a quant-pass param; declared by the host header, unread here.

in vec2 vUv; // TD: vUV.st
out vec4 fragColor;

const float PI = 3.14159265358979323846;
const float C0 = 0.35355339059; // sqrt(1/8)
const float CU = 0.5;           // sqrt(2/8)

vec3 ycbcr2rgb(vec3 c) {
    return vec3(c.x + 1.402 * c.z,
                c.x - 0.344136 * c.y - 0.714136 * c.z,
                c.x + 1.772 * c.y);
}

void main() {
    vec2 res = uRes;      // TD: uTD2DInfos[0].res.zw
    vec2 px = 1.0 / uRes; // TD: uTD2DInfos[0].res.xy
    float unit = (uBlockSize == 1) ? 2.0 : 1.0; // Panopus blockSize grid scale

    float coordPx = floor(vUv.t * res.y / unit);
    float k = mod(coordPx, 8.0);
    float blockStart = coordPx - k;

    vec3 acc = vec3(0.0);
    for (int n = 0; n < 8; n++) {
        float other = (blockStart + float(n) + 0.5) * unit;
        vec3 s = texture(uTex0, vec2(vUv.s, other * px.y)).rgb;
        float Cn = (n == 0) ? C0 : CU;
        acc += s * Cn * cos((2.0 * k + 1.0) * float(n) * PI / 16.0);
    }

    acc.x += 0.5; // undo JPEG level shift
    vec3 rgb = clamp(ycbcr2rgb(acc), 0.0, 1.0);

    float a = texture(uTex0, vUv).a;
    fragColor = vec4(rgb, a); // TD: TDOutputSwizzle(...)
}
