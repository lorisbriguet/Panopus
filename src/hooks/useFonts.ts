import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { getDb } from "../db";
import { logError } from "../lib/log";
import type { FontRow } from "../lib/fontFilters";

export type { FontRow, FontQuery } from "../lib/fontFilters";

async function getFonts(): Promise<FontRow[]> {
  const db = await getDb();
  return db.select<FontRow[]>(
    `SELECT f.*, s.licence_status, COALESCE(group_concat(ft.tag_id),'') tag_ids
     FROM fonts f
     JOIN sources s ON s.name = f.source
     LEFT JOIN font_tags ft ON ft.font_id = f.id
     WHERE f.quarantined = 0
     GROUP BY f.id
     ORDER BY f.family, f.style`
  );
}

export function useFonts() {
  return useQuery({ queryKey: ["fonts"], queryFn: getFonts });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, favorite }: { id: number; favorite: 0 | 1 }) => {
      const db = await getDb();
      await db.execute("UPDATE fonts SET favorite = $2 WHERE id = $1", [id, favorite]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fonts"] }),
  });
}

/**
 * Global listener for the Rust watcher's `library-changed` event (emitted
 * after a debounced re-index): invalidates the fonts query so every open
 * view refreshes. Mount ONCE at app level (StartupChecks in App.tsx),
 * alongside the other global listeners.
 */
export function useLibraryChanged() {
  const qc = useQueryClient();
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen("library-changed", () => {
      qc.invalidateQueries({ queryKey: ["fonts"] });
    })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch((e) => logError("Failed to register library-changed listener:", e));
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [qc]);
}
