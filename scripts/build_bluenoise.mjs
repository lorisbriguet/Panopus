// Bakes shaders/bayer/bluenoise-64.png — a 64x64 void-and-cluster
// (Ulichney) blue-noise threshold matrix for the Dithering node's
// "voidcluster" algo. Deterministic (seeded PRNG); rerun only if the
// size or sigma changes. No dependencies: PNG written by hand via zlib.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const N = 64; // side; ranks 0..N*N-1
const SIGMA = 1.9; // gaussian energy falloff (classic V&C value)

// mulberry32 — deterministic seed so the bake is reproducible.
let s = 0x9e3779b9;
function rand() {
  s |= 0; s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Toroidal gaussian kernel, precomputed over all displacement pairs.
const kern = new Float64Array(N * N);
for (let dy = 0; dy < N; dy++) {
  for (let dx = 0; dx < N; dx++) {
    const wx = Math.min(dx, N - dx);
    const wy = Math.min(dy, N - dy);
    kern[dy * N + dx] = Math.exp(-(wx * wx + wy * wy) / (2 * SIGMA * SIGMA));
  }
}

const energy = new Float64Array(N * N);
const on = new Uint8Array(N * N);
function bump(i, sign) {
  const iy = (i / N) | 0, ix = i % N;
  for (let y = 0; y < N; y++) {
    const dy = (y - iy + N) % N;
    for (let x = 0; x < N; x++) {
      energy[y * N + x] += sign * kern[dy * N + ((x - ix + N) % N)];
    }
  }
}
function extreme(want, best) {
  // want=1: tightest cluster among ones; want=0: largest void among zeros
  let bi = -1, bv = want ? -Infinity : Infinity;
  for (let i = 0; i < N * N; i++) {
    if (on[i] !== want) continue;
    const e = energy[i];
    if (want ? e > bv : e < bv) { bv = e; bi = i; }
  }
  return bi ?? best;
}

// Seed: ~10% random ones, then relax (tightest cluster -> largest void).
const target = Math.floor(N * N * 0.1);
while (on.reduce((a, b) => a + b, 0) < target) {
  const i = Math.floor(rand() * N * N);
  if (!on[i]) { on[i] = 1; bump(i, +1); }
}
for (;;) {
  const c = extreme(1);
  on[c] = 0; bump(c, -1);
  const v = extreme(0);
  on[v] = 1; bump(v, +1);
  if (v === c) break;
}

const rank = new Int32Array(N * N).fill(-1);
const seeded = on.slice();
const seededEnergy = energy.slice();
let ones = seeded.reduce((a, b) => a + b, 0);

// Phase 1: peel the seed pattern, ranking down from ones-1 to 0.
for (let r = ones - 1; r >= 0; r--) {
  const c = extreme(1);
  on[c] = 0; bump(c, -1);
  rank[c] = r;
}
// Phase 2+3: refill from the seed state, ranking up into every void.
on.set(seeded);
energy.set(seededEnergy);
for (let r = ones; r < N * N; r++) {
  const v = extreme(0);
  on[v] = 1; bump(v, +1);
  rank[v] = r;
}

// Ranks -> 8-bit grayscale PNG.
const gray = new Uint8Array(N * N);
for (let i = 0; i < N * N; i++) gray[i] = Math.round((rank[i] / (N * N - 1)) * 255);

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
ihdr.writeUInt32BE(N, 0);
ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 0;  // grayscale
const raw = Buffer.alloc(N * (N + 1));
for (let y = 0; y < N; y++) {
  raw[y * (N + 1)] = 0; // filter none
  Buffer.from(gray.subarray(y * N, (y + 1) * N)).copy(raw, y * (N + 1) + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(new URL("../shaders/bayer/bluenoise-64.png", import.meta.url), png);
console.log("wrote shaders/bayer/bluenoise-64.png", png.length, "bytes");
