import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FamilyGroup } from "../FamilyGroup";
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

function renderGroup() {
  const entry = groupByFamily(rows)[0];
  if (!isFamilyGroup(entry)) throw new Error("expected a group");
  return render(<FamilyGroup group={entry} proofText="Proof" proofSize={20} />);
}

/** The group header — a real button carrying aria-expanded. */
function getHeader() {
  return screen.getByRole("button", { name: /family: Inter/i });
}

beforeEach(() => {
  __resetForTest();
  useAppStore.setState({ expandedFamilies: [] });
});

describe("FamilyGroup", () => {
  it("collapsed by default: representative (Regular) card + '+N styles' hint", () => {
    renderGroup();
    expect(getHeader()).toHaveAttribute("aria-expanded", "false");
    // Header count for the whole family…
    expect(screen.getByText("3 styles")).toBeInTheDocument();
    // …and the hidden-styles hint on the representative card.
    expect(screen.getByText("+2 styles")).toBeInTheDocument();
    // Only the Regular representative renders while collapsed.
    expect(screen.getByText("Regular")).toBeInTheDocument();
    expect(screen.queryByText("Bold")).not.toBeInTheDocument();
    expect(screen.queryByText("Italic")).not.toBeInTheDocument();
  });

  it("clicking the header expands to every style card and back", () => {
    renderGroup();
    fireEvent.click(getHeader());
    expect(getHeader()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Bold")).toBeInTheDocument();
    expect(screen.getByText("Italic")).toBeInTheDocument();
    expect(screen.getByText("Regular")).toBeInTheDocument();
    expect(screen.queryByText("+2 styles")).not.toBeInTheDocument();
    fireEvent.click(getHeader());
    expect(getHeader()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Bold")).not.toBeInTheDocument();
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
