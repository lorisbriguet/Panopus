import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TagEditor } from "../FontDetail";
import type { FontRow } from "../../../lib/fontFilters";

// Until now the single-font unassign path (detail-panel pill) had no test —
// this covers #377's visible remove affordance AND the mutation payloads.
const assignMutate = vi.fn();
const unassignMutate = vi.fn();
vi.mock("../../../hooks/useTags", () => ({
  useTags: () => ({
    data: [
      { id: 1, name: "Serif", color: "blue" },
      { id: 3, name: "Display", color: "red" },
    ],
  }),
  useCreateTag: () => ({ mutate: vi.fn(), isPending: false }),
  useAssignTag: () => ({ mutate: assignMutate, isPending: false }),
  useUnassignTag: () => ({ mutate: unassignMutate, isPending: false }),
}));

function fontRow(o: Partial<FontRow>): FontRow {
  return {
    id: 7,
    path: "/lib/Alpha.otf",
    family: "Alpha",
    style: "Regular",
    ps_name: null,
    source: "test",
    format: "otf",
    glyph_count: 100,
    is_system: 0,
    active: 0,
    favorite: 0,
    quarantined: 0,
    licence_status: "free",
    sample_text: null,
    tag_ids: "",
    ...o,
  };
}

beforeEach(() => {
  assignMutate.mockClear();
  unassignMutate.mockClear();
});

describe("TagEditor", () => {
  it("assigned pills carry the remove affordance and unassign on click", () => {
    render(<TagEditor font={fontRow({ tag_ids: "3" })} />);
    const pill = screen.getByRole("button", { name: "Display" });
    expect(pill).toHaveAttribute("aria-pressed", "true");
    expect(pill).toHaveAttribute("title", "Remove tag");
    fireEvent.click(pill);
    expect(unassignMutate).toHaveBeenCalledWith({ fontId: 7, tagId: 3 });
    expect(assignMutate).not.toHaveBeenCalled();
  });

  it("unassigned pills hint at assignment and assign on click", () => {
    render(<TagEditor font={fontRow({ tag_ids: "" })} />);
    const pill = screen.getByRole("button", { name: "Display" });
    expect(pill).toHaveAttribute("aria-pressed", "false");
    expect(pill).toHaveAttribute("title", "Add tag");
    fireEvent.click(pill);
    expect(assignMutate).toHaveBeenCalledWith({ fontId: 7, tagId: 3 });
    expect(unassignMutate).not.toHaveBeenCalled();
  });
});
