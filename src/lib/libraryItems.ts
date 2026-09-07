/**
 * Pure flattening for the VIRTUALIZED library: turns groupByFamily's mixed
 * entry list into per-row items so @tanstack/react-virtual can window them.
 * List view → one LibraryItem per visible row; grid view → one GridItem per
 * visual grid ROW (cells chunked at the current column count, expanded
 * families broken into a full-width header + chunked style rows). No DOM,
 * no store — trivially unit-testable like familyGroups.
 */

import type { FontRow } from "./fontFilters";
import { isFamilyGroup, type FamilyGroup } from "./familyGroups";

/** Chip data for a family's lead row in list view (rendered by FontListRow). */
export interface FamilyChipInfo {
  family: string;
  /** Styles hidden behind the representative (rows.length - 1). */
  hiddenCount: number;
  expanded: boolean;
}

/** One list-view row: a font, optionally carrying its family's fold chip. */
export interface LibraryItem {
  kind: "font";
  font: FontRow;
  /** Present only on a family's lead row (collapsed rep / first expanded style). */
  chip?: FamilyChipInfo;
}

const toSet = (expanded: ReadonlySet<string> | readonly string[]): ReadonlySet<string> =>
  expanded instanceof Set ? expanded : new Set(expanded);

/**
 * List view: single fonts pass through; a collapsed family folds to its
 * representative (with a "+N styles" chip); an expanded family emits every
 * style row, the FIRST carrying the "−" chip. Lifts what FamilyListRows did
 * internally to page level so each row is exactly one virtual item.
 */
export function flattenLibrary(
  entries: readonly (FontRow | FamilyGroup)[],
  expanded: ReadonlySet<string> | readonly string[]
): LibraryItem[] {
  const expandedSet = toSet(expanded);
  const out: LibraryItem[] = [];
  for (const entry of entries) {
    if (!isFamilyGroup(entry)) {
      out.push({ kind: "font", font: entry });
    } else if (!expandedSet.has(entry.family)) {
      out.push({
        kind: "font",
        font: entry.representative,
        chip: {
          family: entry.family,
          hiddenCount: entry.rows.length - 1,
          expanded: false,
        },
      });
    } else {
      const chip: FamilyChipInfo = {
        family: entry.family,
        hiddenCount: entry.rows.length - 1,
        expanded: true,
      };
      entry.rows.forEach((font, i) => {
        out.push(i === 0 ? { kind: "font", font, chip } : { kind: "font", font });
      });
    }
  }
  return out;
}

/** One grid cell: a bare font card or a COLLAPSED family (header + rep card). */
export type GridCell =
  | { kind: "font"; font: FontRow }
  | { kind: "group"; group: FamilyGroup };

/**
 * One grid-view virtual row: either up to perRow cells, or an expanded
 * family's full-width header band. `key` is stable across re-chunks with the
 * same inputs (virtualizer getItemKey / React key).
 */
export type GridItem =
  | { kind: "cells"; key: string; cells: GridCell[] }
  | { kind: "header"; key: string; group: FamilyGroup };

const cellKey = (cell: GridCell): string =>
  cell.kind === "font" ? `f:${cell.font.id}` : `g:${cell.group.family}`;

/**
 * Grid view: singles and collapsed families flow together, filling rows of
 * up to perRow cells in entry order. An expanded family interrupts the flow
 * exactly like today's `col-span-full` group: the partial row is flushed, a
 * full-width header row is emitted, the family's style cards are chunked at
 * perRow, and the entries after it start a fresh row.
 */
export function chunkGrid(
  entries: readonly (FontRow | FamilyGroup)[],
  expanded: ReadonlySet<string> | readonly string[],
  perRow: number
): GridItem[] {
  const expandedSet = toSet(expanded);
  const cols = Math.max(1, Math.floor(perRow));
  const out: GridItem[] = [];
  let row: GridCell[] = [];
  const flush = () => {
    if (row.length === 0) return;
    out.push({ kind: "cells", key: cellKey(row[0]), cells: row });
    row = [];
  };
  const pushCell = (cell: GridCell) => {
    row.push(cell);
    if (row.length === cols) flush();
  };
  for (const entry of entries) {
    if (isFamilyGroup(entry) && expandedSet.has(entry.family)) {
      flush();
      out.push({ kind: "header", key: `h:${entry.family}`, group: entry });
      for (let i = 0; i < entry.rows.length; i += cols) {
        const chunk = entry.rows.slice(i, i + cols);
        out.push({
          kind: "cells",
          key: `f:${chunk[0].id}`,
          cells: chunk.map((font) => ({ kind: "font", font })),
        });
      }
      // `row` is empty here, so following entries naturally start fresh.
    } else if (isFamilyGroup(entry)) {
      pushCell({ kind: "group", group: entry });
    } else {
      pushCell({ kind: "font", font: entry });
    }
  }
  flush();
  return out;
}
