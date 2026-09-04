import { describe, test, expect } from "vitest";
import { groupByFamily, isFamilyGroup } from "../familyGroups";
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
  tag_ids: "",
  ...o,
});

describe("groupByFamily", () => {
  test("families with 2+ styles become a FamilyGroup holding every row", () => {
    const rows = [
      row({ id: 1, family: "Inter", style: "Bold" }),
      row({ id: 2, family: "Inter", style: "Italic" }),
      row({ id: 3, family: "Inter", style: "Regular" }),
    ];
    const out = groupByFamily(rows);
    expect(out).toHaveLength(1);
    const g = out[0];
    expect(isFamilyGroup(g)).toBe(true);
    if (!isFamilyGroup(g)) throw new Error("expected a group");
    expect(g.family).toBe("Inter");
    expect(g.rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  test('representative prefers the "Regular" style', () => {
    const rows = [
      row({ id: 1, family: "Inter", style: "Bold" }),
      row({ id: 2, family: "Inter", style: "Regular" }),
    ];
    const out = groupByFamily(rows);
    if (!isFamilyGroup(out[0])) throw new Error("expected a group");
    expect(out[0].representative.id).toBe(2);
  });

  test("representative falls back to the first row when no Regular exists", () => {
    const rows = [
      row({ id: 1, family: "Inter", style: "Black" }),
      row({ id: 2, family: "Inter", style: "Bold" }),
    ];
    const out = groupByFamily(rows);
    if (!isFamilyGroup(out[0])) throw new Error("expected a group");
    expect(out[0].representative.id).toBe(1);
  });

  test("single-style families stay bare FontRow entries", () => {
    const rows = [row({ id: 1, family: "Rye", style: "Regular" })];
    const out = groupByFamily(rows);
    expect(out).toHaveLength(1);
    expect(isFamilyGroup(out[0])).toBe(false);
    expect(out[0]).toBe(rows[0]);
  });

  test("preserves the incoming (sorted) family order, singles interleaved", () => {
    const rows = [
      row({ id: 1, family: "Alpha", style: "Regular" }),
      row({ id: 2, family: "Beta", style: "Bold" }),
      row({ id: 3, family: "Beta", style: "Regular" }),
      row({ id: 4, family: "Gamma", style: "Regular" }),
    ];
    const out = groupByFamily(rows);
    expect(out).toHaveLength(3);
    expect(isFamilyGroup(out[0])).toBe(false);
    expect(isFamilyGroup(out[1])).toBe(true);
    expect(isFamilyGroup(out[2])).toBe(false);
    const families = out.map((e) => (isFamilyGroup(e) ? e.family : e.family));
    expect(families).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  test("preserves descending family order too", () => {
    const rows = [
      row({ id: 4, family: "Gamma", style: "Regular" }),
      row({ id: 2, family: "Beta", style: "Bold" }),
      row({ id: 3, family: "Beta", style: "Regular" }),
      row({ id: 1, family: "Alpha", style: "Regular" }),
    ];
    const out = groupByFamily(rows);
    const families = out.map((e) => e.family);
    expect(families).toEqual(["Gamma", "Beta", "Alpha"]);
  });

  test("empty input yields an empty list", () => {
    expect(groupByFamily([])).toEqual([]);
  });
});
