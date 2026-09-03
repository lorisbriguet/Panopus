import { Button } from "../ui/Button";
import { useSetActive } from "../../hooks/useActivation";
import { useAppStore } from "../../stores/app-store";
import { useT } from "../../i18n/useT";

/**
 * Action strip for the library's bulk selection. Renders nothing while the
 * selection is empty. Activate/Deactivate fire ONE `set_fonts_active` call
 * with every selected id; the selection is intentionally KEPT after the
 * mutation settles so the user can chain actions (e.g. activate, proof,
 * deactivate the same set) — "Clear selection" is the explicit way out.
 */
export function BulkBar() {
  const t = useT();
  const selectedIds = useAppStore((s) => s.selectedIds);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const setActive = useSetActive();

  if (selectedIds.length === 0) return null;

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap rounded-xl bg-accent-light border border-[var(--color-border-divider)] px-4 py-2">
      <span className="text-sm font-medium text-accent tabular-nums">
        {selectedIds.length} {t.bulk_selected}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          loading={setActive.isPending}
          onClick={() => setActive.mutate({ ids: selectedIds, active: true })}
        >
          {t.bulk_activate}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={setActive.isPending}
          onClick={() => setActive.mutate({ ids: selectedIds, active: false })}
        >
          {t.bulk_deactivate}
        </Button>
        <Button size="sm" variant="ghost" onClick={clearSelection}>
          {t.bulk_clear}
        </Button>
      </div>
    </div>
  );
}
