/**
 * Pure font filtering: types + predicate logic shared by the library grid,
 * compare view and bulk activation. No DB or Tauri access here so it stays
 * trivially unit-testable.
 */

/** One row of the fonts query (fonts ⋈ sources ⋈ font_tags aggregate). */
export type FontRow = {
  id: number;
  path: string;
  family: string;
  style: string;
  ps_name: string | null;
  source: string;
  format: string;
  glyph_count: number;
  is_system: 0 | 1;
  active: 0 | 1;
  favorite: 0 | 1;
  quarantined: 0 | 1;
  licence_status: string;
  tag_ids: string; // comma-separated tag ids, "" when untagged
};

export type FontQuery = {
  search: string;
  source: string | null;
  tagId: number | null;
  onlyActive: boolean;
  onlyFavorites: boolean;
  licence: string | null;
};

/**
 * Filter rows by a FontQuery. All criteria AND-combine:
 * - search: case-insensitive substring match on family
 * - source / tagId / licence: exact narrowing (null = no constraint)
 * - onlyActive / onlyFavorites: flag gates on top of everything else
 */
export function filterFonts(rows: FontRow[], q: FontQuery): FontRow[] {
  const search = q.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (search && !r.family.toLowerCase().includes(search)) return false;
    if (q.source !== null && r.source !== q.source) return false;
    if (q.tagId !== null && !r.tag_ids.split(",").includes(String(q.tagId))) return false;
    if (q.licence !== null && r.licence_status !== q.licence) return false;
    if (q.onlyActive && r.active !== 1) return false;
    if (q.onlyFavorites && r.favorite !== 1) return false;
    return true;
  });
}
