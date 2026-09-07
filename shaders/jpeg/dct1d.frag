// JPEGCompressor shared pass: 1D DCT-II (forward or inverse) along x or y
// within 8-pixel blocks. Orthonormal: C(0)=sqrt(1/8), C(u>0)=sqrt(2/8).
// Needs a float render target (coefficients are signed / out of 0..1; the
// executor's FBO pool is RGBA16F).
//
// Normalized from TouchDesigner (TOX/Loris/Renderer/JPEGCompressor/
// shaders/dct1d.frag) for Panopus. TD ran this file in three GLSL TOPs
// with different uDct values (forward row, forward col, inverse row); the
// 4-pass Panopus chain runs it once as the forward VERTICAL DCT and
// final.frag applies the matching vertical inverse - a 1D reduction of
// TD's separable 2D pipeline. uDct is baked accordingly. Panopus
// extension: uBlockSize scales the DCT grid (16-px blocks run the same
// 8-tap DCT over 2-px-strided samples). Body logic otherwise unchanged.

uniform sampler2D uTex0; // TD: sTD2DInputs[0]
uniform vec2 uRes;       // TD: uTD2DInfos[0].res.zw
uniform int uBlockSize;  // enum index: 0 -> 8-px blocks, 1 -> 16-px
// uQuality is a quant-pass param; declared by the host header, unread here.

const bool HORIZ = false; // TD: uDct.x (0 = vertical axis)
const bool INV = false;   // TD: uDct.y (0 = forward)

in vec2 vUv; // TD: vUV.st
out vec4 fragColor;

const float PI = 3.14159265358979323846;
const float C0 = 0.35355339059; // sqrt(1/8)
const float CU = 0.5;           // sqrt(2/8)

void main() {
    vec2 res = uRes;      // TD: uTD2DInfos[0].res.zw
    vec2 px = 1.0 / uRes; // TD: uTD2DInfos[0].res.xy
    bool horiz = HORIZ;   // TD: uDct.x > 0.5
    bool inv = INV;       // TD: uDct.y > 0.5
    float unit = (uBlockSize == 1) ? 2.0 : 1.0; // Panopus blockSize grid scale

    float coordPx = floor((horiz ? vUv.s * res.x : vUv.t * res.y) / unit);
    float k = mod(coordPx, 8.0);          // position inside the 8-block
    float blockStart = coordPx - k;

    vec3 acc = vec3(0.0);
    for (int n = 0; n < 8; n++) {
        float other = (blockStart + float(n) + 0.5) * unit;
        vec2 uv = horiz ? vec2(other * px.x, vUv.t) : vec2(vUv.s, other * px.y);
        vec3 s = texture(uTex0, uv).rgb;
        float w;
        if (!inv) {
            // F(k) = C(k) * sum_n s[n] * cos((2n+1) k pi / 16)
            float Ck = (k < 0.5) ? C0 : CU;
            w = Ck * cos((2.0 * float(n) + 1.0) * k * PI / 16.0);
        } else {
            // f(k) = sum_n C(n) * F[n] * cos((2k+1) n pi / 16)
            float Cn = (n == 0) ? C0 : CU;
            w = Cn * cos((2.0 * k + 1.0) * float(n) * PI / 16.0);
        }
        acc += s * w;
    }

    float a = texture(uTex0, vUv).a;
    fragColor = vec4(acc, a); // TD: TDOutputSwizzle(...)
}
