import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDb } from "../db";

export type ProjectRow = {
  id: number;
  name: string;
  artwork_path: string | null;
  graph_json: string;
  created_at: string;
  updated_at: string;
};

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async (): Promise<ProjectRow[]> => {
      const db = await getDb();
      return db.select<ProjectRow[]>("SELECT * FROM projects ORDER BY updated_at DESC");
    },
  });
}

export function useProject(id: number) {
  return useQuery({
    queryKey: ["projects", id],
    queryFn: async (): Promise<ProjectRow | null> => {
      const db = await getDb();
      const rows = await db.select<ProjectRow[]>(
        "SELECT * FROM projects WHERE id = $1",
        [id]
      );
      return rows[0] ?? null;
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const db = await getDb();
      await db.execute("INSERT INTO projects (name) VALUES ($1)", [name]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useRenameProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const db = await getDb();
      await db.execute(
        "UPDATE projects SET name = $2, updated_at = datetime('now') WHERE id = $1",
        [id, name]
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const db = await getDb();
      // Explicit child delete first: don't rely on the FK cascade being
      // enforced on the plugin's pooled connections (PRAGMA foreign_keys
      // is per-connection) — same rationale as useDeleteTag.
      await db.execute("DELETE FROM project_fonts WHERE project_id = $1", [id]);
      await db.execute("DELETE FROM projects WHERE id = $1", [id]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useProjectFontIds(projectId: number) {
  return useQuery({
    queryKey: ["project-fonts", projectId],
    queryFn: async (): Promise<number[]> => {
      const db = await getDb();
      const rows = await db.select<{ font_id: number }[]>(
        "SELECT font_id FROM project_fonts WHERE project_id = $1",
        [projectId]
      );
      return rows.map((r) => r.font_id);
    },
  });
}

/**
 * Bulk-add fonts to a project in ONE statement: a VALUES row per font id,
 * every value bound as a $ parameter (SQLite numbered params may repeat, so
 * $1 carries the project id for every row — no id is ever interpolated).
 * Mirrors useAssignTagBulk in useTags.ts.
 */
export function useAddFontsToProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, fontIds }: { projectId: number; fontIds: number[] }) => {
      if (fontIds.length === 0) return;
      const db = await getDb();
      const values = fontIds.map((_, i) => `($${i + 2}, $1)`).join(", ");
      await db.execute(
        `INSERT OR IGNORE INTO project_fonts (font_id, project_id) VALUES ${values}`,
        [projectId, ...fontIds]
      );
    },
    onSuccess: (_data, { projectId }) =>
      qc.invalidateQueries({ queryKey: ["project-fonts", projectId] }),
  });
}

export function useRemoveFontFromProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, fontId }: { projectId: number; fontId: number }) => {
      const db = await getDb();
      await db.execute(
        "DELETE FROM project_fonts WHERE project_id = $1 AND font_id = $2",
        [projectId, fontId]
      );
    },
    onSuccess: (_data, { projectId }) =>
      qc.invalidateQueries({ queryKey: ["project-fonts", projectId] }),
  });
}

export function useSetProjectArtwork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, path }: { id: number; path: string }) => {
      const db = await getDb();
      await db.execute(
        "UPDATE projects SET artwork_path = $2, updated_at = datetime('now') WHERE id = $1",
        [id, path]
      );
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["projects", id] });
    },
  });
}

export function useSaveProjectGraph() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, graphJson }: { id: number; graphJson: string }) => {
      const db = await getDb();
      await db.execute(
        "UPDATE projects SET graph_json = $2, updated_at = datetime('now') WHERE id = $1",
        [id, graphJson]
      );
    },
    // Graph saves are frequent; only the detail row changed materially —
    // don't refetch the whole list on every editor save.
    onSuccess: (_data, { id }) =>
      qc.invalidateQueries({ queryKey: ["projects", id] }),
  });
}

/** Distinct font families in the project — the Text operator's font
 *  list (D3). */
export function useProjectFontFamilies(projectId: number) {
  return useQuery({
    queryKey: ["projects", projectId, "font-families"],
    queryFn: async (): Promise<string[]> => {
      const db = await getDb();
      const rows = await db.select<{ family: string }[]>(
        "SELECT DISTINCT f.family FROM fonts f JOIN project_fonts pf ON pf.font_id = f.id WHERE pf.project_id = $1 ORDER BY f.family",
        [projectId]
      );
      return rows.map((r) => r.family);
    },
  });
}

/** Font FILE path per family (first style wins) — FontFace loading for
 *  the text rasterizer (#411). */
export function useProjectFontPaths(projectId: number) {
  return useQuery({
    queryKey: ["projects", projectId, "font-paths"],
    queryFn: async (): Promise<Record<string, string>> => {
      const db = await getDb();
      const rows = await db.select<{ family: string; path: string }[]>(
        "SELECT f.family, MIN(f.path) AS path FROM fonts f JOIN project_fonts pf ON pf.font_id = f.id WHERE pf.project_id = $1 GROUP BY f.family",
        [projectId]
      );
      return Object.fromEntries(rows.map((r) => [r.family, r.path]));
    },
  });
}
