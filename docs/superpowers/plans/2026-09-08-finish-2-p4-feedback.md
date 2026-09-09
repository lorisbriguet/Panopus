# Finish 2 — Phase 4 Implementation Plan (field feedback)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The user's field-test backlog (StudioManager task 918, subtasks #381–#405), triaged into three batches: bugs/quick fixes, TD interaction parity, node & effect redesign. The original P4 (proof render, variation strip, A/B) moves to P5.

**Spec:** the subtask list is the spec; decisions confirmed with the user:
- **#404**: add-fonts UI ON the project Fonts tab (search the library, add).
- **#397 + #395/#396**: transform gains `opacity`; mix becomes an
  N-INPUT layer stack (inputs: 4), `mode` only — layer order is the
  input slot, unwired slots no-op via the transparent-unwired rule;
  a "swap first two inputs" affordance covers #396.

## Global Constraints

- As previous phases (gates per commit, parity case per shader change, portability triad).
- Graph compatibility: old mix nodes (amount param) keep rendering — amount is simply ignored once mode-only (note in ledger); old dither graphs with `algo: "halftone"` fall back via the unknown-enum rule (#399).
- StudioManager subtasks get ticked `done` (status + updated_at) as each lands — the user's tracker is the source of truth for this phase.

---

### Task 1: Bugs & quick fixes (#391 #392 #393 #394 #402 #403 #404)

**Files:** NodeCanvas.tsx (kind labels — #394 "?" bug for scale/text; pane-click deselect #392), ParamsPanel.tsx (opaque panel bg #391), PreviewCanvas.tsx (rotated drag outline via CSS transform #402; investigate #393 output-page thumb bg), textRaster.ts (tight measure: actualBoundingBox metrics #403), ProjectDetailPage.tsx + hooks (add-fonts modal on the Fonts tab, search library fonts, `useAddFontsToProject` — reuse the BulkBar mutation if one exists #404).

- [ ] Failing tests where testable (label fix, deselect, add-fonts RTL); implement; gates.
- [ ] Tick #391 #392 #393 #394 #402 #403 #404 done in StudioManager.
- [ ] Commit — `"fix: finish field-test round one"`

### Task 2: TD interaction parity (#381 #382 #383 #384 #385 #388 #389 #390 #413)

**Files:** NodeCanvas.tsx (context menu: swap op / bypass op; wire-drop insert; family colors; Tab→Add; `h`→fitView), model (bypass flag on nodes — engines pass through bypassed effect/scale/text nodes), PreviewCanvas/FinishTab (active-preview flag per operator: TD blue-dot → previewNode overrides what the CANVAS shows even mid-chain; zoom control #385).

- Bypass semantics: `bypass: true` on a node → engines treat it as passthrough of input 0 (both engines + parity case).
- Active preview: any operator can be flagged; the canvas shows ITS output placed on the preview page (mid-chain = raw frame contain-fit).
- #413: while dragging a connection, Tab opens the Add menu and the chosen node is inserted at the link's end (wired from the dragged handle).
- [ ] TDD the model/engine bits (bypass, active-preview routing); implement UI; gates; parity.
- [ ] Tick the eight subtasks done. Commit — `"feat: touchdesigner interaction parity"`

### Task 3: Node & effect redesign (#386 #387 #395 #397 #398 #399 #400 #405)

- **transform**: + `opacity` param (frag change + parity regold).
- **mix**: inputs 4, params `mode` only + swap-first-two; frag folds layers 1..3 over 0 (+ parity case with 3 sources).
- **levels** node (#398): in/out black/white points + gamma.
- **riso** (#386): up to 3 ink slots (color+threshold each, enable by threshold>0 convention or enable bools).
- **gradientmap** (#387): 4-stop editor (color+position pairs) — UI is a custom param row; shader lerps the stops.
- **dither** (#399/#400): remove halftone algo; split into `bayer` (levels, scale, matrix size) and `ascii` (cell, atlas params) nodes; keep `dither` manifest for old graphs (hidden from the Add menu).
- **text** (#405 #414 #415): letterSpacing, lineHeight, align (raster-side, re-keying the cache); non-uniform size (sizeX/sizeY with a uniform toggle, #414); selectable ANCHOR point for x/y — 9-point Figma-style grid instead of center-only — shared by text AND transform placement + the drag overlay (#415).
- [ ] Per-node: failing parity case → frag/manifest → goldens → gates; UI where needed.
- [ ] Tick the eight subtasks done. Commit per coherent chunk, final — `"feat: node redesign round"`

---

## Self-review notes

- #393 needs diagnosis before a fix lands — do not guess; reproduce in the dev app first.
- The gradient editor is the only real UI invention here; a 4-stop fixed model keeps it inside the flat-params world — full arbitrary-stop editing waits until params can hold structured data.
- Bypass touches both engines + resolution propagation (bypassed scale = no resize) — mirror carefully, parity case mandatory.
- N-input mix: NodeCanvas free-slot wiring already handles inputs=4; check the connect-handler's replace rule still reads sensibly with 4 slots.
