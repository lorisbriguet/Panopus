# Panopus — Ideas & Backlog

(This file was StudioManager's ideas list carried over by the skeleton
fork — that content lives in the StudioManager repo and in this repo's
history at 33ed5aa2. Panopus ideas start here.)

## Finish — node ideas

### Channel separation node
- Split the incoming image into channels: RGB, RGBA, or CMYK plate
  separation (noted 2026-09-10 during the node review).
- Riso/print framing: each channel as its own grayscale plate output —
  pairs naturally with per-plate dithering and the riso node's ink
  slots. CMYK conversion should match the exporter's cmyk intent.
- Open questions: one node with N outputs (first multi-output operator —
  the graph model currently assumes fromOut 0) vs. a "channel" enum
  param picking a single plate per node instance (cheap, no model
  change).

### Modulation node
- Inspired by aescripts "Modulation" (https://aescripts.com/modulation/):
  an analog signal-processing effect — the image is treated as a
  transmission signal and run through modulation/demodulation (AM/FM
  radio style: luma drives the carrier frequency), yielding a retro
  transmission-waveform / glitch distortion. Params in the original:
  omega (carrier), phase, distortion — all scrub/keyframe friendly.
- Fits the effect family as a single-input frag (per-scanline signal
  math, VHS-adjacent) — no graph-model changes needed. Carrier +
  phase + distortion params, maybe a horizontal/vertical scan enum.
  (Noted 2026-09-10 during the node review.)
