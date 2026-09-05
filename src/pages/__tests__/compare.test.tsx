import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComparePage } from "../ComparePage";
import { useAppStore } from "../../stores/app-store";
import type { FontRow } from "../../lib/fontFilters";

const mockSetActive = vi.fn();
vi.mock("../../hooks/useActivation", () => ({
  useSetActive: () => ({ mutate: mockSetActive, isPending: false }),
}));

const mockFontRows: FontRow[] = [
  {
    id: 1,
    path: "/lib/First.otf",
    family: "First",
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
  },
  {
    id: 2,
    path: "/lib/Second.otf",
    family: "Second",
    style: "Bold",
    ps_name: null,
    source: "Foundry",
    format: "otf",
    glyph_count: 200,
    is_system: 0,
    active: 1,
    favorite: 0,
    quarantined: 0,
    licence_status: "free",
    sample_text: null,
    tag_ids: "",
  },
];

vi.mock("../../hooks/useFonts", () => ({
  useFonts: () => ({ data: mockFontRows, isLoading: false }),
}));

beforeEach(() => {
  mockSetActive.mockClear();
  useAppStore.setState({ pinnedIds: [] });
});

describe("ComparePage", () => {
  it("renders the empty state when pinnedIds is empty", () => {
    useAppStore.setState({ pinnedIds: [] });
    render(<ComparePage />);
    expect(screen.getByText(/no fonts pinned/i)).toBeInTheDocument();
  });

  it("renders pinned fonts in the order of pinnedIds", () => {
    useAppStore.setState({ pinnedIds: [2, 1] });
    render(<ComparePage />);

    // Get all rows (they should be in order 2, then 1)
    const rows = screen.getAllByRole("row");
    // Rows: header + 2 data rows
    expect(rows.length).toBe(3);

    // First data row should be font id 2 (Second, Bold)
    expect(rows[1]).toHaveTextContent("Second");

    // Second data row should be font id 1 (First, Regular)
    expect(rows[2]).toHaveTextContent("First");
  });

  it("skips fonts not present in useFonts rows", () => {
    // Pin id 99 which doesn't exist in the mocked data
    useAppStore.setState({ pinnedIds: [2, 99, 1] });
    render(<ComparePage />);

    // Should only render 2 rows (header + 2 data)
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBe(3);

    // Should still respect order: 2 then 1
    expect(rows[1]).toHaveTextContent("Second");
    expect(rows[2]).toHaveTextContent("First");
  });

  it("renders activation toggle for each row", () => {
    useAppStore.setState({ pinnedIds: [1, 2] });
    render(<ComparePage />);

    // Should have activation toggles (Switch components)
    const toggles = screen.getAllByRole("switch");
    expect(toggles.length).toBeGreaterThanOrEqual(2);
  });

  it("renders unpin button for each row", () => {
    useAppStore.setState({ pinnedIds: [1, 2] });
    render(<ComparePage />);

    // Should have unpin buttons (×)
    const unpinButtons = screen.getAllByLabelText(/unpin font/i);
    expect(unpinButtons.length).toBe(2);
  });

  it("renders proof text in each row", () => {
    const proofText = "Test proof text";
    useAppStore.setState({ pinnedIds: [1], proofText });
    render(<ComparePage />);

    const proofRows = screen.getAllByText(proofText);
    expect(proofRows.length).toBeGreaterThanOrEqual(1);
  });
});
