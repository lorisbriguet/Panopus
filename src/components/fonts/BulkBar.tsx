import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "../ui/Button";
import { useSetActive } from "../../hooks/useActivation";
import { useAssignTagBulk, useTags, useUnassignTagBulk } from "../../hooks/useTags";
import type { FontRow } from "../../lib/fontFilters";
import { getStoredTagColor } from "../../lib/tagColors";
import { useAppStore } from "../../stores/app-store";
import { useT } from "../../i18n/useT";

interface BulkBarProps {
  /**
   * The loaded font rows — used to derive per-tag toggle state for the
   * selection (a tag is "checked" when EVERY selected font carries it).
   * Optional so the bar still renders without tag state (e.g. tests).
   */
  rows?: FontRow[];
}

/**
 * Small absolute-positioned tag menu (simpler than ContextMenu — it anchors
 * to its trigger, not the cursor). menuitemcheckbox semantics: checked when
 * every selected font has the tag; toggling assigns/unassigns in bulk. The
 * menu stays open after a toggle so tags can be chained, matching the bar's
 * "selection is kept" philosophy.
 */
function TagMenu({ rows, selectedIds }: { rows: FontRow[]; selectedIds: Set<number> }) {
  const t = useT();
  const darkMode = useAppStore((s) => s.darkMode);
  const { data: tags } = useTags();
  const assignBulk = useAssignTagBulk();
  const unassignBulk = useUnassignTagBulk();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const clickHandler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", clickHandler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", clickHandler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [open]);

  const selectedRows = rows.filter((r) => selectedIds.has(r.id));
  const hasAll = (tagId: number) =>
    selectedRows.length > 0 &&
    selectedRows.every((r) => r.tag_ids.split(",").includes(String(tagId)));

  const pending = assignBulk.isPending || unassignBulk.isPending;

  return (
    <div ref={containerRef} className="relative">
      <Button
        size="sm"
        variant="secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {t.bulk_tag_menu}
      </Button>
      {open && (
        <div
          role="menu"
          aria-label={t.bulk_tag_menu}
          className="absolute right-0 top-full mt-1 z-40 min-w-[10rem] rounded-xl border border-[var(--color-border-header)] bg-[var(--color-surface)] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.4)] animate-in fade-in duration-100"
        >
          {(tags ?? []).length === 0 ? (
            <p className="px-3 py-1.5 text-xs text-muted">{t.no_tags_yet}</p>
          ) : (
            (tags ?? []).map((tag) => {
              const checked = hasAll(tag.id);
              const color = getStoredTagColor(tag.color, darkMode);
              return (
                <button
                  key={tag.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  disabled={pending}
                  onClick={() =>
                    checked
                      ? unassignBulk.mutate({ fontIds: Array.from(selectedIds), tagId: tag.id })
                      : assignBulk.mutate({ fontIds: Array.from(selectedIds), tagId: tag.id })
                  }
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-row)] disabled:opacity-50 outline-none focus-visible:bg-[var(--color-hover-row)]"
                >
                  <span className="w-3.5 shrink-0" aria-hidden="true">
                    {checked && <Check size={12} />}
                  </span>
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: color.text }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 truncate">{tag.name}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Action strip for the library's bulk selection. Renders nothing while the
 * selection is empty. Activate/Deactivate fire ONE `set_fonts_active` call
 * with every selected id; the selection is intentionally KEPT after the
 * mutation settles so the user can chain actions (e.g. activate, proof,
 * deactivate the same set) — "Clear selection" is the explicit way out.
 */
export function BulkBar({ rows = [] }: BulkBarProps) {
  const t = useT();
  const selectedIds = useAppStore((s) => s.selectedIds);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const setActive = useSetActive();

  if (selectedIds.size === 0) return null;

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap rounded-xl bg-accent-light border border-[var(--color-border-divider)] px-4 py-2">
      <span className="text-sm font-medium text-accent tabular-nums">
        {selectedIds.size} {selectedIds.size === 1 ? t.bulk_selected_one : t.bulk_selected}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          loading={setActive.isPending}
          onClick={() => setActive.mutate({ ids: Array.from(selectedIds), active: true })}
        >
          {t.bulk_activate}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={setActive.isPending}
          onClick={() => setActive.mutate({ ids: Array.from(selectedIds), active: false })}
        >
          {t.bulk_deactivate}
        </Button>
        <TagMenu rows={rows} selectedIds={selectedIds} />
        <Button size="sm" variant="ghost" onClick={clearSelection}>
          {t.bulk_clear}
        </Button>
      </div>
    </div>
  );
}
