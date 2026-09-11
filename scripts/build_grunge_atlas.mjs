// Builds shaders/halftone/grunge-atlas.png — a 4x2 atlas of 512px
// grayscale grunge tiles from the user's Texturelabs scan library
// (node review, grunge round 4: real scans finally, cycled by the
// halftone node's `seed` fader).
//
// Usage: node scripts/build_grunge_atlas.mjs
// Sources below; each is resized via sips, grayscaled, and normalized
// to mean 0.5 with stretched contrast so the shader's centered-damage
// math ( sample - 0.5 ) behaves identically across tiles.
import { execFileSync } from "node:child_process";
import { deflateSync, inflateSync } from "node:zlib";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LIB =
  "/Users/loris.briguet/Library/CloudStorage/SynologyDrive-02_SD/02_Ressources/Textures/Photo/Grunge";
// Slot order = seed order (0..7). Two crackle, two halftone-grunge,
// drips, heavy, light, medium.
const SOURCES = [
  "Crackle/Texturelabs_Grunge_137L.jpg",
  "Light/Texturelabs_Grunge_124L.jpg",
  "Halftone/Texturelabs_Grunge_219L.png",
  "Halftone/Texturelabs_Grunge_220L.jpg",
  "Drips/Texturelabs_Grunge_178L.jpg",
  "Heavy/Texturelabs_Grunge_126L.jpg",
  "Light/Texturelabs_Grunge_121L.jpg",
  "Medium/Texturelabs_Grunge_128L.jpg",
];
const T = 2048;

function readPngGray(path) {
  const d = readFileSync(path);
  let pos = 8, w, h, bd, ct, idat = [];
  while (pos < d.length) {
    const ln = d.readUInt32BE(pos);
    const typ = d.subarray(pos + 4, pos + 8).toString();
    if (typ === "IHDR") { w = d.readUInt32BE(pos + 8); h = d.readUInt32BE(pos + 12); bd = d[pos + 16]; ct = d[pos + 17]; }
    else if (typ === "IDAT") idat.push(d.subarray(pos + 8, pos + 8 + ln));
    pos += 12 + ln;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  const stride = w * ch;
  const gray = new Float64Array(w * h);
  let prev = Buffer.alloc(stride), p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p]; p += 1;
    const row = Buffer.from(raw.subarray(p, p + stride)); p += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? row[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      if (f === 1) row[x] = (row[x] + a) & 255;
      else if (f === 2) row[x] = (row[x] + b) & 255;
      else if (f === 3) row[x] = (row[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        row[x] = (row[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    prev = row;
    for (let x = 0; x < w; x++) {
      gray[y * w + x] = ch >= 3
        ? 0.299 * row[x * ch] + 0.587 * row[x * ch + 1] + 0.114 * row[x * ch + 2]
        : row[x * ch];
    }
  }
  return { w, h, gray };
}

function normalizeTile(t) {
  // stretch to full range, then shift mean to 0.5 with soft rolloff
  let mn = Infinity, mx = -Infinity, sum = 0;
  for (const v of t) { if (v < mn) mn = v; if (v > mx) mx = v; sum += v; }
  const k = 1 / Math.max(1e-9, mx - mn);
  let mean = (sum / t.length - mn) * k;
  const gamma = Math.log(0.5) / Math.log(Math.min(0.95, Math.max(0.05, mean)));
  for (let i = 0; i < t.length; i++) {
    t[i] = Math.pow((t[i] - mn) * k, gamma);
  }
}

const tmp = mkdtempSync(join(tmpdir(), "grunge-"));
const atlas = new Float64Array(T * 4 * T * 2);
SOURCES.forEach((src, slot) => {
  const out = join(tmp, `t${slot}.png`);
  execFileSync("sips", ["-z", String(T), String(T), "-s", "format", "png", join(LIB, src), "--out", out], { stdio: "ignore" });
  const { w, h, gray } = readPngGray(out);
  if (w !== T || h !== T) throw new Error(`tile ${slot}: ${w}x${h}`);
  normalizeTile(gray);
  const ox = (slot % 4) * T, oy = Math.floor(slot / 4) * T;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      atlas[(oy + y) * T * 4 + ox + x] = gray[y * T + x];
    }
  }
  console.log("slot", slot, src);
});

const W = T * 4, H = T * 2;
const gray8 = new Uint8Array(W * H);
for (let i = 0; i < atlas.length; i++) gray8[i] = Math.round(Math.min(1, Math.max(0, atlas[i])) * 255);
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 0;
const rawOut = Buffer.alloc(H * (W + 1));
for (let y = 0; y < H; y++) {
  rawOut[y * (W + 1)] = 0;
  Buffer.from(gray8.subarray(y * W, (y + 1) * W)).copy(rawOut, y * (W + 1) + 1);
}
writeFileSync(new URL("../shaders/halftone/grunge-atlas.png", import.meta.url), Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(rawOut, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]));
console.log("wrote shaders/halftone/grunge-atlas.png");
