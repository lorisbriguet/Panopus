import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { getLabels } from "../lib/notifyError";
import { logError } from "../lib/log";

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
  return useMutation({
    mutationFn: ({ ids, active }: { ids: number[]; active: boolean }) =>
      invoke<FontActivationResult[]>("set_fonts_active", { ids, active }),
    onSuccess: (results, { active }) => {
      const failed = results.filter((r) => !r.ok);
      if (failed.length === 0) return;
      const t = getLabels();
      const template = active ? t.activation_partial_failed : t.deactivation_partial_failed;
      toast.error(template.replace("{count}", String(failed.length)));
      logError(
        "set_fonts_active partial failure:",
        failed.map((f) => `${f.id}: ${f.error ?? "unknown"}`).join("; ")
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["fonts"] }),
  });
}
