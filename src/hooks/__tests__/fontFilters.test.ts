import { describe, test, expect } from "vitest";
import { filterFonts, type FontRow } from "../../lib/fontFilters";

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

const query = (o: Partial<Parameters<typeof filterFonts>[1]>) => ({
  search: "",
  source: null,
  tagId: null,
  onlyActive: false,
  onlyFavorites: false,
  licence: null,
  ...o,
});

describe("filterFonts", () => {
  test("search + source + favorite combine", () => {
    const rows = [row({}), row({ id: 2, family: "Smokum", favorite: 1 })];
    expect(
      filterFonts(rows, {
        search: "smo",
        source: "astigmatic",
        tagId: null,
        onlyActive: false,
        onlyFavorites: true,
        licence: null,
      })
    ).toHaveLength(1);
    expect(
      filterFonts(rows, {
        search: "zzz",
        source: null,
        tagId: null,
        onlyActive: false,
        onlyFavorites: false,
        licence: null,
      })
    ).toHaveLength(0);
  });

  test("empty query returns all rows", () => {
    const rows = [row({}), row({ id: 2, family: "Smokum" })];
    expect(filterFonts(rows, query({}))).toHaveLength(2);
  });

  test("search is case-insensitive substring on family", () => {
    const rows = [row({ family: "Rye" }), row({ id: 2, family: "Smokum" })];
    expect(filterFonts(rows, query({ search: "RYE" }))).toHaveLength(1);
    expect(filterFonts(rows, query({ search: "oku" }))).toHaveLength(1);
    expect(filterFonts(rows, query({ search: "oku" }))[0].id).toBe(2);
  });

  test("tagId matches against the comma list exactly (no substring)", () => {
    const rows = [
      row({ id: 1, tag_ids: "1,12" }),
      row({ id: 2, tag_ids: "2" }),
      row({ id: 3, tag_ids: "" }),
    ];
    // tagId 1 must NOT match "12" or "2"
    expect(filterFonts(rows, query({ tagId: 1 }))).toHaveLength(1);
    expect(filterFonts(rows, query({ tagId: 1 }))[0].id).toBe(1);
    expect(filterFonts(rows, query({ tagId: 12 }))).toHaveLength(1);
    expect(filterFonts(rows, query({ tagId: 2 }))).toHaveLength(1);
    expect(filterFonts(rows, query({ tagId: 2 }))[0].id).toBe(2);
    expect(filterFonts(rows, query({ tagId: 99 }))).toHaveLength(0);
  });

  test("licence narrows exactly", () => {
    const rows = [
      row({ id: 1, licence_status: "free" }),
      row({ id: 2, licence_status: "commercial" }),
    ];
    const out = filterFonts(rows, query({ licence: "commercial" }));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(2);
    expect(filterFonts(rows, query({ licence: "donationware" }))).toHaveLength(0);
  });

  test("source narrows exactly", () => {
    const rows = [
      row({ id: 1, source: "astigmatic" }),
      row({ id: 2, source: "opti" }),
    ];
    const out = filterFonts(rows, query({ source: "opti" }));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(2);
  });

  test("onlyActive AND-combines with search", () => {
    const rows = [
      row({ id: 1, family: "Rye", active: 1 }),
      row({ id: 2, family: "Ryman", active: 0 }),
      row({ id: 3, family: "Smokum", active: 1 }),
    ];
    const out = filterFonts(rows, query({ search: "ry", onlyActive: true }));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(1);
  });

  test("onlyActive and onlyFavorites both required when both set", () => {
    const rows = [
      row({ id: 1, active: 1, favorite: 0 }),
      row({ id: 2, active: 0, favorite: 1 }),
      row({ id: 3, active: 1, favorite: 1 }),
    ];
    const out = filterFonts(rows, query({ onlyActive: true, onlyFavorites: true }));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(3);
  });
});
