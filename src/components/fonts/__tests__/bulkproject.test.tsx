import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BulkBar } from "../BulkBar";
import { useAppStore } from "../../../stores/app-store";
import type { ProjectRow } from "../../../hooks/useProjects";

vi.mock("../../../hooks/useActivation", () => ({
  useSetActive: () => ({ mutate: vi.fn(), isPending: false }),
}));

// The tag menu pulls react-query hooks; mock the module so the bar renders
// without a QueryClient (tag menu behavior is covered in bulktag).
vi.mock("../../../hooks/useTags", () => ({
  useTags: () => ({ data: [] }),
  useAssignTagBulk: () => ({ mutate: vi.fn(), isPending: false }),
  useUnassignTagBulk: () => ({ mutate: vi.fn(), isPending: false }),
}));

function makeProject(id: number, name: string): ProjectRow {
  return {
    id,
    name,
    artwork_path: null,
    graph_json: "{}",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };
}

let projects: ProjectRow[] = [];
const addMutate = vi.fn();
vi.mock("../../../hooks/useProjects", () => ({
  useProjects: () => ({ data: projects }),
  useAddFontsToProject: () => ({ mutate: addMutate, isPending: false }),
}));

beforeEach(() => {
  addMutate.mockClear();
  projects = [makeProject(7, "Rebrand"), makeProject(9, "Poster Series")];
  useAppStore.setState({ selectedIds: new Set([1, 2, 3]) });
});

describe("BulkBar project menu", () => {
  it("opens the menu and lists all project names", () => {
    render(<BulkBar />);
    fireEvent.click(screen.getByText("Project"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Rebrand/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Poster Series/ })).toBeInTheDocument();
  });

  it("clicking a project adds every selected font id to it and keeps the selection", () => {
    render(<BulkBar />);
    fireEvent.click(screen.getByText("Project"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Rebrand/ }));
    expect(addMutate).toHaveBeenCalledTimes(1);
    expect(addMutate).toHaveBeenCalledWith({ projectId: 7, fontIds: [1, 2, 3] });
    // Selection is KEPT (bar philosophy) and the menu stays open for chaining.
    expect(useAppStore.getState().selectedIds).toEqual(new Set([1, 2, 3]));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("shows an empty state when there are no projects", () => {
    projects = [];
    render(<BulkBar />);
    fireEvent.click(screen.getByText("Project"));
    expect(screen.getByText("No projects yet")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("closes the menu on Escape", () => {
    render(<BulkBar />);
    fireEvent.click(screen.getByText("Project"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
