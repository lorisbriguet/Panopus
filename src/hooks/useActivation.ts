import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

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
 */
export function useSetActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, active }: { ids: number[]; active: boolean }) =>
      invoke<FontActivationResult[]>("set_fonts_active", { ids, active }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["fonts"] }),
  });
}
