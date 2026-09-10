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
- TD-style modulate: a second input drives a signal over the first —
  e.g. input B's luma modulates displacement / threshold / param
  amplitude of input A (noted 2026-09-10 during the node review).
- Could start as a 2-input effect with a target enum (displace,
  threshold-bias, ink-mix) + amount, rather than generic param
  modulation plumbing (which would touch the executor's uniform
  contract).
