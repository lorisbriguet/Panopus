import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FontListRow, FamilyListRows } from "../FontListRow";
import { __resetForTest } from "../FontFaceLoader";
import { useAppStore } from "../../../stores/app-store";
import type { FontRow } from "../../../lib/fontFilters";
import type { FamilyGroup } from "../../../lib/familyGroups";

const favMutate = vi.fn();
const activeMutate = vi.fn();
vi.mock("../../../hooks/useFonts", () => ({
  useToggleFavorite: () => ({ mutate: favMutate, isPending: false }),
}));
vi.mock("../../../hooks/useActivation", () => ({
  useSetActive: () => ({ mutate: activeMutate, isPending: false }),
}));

const font: FontRow = {
  id: 7,
  path: "/lib/Alpha.otf",
  family: "Alpha",
  style: "Regular",
  ps_name: null,
  source: "Foundry",
  format: "otf",
  glyph_count: 200,
  is_system: 0,
  active: 0,
  favorite: 0,
  quarantined: 0,
  licence_status: "free",
  sample_text: null,
  tag_ids: "",
};

const openDetail = vi.fn();

function renderRow(overrides: Partial<FontRow> = {}) {
  return render(
    <FontListRow
      font={{ ...font, ...overrides }}
      proofText="Proof"
      proofSize={20}
      onOpenDetail={openDetail}
    />
  );
}

/** The row root — an actionable role="button" named via open_details. */
function getRow() {
  return screen.getByRole("button", { name: /open details/i });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetForTest();
  useAppStore.setState({ selectedIds: [], expandedFamilies: [], pinnedIds: [] });
});

describe("FontListRow", () => {
  it("renders family, style, source and the proof line", () => {
    renderRow();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Regular")).toBeInTheDocument();
    expect(screen.getByText("Foundry")).toBeInTheDocument();
    expect(screen.getByText("Proof")).toBeInTheDocument();
  });

  it("prefers the indexed specimen over the proof text and flags it", () => {
    renderRow({ sample_text: "Специмен" });
    expect(screen.getByText("Специмен")).toBeInTheDocument();
    expect(screen.queryByText("Proof")).not.toBeInTheDocument();
    // The substitution is flagged (FontCard's specimen_label precedent).
    expect(screen.getByText("specimen")).toBeInTheDocument();
  });

  it("shows no specimen flag when the proof text renders", () => {
    renderRow();
    expect(screen.queryByText("specimen")).not.toBeInTheDocument();
  });

  it("opens the detail on a plain row click", () => {
    renderRow();
    fireEvent.click(getRow());
    expect(openDetail).toHaveBeenCalledTimes(1);
    expect(openDetail).toHaveBeenCalledWith(7);
  });

  it("is focusable and opens the detail on Enter", () => {
    renderRow();
    const row = getRow();
    expect(row).toHaveAttribute("tabindex", "0");
    row.focus();
    fireEvent.keyDown(row, { key: "Enter" });
    expect(openDetail).toHaveBeenCalledWith(7);
  });

  it("does NOT open the detail when clicking the star (but toggles favorite)", () => {
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Add to favorites" }));
    expect(favMutate).toHaveBeenCalledWith({ id: 7, favorite: 1 });
    expect(openDetail).not.toHaveBeenCalled();
  });

  it("does NOT open the detail when clicking the selection checkbox", () => {
    renderRow();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select font" }));
    expect(useAppStore.getState().selectedIds).toEqual([7]);
    expect(openDetail).not.toHaveBeenCalled();
  });

  it("disables the checkbox and activation toggle for system fonts", () => {
    renderRow({ is_system: 1 });
    expect(screen.getByRole("checkbox", { name: "Select font" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Font active" })).toBeDisabled();
  });
});

describe("FamilyListRows folding", () => {
  // Representative is Regular-preferred and deliberately NOT rows[0] here:
  // collapsed shows id 2, expanded leads with id 1 — guaranteed remount, the
  // exact case the focus-restore effect must survive.
  const rows: FontRow[] = [
    { ...font, id: 1, style: "Bold" },
    { ...font, id: 2, style: "Regular" },
    { ...font, id: 3, style: "Italic" },
  ];
  const group: FamilyGroup = {
    family: "Alpha",
    rows,
    representative: rows[1],
  };

  function renderGroup() {
    return render(
      <FamilyListRows
        group={group}
        proofText="Proof"
        proofSize={20}
        onOpenDetail={openDetail}
      />
    );
  }

  it("collapsed: shows ONE row with a +N chip", () => {
    renderGroup();
    expect(screen.getAllByRole("button", { name: /open details/i })).toHaveLength(1);
    const chip = screen.getByRole("button", { name: "Expand family: Alpha" });
    expect(chip).toHaveAttribute("aria-expanded", "false");
    expect(chip).toHaveTextContent("+2");
  });

  it("clicking the +N chip expands the family WITHOUT opening the detail", () => {
    renderGroup();
    fireEvent.click(screen.getByRole("button", { name: "Expand family: Alpha" }));
    expect(useAppStore.getState().expandedFamilies).toContain("Alpha");
    expect(openDetail).not.toHaveBeenCalled();
    // All style rows now visible; the first carries the collapse chip.
    expect(screen.getAllByRole("button", { name: /open details/i })).toHaveLength(3);
    const chip = screen.getByRole("button", { name: "Collapse family: Alpha" });
    expect(chip).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps focus on the chip across the expand/collapse remounts", () => {
    renderGroup();
    // Expanding swaps the representative row for the style rows — the
    // pressed chip unmounts; FamilyListRows must re-focus the new chip.
    fireEvent.click(screen.getByRole("button", { name: "Expand family: Alpha" }));
    expect(screen.getByRole("button", { name: "Collapse family: Alpha" })).toHaveFocus();
    // And back: collapsing must land focus on the "+N" chip again.
    fireEvent.click(screen.getByRole("button", { name: "Collapse family: Alpha" }));
    expect(screen.getByRole("button", { name: "Expand family: Alpha" })).toHaveFocus();
  });

  it("clicking the collapse chip folds back to the representative", () => {
    useAppStore.setState({ expandedFamilies: ["Alpha"] });
    renderGroup();
    fireEvent.click(screen.getByRole("button", { name: "Collapse family: Alpha" }));
    expect(useAppStore.getState().expandedFamilies).not.toContain("Alpha");
    expect(screen.getAllByRole("button", { name: /open details/i })).toHaveLength(1);
    expect(openDetail).not.toHaveBeenCalled();
  });
});
