import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProjectsPage } from "../ProjectsPage";
import { ProjectDetailPage } from "../ProjectDetailPage";
import type { FontRow } from "../../lib/fontFilters";
import type { ProjectRow } from "../../hooks/useProjects";

const createMutate = vi.fn();
const deleteMutate = vi.fn();
const renameMutate = vi.fn();
const removeMutate = vi.fn();
const setArtworkMutate = vi.fn();
const saveGraphMutate = vi.fn();
const addFontsMutate = vi.fn();

// invoke (the read_artwork_bytes liveness probe) and open (the artwork file
// picker) both live in the shared src/__mocks__/tauri-api.ts stub — the
// vitest alias maps @tauri-apps/api/core AND @tauri-apps/plugin-dialog to
// that ONE file, so both vi.mock registrations below hit the same resolved
// module. The single shared factory overrides both names on top of the
// original stub (convertFileSrc etc. stay intact for FontListRow); using
// one factory for both specifiers keeps the setup correct whichever
// registration vitest keeps.
const tauriMocks = vi.hoisted(() => {
  const invokeMock = vi.fn<(cmd: string, args?: unknown) => Promise<unknown>>();
  const openMock = vi.fn<() => Promise<string | null>>();
  const factory = async (
    importOriginal: () => Promise<Record<string, unknown>>
  ) => ({
    ...(await importOriginal()),
    invoke: invokeMock,
    open: openMock,
  });
  return { invokeMock, openMock, factory };
});
vi.mock("@tauri-apps/api/core", tauriMocks.factory);
vi.mock("@tauri-apps/plugin-dialog", tauriMocks.factory);
const { invokeMock, openMock } = tauriMocks;

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
  {
    id: 3,
    name: "Album Cover",
    artwork_path: "/art/poster.png",
    graph_json: "{}",
    created_at: "2026-09-01 08:00:00",
    updated_at: "2026-09-01 08:00:00",
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
  useSetProjectArtwork: () => ({ mutate: setArtworkMutate, isPending: false }),
  useSaveProjectGraph: () => ({ mutate: saveGraphMutate, isPending: false }),
  useProjectFontFamilies: () => ({ data: [], isLoading: false }),
  useProjectFontPaths: () => ({ data: {}, isLoading: false }),
  useAddFontsToProject: () => ({ mutate: addFontsMutate, isPending: false }),
}));

