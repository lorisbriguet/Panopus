import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BulkBar } from "../BulkBar";
import { useAppStore } from "../../../stores/app-store";

const mutate = vi.fn();
vi.mock("../../../hooks/useActivation", () => ({
  useSetActive: () => ({ mutate, isPending: false }),
}));

// BulkBar's tag menu pulls these react-query hooks; mock the module so the
// bar renders without a QueryClient (menu behavior is covered in bulktag).
vi.mock("../../../hooks/useTags", () => ({
  useTags: () => ({ data: [] }),
  useAssignTagBulk: () => ({ mutate: vi.fn(), isPending: false }),
  useUnassignTagBulk: () => ({ mutate: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  mutate.mockClear();
  useAppStore.setState({ selectedIds: new Set<number>() });
});

describe("BulkBar", () => {
  it("renders nothing when the selection is empty", () => {
    const { container } = render(<BulkBar />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Activate")).not.toBeInTheDocument();
  });

  it("shows the selection count", () => {
    useAppStore.setState({ selectedIds: new Set([1, 2, 3]) });
    render(<BulkBar />);
    expect(screen.getByText("3 selected")).toBeInTheDocument();
  });

  it("activates all selected ids", () => {
    useAppStore.setState({ selectedIds: new Set([1, 2, 3]) });
    render(<BulkBar />);
    fireEvent.click(screen.getByText("Activate"));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ ids: [1, 2, 3], active: true });
  });

  it("deactivates all selected ids", () => {
    useAppStore.setState({ selectedIds: new Set([1, 2, 3]) });
    render(<BulkBar />);
    fireEvent.click(screen.getByText("Deactivate"));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ ids: [1, 2, 3], active: false });
  });

  it("clears the selection (and hides itself)", () => {
    useAppStore.setState({ selectedIds: new Set([1, 2, 3]) });
    render(<BulkBar />);
    fireEvent.click(screen.getByText("Clear selection"));
    expect(useAppStore.getState().selectedIds).toEqual(new Set());
    expect(screen.queryByText("Activate")).not.toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });
});

describe("selection store actions", () => {
  it("toggleSelected adds then removes an id", () => {
    useAppStore.getState().toggleSelected(7);
    expect(useAppStore.getState().selectedIds).toEqual(new Set([7]));
    useAppStore.getState().toggleSelected(7);
    expect(useAppStore.getState().selectedIds).toEqual(new Set());
  });

  it("selectMany replaces the selection with the given ids", () => {
    useAppStore.setState({ selectedIds: new Set([9]) });
    useAppStore.getState().selectMany([1, 2, 3]);
    expect(useAppStore.getState().selectedIds).toEqual(new Set([1, 2, 3]));
  });

  it("allocates a NEW Set on toggle so subscribers see an identity change", () => {
    useAppStore.setState({ selectedIds: new Set([1]) });
    const before = useAppStore.getState().selectedIds;
    useAppStore.getState().toggleSelected(2);
    expect(useAppStore.getState().selectedIds).not.toBe(before);
  });
});
