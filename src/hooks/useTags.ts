import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDb } from "../db";
import type { TagColorName } from "../lib/tagColors";

export type TagRow = { id: number; name: string; color: string };

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: async (): Promise<TagRow[]> => {
      const db = await getDb();
      return db.select<TagRow[]>("SELECT * FROM tags ORDER BY name");
    },
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color?: TagColorName }) => {
      const db = await getDb();
      await db.execute("INSERT INTO tags (name, color) VALUES ($1, $2)", [
        name,
        color ?? "blue",
      ]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });
}

export function useRenameTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const db = await getDb();
      await db.execute("UPDATE tags SET name = $2 WHERE id = $1", [id, name]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const db = await getDb();
      // Explicit child delete first: don't rely on the FK cascade being
      // enforced on the plugin's pooled connections (PRAGMA foreign_keys
      // is per-connection).
      await db.execute("DELETE FROM font_tags WHERE tag_id = $1", [id]);
      await db.execute("DELETE FROM tags WHERE id = $1", [id]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      // fonts rows aggregate tag_ids — a deleted tag changes them too
      qc.invalidateQueries({ queryKey: ["fonts"] });
    },
  });
}

export function useAssignTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fontId, tagId }: { fontId: number; tagId: number }) => {
      const db = await getDb();
      await db.execute(
        "INSERT OR IGNORE INTO font_tags (font_id, tag_id) VALUES ($1, $2)",
        [fontId, tagId]
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fonts"] }),
  });
}

export function useUnassignTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fontId, tagId }: { fontId: number; tagId: number }) => {
      const db = await getDb();
      await db.execute("DELETE FROM font_tags WHERE font_id = $1 AND tag_id = $2", [
        fontId,
        tagId,
      ]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fonts"] }),
  });
}