vi.mock("../../hooks/useRecipes", () => ({
  useRecipes: () => ({ data: [], isLoading: false }),
  useCreateRecipe: () => ({ mutate: vi.fn(), isPending: false }),
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

// Reassignable so individual tests can vary the library (e.g. the zero-
// others exclusive case); reset to the default in beforeEach. The factory
// closure reads it lazily at render time, so hoisting is not an issue.
let fontRowsData: FontRow[] = mockFontRows;

// useToggleFavorite: FontListRow (rendered by the detail page) calls it.
vi.mock("../../hooks/useFonts", () => ({
  useFonts: () => ({ data: fontRowsData, isLoading: false }),
  useToggleFavorite: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Auto-succeeding mutate: immediately runs the options onSuccess so the
// exclusive flow's chained second mutation lands in the same call log —
// mock.calls order IS the mutation order the page issued.
const setActiveMutate = vi.fn(
  (
    _vars: { ids: number[]; active: boolean },
    opts?: { onSuccess?: () => void }
  ) => opts?.onSuccess?.()
);
vi.mock("../../hooks/useActivation", () => ({
  useSetActive: () => ({ mutate: setActiveMutate, isPending: false }),
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
  // clearAllMocks wipes calls but keeps implementations (setActiveMutate's
  // auto-onSuccess survives); resetAllMocks would destroy it.
  vi.clearAllMocks();
  fontRowsData = mockFontRows;
  // Re-assert defaults every test: clearAllMocks keeps implementations, so
  // a test's mockRejectedValue would otherwise leak into the next one.
  invokeMock.mockResolvedValue(new ArrayBuffer(0));
  openMock.mockResolvedValue(null);
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

describe("ProjectDetailPage activation (Task 5)", () => {
  it("Activate fonts calls setActive with the project's font ids", () => {
    renderDetail(1);
    fireEvent.click(screen.getByRole("button", { name: "Activate fonts" }));
    expect(setActiveMutate).toHaveBeenCalledTimes(1);
    expect(setActiveMutate.mock.calls[0]?.[0]).toEqual({
      ids: [1],
      active: true,
    });
  });

  it("Activate exclusively opens a confirm modal (no mutation yet) with the count", () => {
    renderDetail(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Activate exclusively" })
    );
    expect(setActiveMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Beta (id 2) is the single other active non-system font → _one variant.
    expect(
      screen.getByText("1 other active font will be deactivated")
    ).toBeInTheDocument();
  });

  it("confirming deactivates the others THEN activates the project's fonts", () => {
    renderDetail(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Activate exclusively" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    // Auto-onSuccess mock chains synchronously — the call log is the order.
    expect(setActiveMutate.mock.calls.map((c) => c[0])).toEqual([
      { ids: [2], active: false },
      { ids: [1], active: true },
    ]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("skips the deactivate call (and the modal) when no other fonts are active", () => {
    fontRowsData = mockFontRows.map((f) =>
      f.id === 2 ? { ...f, active: 0 } : f
    );
    renderDetail(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Activate exclusively" })
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(setActiveMutate.mock.calls.map((c) => c[0])).toEqual([
      { ids: [1], active: true },
    ]);
  });
});

describe("ProjectDetailPage artwork (Task 6)", () => {
  // The picker lives in the Finish tab's Source operator now: open the
  // Finish tab, then drive selection through the xyflow mock's parked
  // onNodesChange (the default graph's source node id is "src").
  const openSourceParams = async () => {
    fireEvent.click(screen.getByRole("tab", { name: "Finish" }));
    const props = (globalThis as Record<string, unknown>).__xyflowProps as {
      onNodesChange: (changes: unknown[]) => void;
    };
    act(() => {
      props.onNodesChange([{ type: "select", id: "src", selected: true }]);
    });
    await screen.findByRole("button", { name: "Choose artwork..." });
  };

  it("picker sends the chosen path to useSetProjectArtwork with image filters", async () => {
    openMock.mockResolvedValue("/art/new-piece.tiff");
    renderDetail(1);
    await openSourceParams();
    fireEvent.click(screen.getByRole("button", { name: "Choose artwork..." }));
    await waitFor(() =>
      expect(setArtworkMutate).toHaveBeenCalledWith({
        id: 1,
        path: "/art/new-piece.tiff",
      })
    );
    expect(openMock).toHaveBeenCalledWith({
      filters: [{ name: "Image", extensions: ["png", "tif", "tiff"] }],
    });
  });

  it("does not mutate when the picker is cancelled (null)", async () => {
    renderDetail(1);
    await openSourceParams();
    fireEvent.click(screen.getByRole("button", { name: "Choose artwork..." }));
    // Flush the resolved-null picker promise before asserting the negative.
    await waitFor(() => expect(openMock).toHaveBeenCalledTimes(1));
    expect(setArtworkMutate).not.toHaveBeenCalled();
  });

  it("shows the artwork file name in the Source operator after a successful probe", async () => {
    renderDetail(3);
    await openSourceParams();
    expect(await screen.findByText("poster.png")).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("read_artwork_bytes", {
      path: "/art/poster.png",
    });
    expect(screen.queryByText(/artwork file not found/i)).not.toBeInTheDocument();
  });

  it("shows the relink prompt when read_artwork_bytes rejects", async () => {
    invokeMock.mockRejectedValue("failed to read artwork");
    renderDetail(3);
    await openSourceParams();
    expect(
      await screen.findByText(/artwork file not found/i)
    ).toBeInTheDocument();
    // The re-pick affordance is the same picker button.
    expect(
      screen.getByRole("button", { name: "Choose artwork..." })
    ).toBeInTheDocument();
  });

  it("renders a functional Finish tab when artwork is set", async () => {
    renderDetail(3);
    const finishTab = await screen.findByRole("tab", { name: "Finish" });
    expect(finishTab).toBeInTheDocument();
    // Tab is now functional (Task 10), not inert
    expect(finishTab).not.toHaveAttribute("aria-disabled");
  });

  it("shows the Finish tab without artwork but skips the probe", () => {
    renderDetail(1);
    expect(screen.getByRole("tab", { name: "Finish" })).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe("ProjectDetailPage add fonts (#404)", () => {
  it("adds a library font from the Fonts tab modal", async () => {
    renderDetail(1);
    fireEvent.click(screen.getByRole("button", { name: "Add fonts..." }));
    const search = await screen.findByLabelText("Search fonts...");
    fireEvent.change(search, { target: { value: "beta" } });
    // mockFontRows: font id 1 (Alpha) is IN the project; Beta is not
    const row = await screen.findByRole("button", { name: /Beta/ });
    fireEvent.click(row);
    await waitFor(() =>
      expect(addFontsMutate).toHaveBeenCalledWith({
        projectId: 1,
        fontIds: [expect.any(Number)],
      })
    );
  });
});
