import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { getLabels } from "../lib/notifyError";
import { logError } from "../lib/log";
import type { FontRow } from "../lib/fontFilters";

/** Per-font outcome of `set_fonts_active` (mirrors Rust FontActivationResult). */
export type FontActivationResult = {
  id: number;
  ok: boolean;
  error: string | null;
};

/**
 * Activate/deactivate fonts via CoreText. The Rust side mirrors ONLY
 * confirmed outcomes into fonts.active, so we invalidate on settle
 * (success OR failure) to re-read the truthful DB state either way.
 *
 * Partial failures (the command succeeds but some ids come back ok:false)
 * are surfaced with a counted toast — direct toast.error, NOT notifyError,
 * because the interpolated count would grow its dedupe map (see the pruning
 * caveat in notifyError.ts). Never throws: consumers keep using .mutate().
 */
export function useSetActive() {
  const qc = useQueryClient();
  // Optimistic flip: the ["fonts"] master query takes seconds on a large
  // library, so waiting for the settle refetch makes a SUCCESSFUL
  // activation look dead. System rows are never patched — their active
  // state is macOS's, not ours (isFontActive derives it).
  const patchFonts = (ids: number[], active: 0 | 1) =>
    qc.setQueryData<FontRow[]>(["fonts"], (rows) =>
      rows?.map((r) =>
        ids.includes(r.id) && r.is_system !== 1 ? { ...r, active } : r
      )
    );
  return useMutation({
    mutationFn: ({ ids, active }: { ids: number[]; active: boolean }) =>
      invoke<FontActivationResult[]>("set_fonts_active", { ids, active }),
    onMutate: async ({ ids, active }) => {
      await qc.cancelQueries({ queryKey: ["fonts"] });
      const previous = qc.getQueryData<FontRow[]>(["fonts"]);
      patchFonts(ids, active ? 1 : 0);
      return { previous };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(["fonts"], ctx.previous);
    },
    onSuccess: (results, { active }) => {
      const failed = results.filter((r) => !r.ok);
      if (failed.length === 0) return;
      // Snap the failed ids back now — the settle refetch is too slow to
      // be the thing that corrects the optimistic flip.
      patchFonts(failed.map((f) => f.id), active ? 0 : 1);
      const t = getLabels();
      // Singular/plural template picked by count (font_label convention).
      const template = active
        ? failed.length === 1
          ? t.activation_partial_failed_one
          : t.activation_partial_failed
        : failed.length === 1
          ? t.deactivation_partial_failed_one
          : t.deactivation_partial_failed;
      toast.error(template.replace("{count}", String(failed.length)));
      logError(
        "set_fonts_active partial failure:",
        failed.map((f) => `${f.id}: ${f.error ?? "unknown"}`).join("; ")
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["fonts"] }),
  });
}
