import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BulkBar } from "../BulkBar";
import { useAppStore } from "../../../stores/app-store";
import type { FontRow } from "../../../lib/fontFilters";

vi.mock("../../../hooks/useActivation", () => ({
  useSetActive: () => ({ mutate: vi.fn(), isPending: false }),
}));

const assignMutate = vi.fn();
const unassignMutate = vi.fn();
vi.mock("../../../hooks/useTags", () => ({
  useTags: () => ({
    data: [
      { id: 1, name: "Serif", color: "blue" },
      { id: 2, name: "Display", color: "red" },
    ],
  }),
  useAssignTagBulk: () => ({ mutate: assignMutate, isPending: false }),
  useUnassignTagBulk: () => ({ mutate: unassignMutate, isPending: false }),
}));

function makeRow(id: number, tagIds: string): FontRow {
  return {
    id,
    path: `/f/${id}.otf`,
    family: `Fam${id}`,
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
    tag_ids: tagIds,
  };
}

// Font 1 has only tag 1; font 2 has tags 1 and 2. With both selected:
// tag 1 is on EVERY selected font (checked), tag 2 only on some (unchecked).
const rows = [makeRow(1, "1"), makeRow(2, "1,2"), makeRow(3, "2")];

beforeEach(() => {
  assignMutate.mockClear();
  unassignMutate.mockClear();
  useAppStore.setState({ selectedIds: [1, 2] });
});

describe("BulkBar tag menu", () => {
  it("opens the menu and reflects per-tag selection state", () => {
    render(<BulkBar rows={rows} />);
    fireEvent.click(screen.getByText("Tag"));
    const serif = screen.getByRole("menuitemcheckbox", { name: /Serif/ });
    const display = screen.getByRole("menuitemcheckbox", { name: /Display/ });
    expect(serif).toHaveAttribute("aria-checked", "true");
    expect(display).toHaveAttribute("aria-checked", "false");
  });

  it("toggling an unchecked tag bulk-assigns it to all selected fonts", () => {
    render(<BulkBar rows={rows} />);
    fireEvent.click(screen.getByText("Tag"));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Display/ }));
    expect(assignMutate).toHaveBeenCalledTimes(1);
    expect(assignMutate).toHaveBeenCalledWith({ fontIds: [1, 2], tagId: 2 });
    expect(unassignMutate).not.toHaveBeenCalled();
  });

  it("toggling a checked tag bulk-unassigns it from all selected fonts", () => {
    render(<BulkBar rows={rows} />);
    fireEvent.click(screen.getByText("Tag"));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Serif/ }));
    expect(unassignMutate).toHaveBeenCalledTimes(1);
    expect(unassignMutate).toHaveBeenCalledWith({ fontIds: [1, 2], tagId: 1 });
    expect(assignMutate).not.toHaveBeenCalled();
  });

  it("closes the menu on Escape", () => {
    render(<BulkBar rows={rows} />);
    fireEvent.click(screen.getByText("Tag"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
