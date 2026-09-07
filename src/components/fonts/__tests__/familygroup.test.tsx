import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CollapsedFamilyGroup, FamilyGroupHeader } from "../FamilyGroup";
import { __resetForTest } from "../FontFaceLoader";
import { useAppStore } from "../../../stores/app-store";
import { groupByFamily, isFamilyGroup } from "../../../lib/familyGroups";
import type { FontRow } from "../../../lib/fontFilters";

vi.mock("../../../hooks/useFonts", () => ({
  useToggleFavorite: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../hooks/useActivation", () => ({
  useSetActive: () => ({ mutate: vi.fn(), isPending: false }),
}));

const row = (o: Partial<FontRow>): FontRow => ({
  id: 1,
  path: "/a",
  family: "Inter",
  style: "Regular",
  ps_name: null,
  source: "google",
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

const rows = [
  row({ id: 1, style: "Bold", path: "/b" }),
  row({ id: 2, style: "Italic", path: "/i" }),
  row({ id: 3, style: "Regular", path: "/r" }),
];

function getGroup() {
  const entry = groupByFamily(rows)[0];
  if (!isFamilyGroup(entry)) throw new Error("expected a group");
  return entry;
}

const onToggle = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  __resetForTest();
  useAppStore.setState({ expandedFamilies: [] });
});

// The expanded rendering (full-width header band + chunked style rows) is
// virtualization territory — covered through LibraryList (librarylist.test.tsx).
describe("CollapsedFamilyGroup (grid cell)", () => {
  function renderCell() {
    return render(
      <CollapsedFamilyGroup
        group={getGroup()}
        proofText="Proof"
        proofSize={20}
        onToggle={onToggle}
      />
    );
  }

  it("shows the representative (Regular) card with the '+N styles' hint", () => {
    renderCell();
    const header = screen.getByRole("button", { name: "Expand family: Inter" });
    expect(header).toHaveAttribute("aria-expanded", "false");
    // Header count for the whole family…
    expect(screen.getByText("3 styles")).toBeInTheDocument();
    // …and the hidden-styles hint on the representative card.
    expect(screen.getByText("+2 styles")).toBeInTheDocument();
    // Only the Regular representative renders while collapsed.
    expect(screen.getByText("Regular")).toBeInTheDocument();
    expect(screen.queryByText("Bold")).not.toBeInTheDocument();
    expect(screen.queryByText("Italic")).not.toBeInTheDocument();
  });

  it("clicking the header asks the list to toggle the family", () => {
    renderCell();
    fireEvent.click(screen.getByRole("button", { name: "Expand family: Inter" }));
    expect(onToggle).toHaveBeenCalledWith("Inter");
  });
});

describe("FamilyGroupHeader", () => {
  it("expanded header: aria-expanded, focus-restore handle, toggle callback", () => {
    render(<FamilyGroupHeader group={getGroup()} expanded onToggle={onToggle} />);
    const header = screen.getByRole("button", { name: "Collapse family: Inter" });
    expect(header).toHaveAttribute("aria-expanded", "true");
    // data-family-toggle: the virtualized list re-focuses the header via
    // this attribute after the expand/collapse remount.
    expect(header).toHaveAttribute("data-family-toggle", "Inter");
    fireEvent.click(header);
    expect(onToggle).toHaveBeenCalledWith("Inter");
  });
});

describe("family expansion store actions", () => {
  it("toggleFamily adds then removes a family", () => {
    useAppStore.getState().toggleFamily("Inter");
    expect(useAppStore.getState().expandedFamilies).toEqual(["Inter"]);
    useAppStore.getState().toggleFamily("Inter");
    expect(useAppStore.getState().expandedFamilies).toEqual([]);
  });

  it("setAllFamiliesExpanded replaces the set; null collapses everything", () => {
    useAppStore.getState().setAllFamiliesExpanded(["A", "B"]);
    expect(useAppStore.getState().expandedFamilies).toEqual(["A", "B"]);
    useAppStore.getState().setAllFamiliesExpanded(null);
    expect(useAppStore.getState().expandedFamilies).toEqual([]);
  });
});
