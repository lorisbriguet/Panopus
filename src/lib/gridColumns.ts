/**
 * Shared column template for the library grid. LibraryPage's outer list and
 * FamilyGroup's internal card grid both derive their gridTemplateColumns from
 * this ONE helper so a group's cards line up with the surrounding singles.
 * Pure string math — no DOM, no store — so it's trivially unit-testable.
 */

/** Manual column override for the library grid; "auto" fits as many 340px+ tracks as the width allows. */
export type LibraryColumnsOption = "auto" | 1 | 2 | 3;

export function gridTemplateForColumns(cols: LibraryColumnsOption): string {
  if (cols === "auto") return "repeat(auto-fill, minmax(340px, 1fr))";
  return gridTemplateForCount(cols);
}

/**
 * Template for a CONCRETE column count — the virtualized grid rows always
 * chunk cells at a known count (in "auto" mode it is derived from the
 * container width), so their template must never re-wrap on its own.
 * minmax(0, 1fr): a 0 track minimum lets cards shrink below their content
 * width (long proof text) instead of blowing the grid open.
 */
export function gridTemplateForCount(cols: number): string {
  return `repeat(${cols}, minmax(0, 1fr))`;
}
