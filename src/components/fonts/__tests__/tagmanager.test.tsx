import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TagManager } from "../TagManager";
import { useAppStore, EMPTY_FONT_QUERY } from "../../../stores/app-store";

// Module-mock the tag hooks (same pattern as bulk.test.tsx's useSetActive
// mock) so no QueryClient / DB is needed. The delete mock runs the caller's
// onSuccess synchronously — the filter-reset lives in that callback.
const createMutate = vi.fn();
const renameMutate = vi.fn();
const colorMutate = vi.fn();
const deleteMutate = vi.fn(
  (_id: number, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.()
);

vi.mock("../../../hooks/useTags", () => ({
  useTags: () => ({
    data: [
      { id: 1, name: "Serif", color: "blue" },
      { id: 2, name: "Display", color: "red" },
    ],
  }),
  useCreateTag: () => ({ mutate: createMutate, isPending: false }),
  useRenameTag: () => ({ mutate: renameMutate, isPending: false }),
  useUpdateTagColor: () => ({ mutate: colorMutate, isPending: false }),
  useDeleteTag: () => ({ mutate: deleteMutate, isPending: false }),
}));

beforeEach(() => {
  createMutate.mockClear();
  renameMutate.mockClear();
  colorMutate.mockClear();
  deleteMutate.mockClear();
  useAppStore.setState({ libraryQuery: EMPTY_FONT_QUERY });
});

describe("TagManager", () => {
  it("renders nothing when closed", () => {
    render(<TagManager open={false} onClose={() => {}} />);
    expect(screen.queryByText("Serif")).not.toBeInTheDocument();
  });

  it("lists all tags", () => {
    render(<TagManager open onClose={() => {}} />);
    expect(screen.getByText("Serif")).toBeInTheDocument();
    expect(screen.getByText("Display")).toBeInTheDocument();
  });

  it("creates a tag with the next cycled palette color", () => {
    render(<TagManager open onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("New tag..."), {
      target: { value: "Sans" },
    });
    fireEvent.click(screen.getByText("Add"));
    expect(createMutate).toHaveBeenCalledTimes(1);
    // 2 existing tags -> third palette slot ("green")
    expect(createMutate.mock.calls[0][0]).toEqual({ name: "Sans", color: "green" });
  });

  it("does not create a duplicate name (case-insensitive)", () => {
    render(<TagManager open onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("New tag..."), {
      target: { value: "serif" },
    });
    fireEvent.click(screen.getByText("Add"));
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("deletes only after a confirm step and resets the active tag filter", () => {
    useAppStore.setState({ libraryQuery: { ...EMPTY_FONT_QUERY, tagId: 2 } });
    render(<TagManager open onClose={() => {}} />);
    // First click arms the confirm state — nothing deleted yet.
    fireEvent.click(screen.getByLabelText("Delete tag Display"));
    expect(deleteMutate).not.toHaveBeenCalled();
    // Second click — the armed state is announced in the accessible name.
    fireEvent.click(screen.getByLabelText("Delete? Display"));
    expect(deleteMutate).toHaveBeenCalledTimes(1);
    expect(deleteMutate.mock.calls[0][0]).toBe(2);
    // Deleted tag was the active filter -> reset to null.
    expect(useAppStore.getState().libraryQuery.tagId).toBeNull();
  });

  it("keeps an unrelated active tag filter on delete", () => {
    useAppStore.setState({ libraryQuery: { ...EMPTY_FONT_QUERY, tagId: 2 } });
    render(<TagManager open onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText("Delete tag Serif"));
    fireEvent.click(screen.getByLabelText("Delete? Serif"));
    expect(deleteMutate.mock.calls[0][0]).toBe(1);
    expect(useAppStore.getState().libraryQuery.tagId).toBe(2);
  });

  it("renames a tag inline on Enter", () => {
    render(<TagManager open onClose={() => {}} />);
    fireEvent.click(screen.getByText("Serif"));
    const input = screen.getByLabelText("Rename tag");
    fireEvent.change(input, { target: { value: "Serifs" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(renameMutate).toHaveBeenCalledTimes(1);
    expect(renameMutate.mock.calls[0][0]).toEqual({ id: 1, name: "Serifs" });
  });

  it("cycles a tag's color to the next palette entry", () => {
    render(<TagManager open onClose={() => {}} />);
    // "blue" is palette slot 0 -> next is "purple".
    fireEvent.click(screen.getByLabelText("Change color Serif"));
    expect(colorMutate).toHaveBeenCalledTimes(1);
    expect(colorMutate.mock.calls[0][0]).toEqual({ id: 1, color: "purple" });
  });
});
