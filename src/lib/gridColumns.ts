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
  // minmax(0, 1fr): a 0 track minimum lets cards shrink below their content
  // width (long proof text) instead of blowing the grid open.
  return `repeat(${cols}, minmax(0, 1fr))`;
}
