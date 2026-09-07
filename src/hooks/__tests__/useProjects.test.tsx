import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getDb } from "../../db";
import {
  useProjects,
  useProject,
  useCreateProject,
  useRenameProject,
  useDeleteProject,
  useProjectFontIds,
  useAddFontsToProject,
  useRemoveFontFromProject,
  useSetProjectArtwork,
  useSaveProjectGraph,
  type ProjectRow,
} from "../useProjects";

vi.mock("../../db", () => ({ getDb: vi.fn() }));

const mockDb = { select: vi.fn(), execute: vi.fn() };

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { wrapper, qc };
}

const row: ProjectRow = {
  id: 1,
  name: "Poster A",
  artwork_path: null,
  graph_json: "{}",
  created_at: "2026-09-07 10:00:00",
  updated_at: "2026-09-07 10:00:00",
};

beforeEach(() => {
  mockDb.select.mockReset();
  mockDb.execute.mockReset().mockResolvedValue(undefined);
  vi.mocked(getDb).mockResolvedValue(mockDb as never);
});

describe("useProjects / useProject queries", () => {
  it("lists projects ordered by updated_at DESC", async () => {
    mockDb.select.mockResolvedValue([row]);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProjects(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDb.select).toHaveBeenCalledWith(
      "SELECT * FROM projects ORDER BY updated_at DESC"
    );
    expect(result.current.data).toEqual([row]);
  });

  it("fetches a single project by id with a bound param", async () => {
    mockDb.select.mockResolvedValue([row]);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProject(1), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDb.select).toHaveBeenCalledWith(
      "SELECT * FROM projects WHERE id = $1",
      [1]
    );
    expect(result.current.data).toEqual(row);
  });

  it("returns null when the project id does not exist", async () => {
    mockDb.select.mockResolvedValue([]);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProject(99), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe("project CRUD mutations", () => {
  it("creates a project with a parameterized INSERT and invalidates ['projects']", async () => {
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateProject(), { wrapper });
    result.current.mutate("Poster A");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDb.execute).toHaveBeenCalledWith(
      "INSERT INTO projects (name) VALUES ($1)",
      ["Poster A"]
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["projects"] });
  });

  it("renames a project and touches updated_at", async () => {
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useRenameProject(), { wrapper });
    result.current.mutate({ id: 3, name: "Poster B" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDb.execute).toHaveBeenCalledWith(
      "UPDATE projects SET name = $2, updated_at = datetime('now') WHERE id = $1",
      [3, "Poster B"]
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["projects"] });
  });

  it("deletes child project_fonts rows before the project row", async () => {
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteProject(), { wrapper });
    result.current.mutate(3);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDb.execute).toHaveBeenNthCalledWith(
      1,
      "DELETE FROM project_fonts WHERE project_id = $1",
      [3]
    );
    expect(mockDb.execute).toHaveBeenNthCalledWith(
      2,
      "DELETE FROM projects WHERE id = $1",
      [3]
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["projects"] });
  });
});

describe("project fonts", () => {
  it("selects font ids for a project and maps to number[]", async () => {
    mockDb.select.mockResolvedValue([{ font_id: 4 }, { font_id: 9 }]);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProjectFontIds(7), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDb.select).toHaveBeenCalledWith(
      "SELECT font_id FROM project_fonts WHERE project_id = $1",
      [7]
    );
    expect(result.current.data).toEqual([4, 9]);
  });

  it("bulk-adds fonts in ONE statement with a VALUES row per font, all bound", async () => {
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useAddFontsToProject(), { wrapper });
    result.current.mutate({ projectId: 7, fontIds: [1, 2, 3] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDb.execute).toHaveBeenCalledTimes(1);
    expect(mockDb.execute).toHaveBeenCalledWith(
      "INSERT OR IGNORE INTO project_fonts (font_id, project_id) VALUES ($2, $1), ($3, $1), ($4, $1)",
      [7, 1, 2, 3]
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["project-fonts", 7] });
  });

  it("does not execute anything for an empty fontIds array", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAddFontsToProject(), { wrapper });
    result.current.mutate({ projectId: 7, fontIds: [] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it("removes one font with a parameterized DELETE", async () => {
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useRemoveFontFromProject(), { wrapper });
    result.current.mutate({ projectId: 7, fontId: 4 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDb.execute).toHaveBeenCalledWith(
      "DELETE FROM project_fonts WHERE project_id = $1 AND font_id = $2",
      [7, 4]
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["project-fonts", 7] });
  });
});

describe("artwork and graph", () => {
  it("sets artwork_path, touches updated_at, invalidates list and detail keys", async () => {
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSetProjectArtwork(), { wrapper });
    result.current.mutate({ id: 5, path: "/posters/a.png" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDb.execute).toHaveBeenCalledWith(
      "UPDATE projects SET artwork_path = $2, updated_at = datetime('now') WHERE id = $1",
      [5, "/posters/a.png"]
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["projects"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["projects", 5] });
  });

  it("saves the graph and invalidates only the detail key", async () => {
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSaveProjectGraph(), { wrapper });
    result.current.mutate({ id: 5, graphJson: '{"nodes":[]}' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDb.execute).toHaveBeenCalledWith(
      "UPDATE projects SET graph_json = $2, updated_at = datetime('now') WHERE id = $1",
      [5, '{"nodes":[]}']
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["projects", 5] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["projects"] });
  });
});
