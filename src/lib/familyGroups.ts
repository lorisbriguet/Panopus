/**
 * Pure family grouping for the library grid: turns a filtered+sorted flat
 * FontRow list into a mixed list where families with 2+ styles become a
 * FamilyGroup (foldable in the UI) and single-style families stay bare rows.
 * No DB or Tauri access — trivially unit-testable like fontFilters.
 */

import type { FontRow } from "./fontFilters";

export type FamilyGroup = {
  family: string;
  /** Every style row of this family, in the incoming (sorted) order. */
  rows: FontRow[];
  /** Card shown while collapsed: the "Regular" style, else the first row. */
  representative: FontRow;
};

/** Discriminates mixed groupByFamily entries (bare rows have no `rows`). */
export function isFamilyGroup(entry: FontRow | FamilyGroup): entry is FamilyGroup {
  return "rows" in entry;
}

/**
 * Group rows by family, preserving the incoming order (first occurrence
 * decides a family's position, so ascending AND descending sorts survive).
 * Families with a single style are returned untouched as bare FontRow.
 */
export function groupByFamily(rows: FontRow[]): (FontRow | FamilyGroup)[] {
  const byFamily = new Map<string, FontRow[]>();
  for (const r of rows) {
    const bucket = byFamily.get(r.family);
    if (bucket) bucket.push(r);
    else byFamily.set(r.family, [r]);
  }
  const out: (FontRow | FamilyGroup)[] = [];
  for (const [family, bucket] of byFamily) {
    if (bucket.length === 1) {
      out.push(bucket[0]);
    } else {
      out.push({
        family,
        rows: bucket,
        representative: bucket.find((r) => r.style === "Regular") ?? bucket[0],
      });
    }
  }
  return out;
}
