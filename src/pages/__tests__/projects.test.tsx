import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProjectsPage } from "../ProjectsPage";
import { ProjectDetailPage } from "../ProjectDetailPage";
import type { FontRow } from "../../lib/fontFilters";
import type { ProjectRow } from "../../hooks/useProjects";

const createMutate = vi.fn();
const deleteMutate = vi.fn();
const renameMutate = vi.fn();
const removeMutate = vi.fn();

const mockProjects: ProjectRow[] = [
  {
    id: 1,
    name: "Brand Refresh",
    artwork_path: null,
    graph_json: "{}",
    created_at: "2026-09-01 10:00:00",
    updated_at: "2026-09-02 10:00:00",
  },
  {
    id: 2,
    name: "Poster Series",
    artwork_path: null,
    graph_json: "{}",
    created_at: "2026-09-01 09:00:00",
    updated_at: "2026-09-01 09:00:00",
  },
];

// The full Task-2 hook surface the two pages consume — mutations expose
// spy mutates so the tests can assert the exact payloads.
vi.mock("../../hooks/useProjects", () => ({
  useProjects: () => ({ data: mockProjects, isLoading: false }),
  useProject: (id: number) => ({
    data: mockProjects.find((p) => p.id === id) ?? null,
    isLoading: false,
  }),
  useCreateProject: () => ({ mutate: createMutate, isPending: false }),
  useRenameProject: () => ({ mutate: renameMutate, isPending: false }),
  useDeleteProject: () => ({ mutate: deleteMutate, isPending: false }),
  useProjectFontIds: () => ({ data: [1], isLoading: false }),
  useRemoveFontFromProject: () => ({ mutate: removeMutate, isPending: false }),
}));

const mockFontRows: FontRow[] = [
  {
    id: 1,
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
  },
  {
    id: 2,
    path: "/lib/Beta.otf",
    family: "Beta",
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

// useToggleFavorite: FontListRow (rendered by the detail page) calls it.
vi.mock("../../hooks/useFonts", () => ({
  useFonts: () => ({ data: mockFontRows, isLoading: false }),
  useToggleFavorite: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../hooks/useActivation", () => ({
  useSetActive: () => ({ mutate: vi.fn(), isPending: false }),
}));

function renderList() {
  return render(
    <MemoryRouter>
      <ProjectsPage />
    </MemoryRouter>
  );
}

function renderDetail(id = 1) {
  return render(
    <MemoryRouter initialEntries={[`/projects/${id}`]}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProjectsPage", () => {
  it("renders every project as a link to its detail page", () => {
    renderList();
    expect(screen.getByRole("link", { name: "Brand Refresh" })).toHaveAttribute(
      "href",
      "/projects/1"
    );
    expect(screen.getByRole("link", { name: "Poster Series" })).toHaveAttribute(
      "href",
      "/projects/2"
    );
  });

  it("creates a project from the trimmed input value", () => {
    renderList();
    fireEvent.change(screen.getByPlaceholderText(/new project name/i), {
      target: { value: "  Launch Kit  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0]?.[0]).toBe("Launch Kit");
  });

  it("does not create when the input is empty", () => {
    renderList();
    expect(screen.getByRole("button", { name: /^create$/i })).toBeDisabled();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("deletes only on the second (confirming) click — TagManager pattern", () => {
    renderList();
    // First click arms the row: nothing deleted, the label flips to confirm.
    fireEvent.click(
      screen.getByRole("button", { name: "Delete project Brand Refresh" })
    );
    expect(deleteMutate).not.toHaveBeenCalled();
    // Second click on the armed button performs the delete.
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm delete Brand Refresh" })
    );
    expect(deleteMutate).toHaveBeenCalledWith(1);
  });
});

describe("ProjectDetailPage", () => {
  it("renders the project name and only ITS fonts' family names", () => {
    renderDetail(1);
    expect(screen.getByText("Brand Refresh")).toBeInTheDocument();
    // useProjectFontIds → [1]: Alpha is in the project, Beta is not.
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });

  it("remove button calls useRemoveFontFromProject with {projectId, fontId}", () => {
    renderDetail(1);
    fireEvent.click(
      screen.getByRole("button", { name: /remove from project.*Alpha/i })
    );
    expect(removeMutate).toHaveBeenCalledWith({ projectId: 1, fontId: 1 });
  });
});
