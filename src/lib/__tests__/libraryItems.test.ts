import { describe, test, expect } from "vitest";
import { flattenLibrary, chunkGrid } from "../libraryItems";
import { groupByFamily, isFamilyGroup, type FamilyGroup } from "../familyGroups";
import type { FontRow } from "../fontFilters";

const row = (o: Partial<FontRow>): FontRow => ({
  id: 1,
  path: "/a",
  family: "Rye",
  style: "Regular",
  ps_name: null,
  source: "astigmatic",
  format: "ttf",
  glyph_count: 100,
  is_system: 0,
  active: 0,
  favorite: 0,
  quarantined: 0,
  licence_status: "free",
  sample_text: null,
  tag_ids: "",
  ...o,
});

/**
 * Alpha (single), Beta (3 styles, Regular is NOT rows[0] — representative
 * remount case), Gamma (single), Delta (2 styles).
 */
const entries = groupByFamily([
  row({ id: 1, family: "Alpha" }),
  row({ id: 2, family: "Beta", style: "Bold" }),
  row({ id: 3, family: "Beta", style: "Regular" }),
  row({ id: 4, family: "Beta", style: "Italic" }),
  row({ id: 5, family: "Gamma" }),
  row({ id: 6, family: "Delta", style: "Black" }),
  row({ id: 7, family: "Delta", style: "Bold" }),
]);

const beta = entries.find(
  (e): e is FamilyGroup => isFamilyGroup(e) && e.family === "Beta"
)!;

describe("flattenLibrary (list view)", () => {
  test("empty input yields an empty list", () => {
    expect(flattenLibrary([], [])).toEqual([]);
  });

  test("singles pass through as bare font items without a chip", () => {
    const out = flattenLibrary(entries, []);
    const alpha = out.find((i) => i.font.family === "Alpha")!;
    expect(alpha.kind).toBe("font");
    expect(alpha.font.id).toBe(1);
    expect(alpha.chip).toBeUndefined();
  });

  test("collapsed group folds to ONE representative item with a collapsed chip", () => {
    const out = flattenLibrary(entries, []);
    // 1 (Alpha) + 1 (Beta rep) + 1 (Gamma) + 1 (Delta rep)
    expect(out).toHaveLength(4);
    const betaItem = out[1];
    // Representative is Regular-preferred (id 3), not rows[0].
    expect(betaItem.font.id).toBe(3);
    expect(betaItem.chip).toEqual({
      family: "Beta",
      hiddenCount: 2,
      expanded: false,
    });
  });

  test("expanded group emits every style row; only the FIRST carries the chip", () => {
    const out = flattenLibrary(entries, ["Beta"]);
    // 1 + 3 (Beta) + 1 + 1 (Delta rep)
    expect(out).toHaveLength(6);
    expect(out.slice(1, 4).map((i) => i.font.id)).toEqual([2, 3, 4]);
    expect(out[1].chip).toEqual({
      family: "Beta",
      hiddenCount: 2,
      expanded: true,
    });
    expect(out[2].chip).toBeUndefined();
    expect(out[3].chip).toBeUndefined();
  });

  test("accepts the expansion set as a ReadonlySet too", () => {
    const out = flattenLibrary(entries, new Set(["Beta", "Delta"]));
    expect(out.map((i) => i.font.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(out[4].chip).toBeUndefined(); // Gamma stays a bare single
    expect(out[5].chip?.expanded).toBe(true); // Delta's lead row
  });

  test("preserves the incoming entry order", () => {
    const out = flattenLibrary(entries, []);
    expect(out.map((i) => i.font.family)).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
      "Delta",
    ]);
  });
});

describe("chunkGrid (grid view)", () => {
  test("empty input yields an empty list", () => {
    expect(chunkGrid([], [], 3)).toEqual([]);
  });

  test("singles and collapsed groups fill rows of up to perRow cells, in order", () => {
    const out = chunkGrid(entries, [], 3);
    // 4 cells at perRow 3 → one full row + one 1-cell remainder.
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe("cells");
    if (out[0].kind !== "cells") throw new Error("expected cells");
    expect(out[0].cells).toHaveLength(3);
    expect(out[0].cells[0]).toEqual({ kind: "font", font: entries[0] });
    expect(out[0].cells[1]).toEqual({ kind: "group", group: beta });
    if (out[1].kind !== "cells") throw new Error("expected cells");
    expect(out[1].cells).toHaveLength(1);
  });

  test("perRow 1 stacks every cell on its own row", () => {
    const out = chunkGrid(entries, [], 1);
    expect(out).toHaveLength(4);
    expect(out.every((i) => i.kind === "cells" && i.cells.length === 1)).toBe(true);
  });

  test("expanded group: flush partial row, full-width header, chunked style rows, then a fresh row", () => {
    const out = chunkGrid(entries, ["Beta"], 2);
    // [Alpha]              ← partial row flushed by the expanded group
    // header(Beta)
    // [2, 3]               ← Beta styles chunked at perRow
    // [4]
    // [Gamma, Delta(coll)] ← following entries start a FRESH row
    expect(out.map((i) => i.kind)).toEqual([
      "cells",
      "header",
      "cells",
      "cells",
      "cells",
    ]);
    if (out[0].kind !== "cells") throw new Error("expected cells");
    expect(out[0].cells).toHaveLength(1);
    if (out[1].kind !== "header") throw new Error("expected header");
    expect(out[1].group.family).toBe("Beta");
    if (out[2].kind !== "cells" || out[3].kind !== "cells")
      throw new Error("expected cells");
    expect(
      out[2].cells.map((c) => (c.kind === "font" ? c.font.id : null))
    ).toEqual([2, 3]);
    expect(
      out[3].cells.map((c) => (c.kind === "font" ? c.font.id : null))
    ).toEqual([4]);
    if (out[4].kind !== "cells") throw new Error("expected cells");
    expect(out[4].cells).toHaveLength(2);
    expect(out[4].cells[0]).toEqual({ kind: "font", font: entries[2] });
    expect(out[4].cells[1].kind).toBe("group");
  });

  test("expanded group larger than perRow keeps every style exactly once", () => {
    const out = chunkGrid([beta], new Set(["Beta"]), 2);
    const ids = out
      .filter((i) => i.kind === "cells")
      .flatMap((i) => (i.kind === "cells" ? i.cells : []))
      .map((c) => (c.kind === "font" ? c.font.id : null));
    expect(ids).toEqual([2, 3, 4]);
  });

  test("keys are unique and stable across items", () => {
    const out = chunkGrid(entries, ["Beta", "Delta"], 2);
    const keys = out.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    // Same inputs → same keys (virtualizer getItemKey stability).
    expect(chunkGrid(entries, ["Beta", "Delta"], 2).map((i) => i.key)).toEqual(keys);
  });
});
