import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LibraryList } from "../LibraryList";
import { __resetForTest } from "../FontFaceLoader";
import { useAppStore } from "../../../stores/app-store";
import { groupByFamily } from "../../../lib/familyGroups";
import type { FontRow } from "../../../lib/fontFilters";

// The shared setup mocks @tanstack/react-virtual with a passthrough (happy-dom
// has a zero-size viewport), so every virtual item renders its REAL row.

vi.mock("../../../hooks/useFonts", () => ({
  useToggleFavorite: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../hooks/useActivation", () => ({
  useSetActive: () => ({ mutate: vi.fn(), isPending: false }),
}));

const row = (o: Partial<FontRow>): FontRow => ({
  id: 1,
  path: "/a",
  family: "Alpha",
  style: "Regular",
  ps_name: null,
  source: "Foundry",
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
});

// Representative is Regular-preferred and deliberately NOT rows[0]:
// collapsed shows id 2, expanded leads with id 1 — guaranteed remount, the
// exact case the focus-restore effect must survive under virtualization.
const entries = groupByFamily([
  row({ id: 1, family: "Beta", style: "Bold", path: "/b" }),
  row({ id: 2, family: "Beta", style: "Regular", path: "/r" }),
  row({ id: 3, family: "Beta", style: "Italic", path: "/i" }),
  row({ id: 10, family: "Solo", style: "Regular", path: "/s" }),
]);

const openDetail = vi.fn();

function renderList() {
  return render(
    <LibraryList
      entries={entries}
      proofText="Proof"
      proofSize={20}
      onOpenDetail={openDetail}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetForTest();
  useAppStore.setState({
    selectedIds: new Set<number>(),
    expandedFamilies: [],
    pinnedIds: [],
    libraryView: "list",
    libraryColumns: "auto",
  });
});

describe("LibraryList — list view folding", () => {
  it("collapsed: representative row + solo row, with a +N chip", () => {
    renderList();
    // Beta folds to its representative, Solo stays a bare row.
    expect(screen.getAllByRole("button", { name: /open details/i })).toHaveLength(2);
    const chip = screen.getByRole("button", { name: "Expand family: Beta" });
    expect(chip).toHaveAttribute("aria-expanded", "false");
    expect(chip).toHaveTextContent("+2");
    // Representative is the Regular style (id 2, plus Solo's Regular), not rows[0].
    expect(screen.getAllByText("Regular")).toHaveLength(2);
    expect(screen.queryByText("Bold")).not.toBeInTheDocument();
  });

  it("clicking the +N chip expands the family WITHOUT opening the detail", () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "Expand family: Beta" }));
    expect(useAppStore.getState().expandedFamilies).toContain("Beta");
    expect(openDetail).not.toHaveBeenCalled();
    // All style rows + Solo now visible; the first style carries the chip.
    expect(screen.getAllByRole("button", { name: /open details/i })).toHaveLength(4);
    const chip = screen.getByRole("button", { name: "Collapse family: Beta" });
    expect(chip).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps focus on the chip across the expand/collapse remounts", () => {
    renderList();
    // Expanding swaps the representative row for the style rows — the
    // pressed chip unmounts; the list must re-focus the new chip.
    fireEvent.click(screen.getByRole("button", { name: "Expand family: Beta" }));
    expect(screen.getByRole("button", { name: "Collapse family: Beta" })).toHaveFocus();
    // And back: collapsing must land focus on the "+N" chip again.
    fireEvent.click(screen.getByRole("button", { name: "Collapse family: Beta" }));
    expect(screen.getByRole("button", { name: "Expand family: Beta" })).toHaveFocus();
  });

  it("clicking the collapse chip folds back to the representative", () => {
    useAppStore.setState({ expandedFamilies: ["Beta"] });
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "Collapse family: Beta" }));
    expect(useAppStore.getState().expandedFamilies).not.toContain("Beta");
    expect(screen.getAllByRole("button", { name: /open details/i })).toHaveLength(2);
    expect(openDetail).not.toHaveBeenCalled();
  });
});

describe("LibraryList — grid view folding", () => {
  beforeEach(() => {
    useAppStore.setState({ libraryView: "grid", libraryColumns: 2 });
  });

  it("collapsed: header + representative card with the '+N styles' pill", () => {
    renderList();
    const header = screen.getByRole("button", { name: "Expand family: Beta" });
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("3 styles")).toBeInTheDocument();
    expect(screen.getByText("+2 styles")).toBeInTheDocument();
    // Representative card + Solo card only.
    expect(screen.getAllByRole("button", { name: /open details/i })).toHaveLength(2);
    expect(screen.queryByText("Bold")).not.toBeInTheDocument();
  });

  it("expanding shows every style card and drops the pill; focus stays on the header", () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "Expand family: Beta" }));
    const header = screen.getByRole("button", { name: "Collapse family: Beta" });
    expect(header).toHaveAttribute("aria-expanded", "true");
    // Expanding replaces the collapsed cell with a header band + card rows —
    // a different mounted element; focus must be restored to it.
    expect(header).toHaveFocus();
    expect(screen.getByText("Bold")).toBeInTheDocument();
    expect(screen.getByText("Italic")).toBeInTheDocument();
    expect(screen.queryByText("+2 styles")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /open details/i })).toHaveLength(4);
  });

  it("collapsing folds back to the representative card", () => {
    useAppStore.setState({ expandedFamilies: ["Beta"] });
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "Collapse family: Beta" }));
    expect(useAppStore.getState().expandedFamilies).not.toContain("Beta");
    expect(screen.getByText("+2 styles")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /open details/i })).toHaveLength(2);
  });
});
