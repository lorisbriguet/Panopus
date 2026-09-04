import { memo } from "react";
import { ChevronRight } from "lucide-react";
import { FontCard } from "./FontCard";
import { useAppStore } from "../../stores/app-store";
import { useT } from "../../i18n/useT";
import type { FamilyGroup as FamilyGroupData } from "../../lib/familyGroups";

interface FamilyGroupProps {
  group: FamilyGroupData;
  proofText: string;
  proofSize: number;
  /** Passed through to every FontCard, exactly like LibraryPage's flat list. */
  onOpenDetail?: (id: number) => void;
}

/**
 * Foldable family group for the library grid: a slim header (family name,
 * style count, chevron) above either ONE representative card (collapsed —
 * the default, with a "+N styles" pill) or every style card (expanded).
 * Expansion is ephemeral app-store state; the memoized group subscribes to
 * just ITS OWN boolean (Task-10 selectedIds precedent) so toggling one
 * family never re-renders the other ~6'000 rows.
 */
export const FamilyGroup = memo(function FamilyGroup({
  group,
  proofText,
  proofSize,
  onOpenDetail,
}: FamilyGroupProps) {
  const t = useT();
  const expanded = useAppStore((s) => s.expandedFamilies.includes(group.family));
  const toggleFamily = useAppStore((s) => s.toggleFamily);
  // The representative stands in for the rest — hint counts the HIDDEN styles.
  const hiddenCount = group.rows.length - 1;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => toggleFamily(group.family)}
        aria-expanded={expanded}
        aria-label={`${expanded ? t.collapse_family : t.expand_family}: ${group.family}`}
        className="flex items-center gap-2 self-start max-w-full rounded-lg px-1.5 py-1 text-left cursor-pointer focus-accent hover:bg-[var(--color-surface)]"
      >
        <ChevronRight
          size={14}
          className={`shrink-0 text-muted transition-transform ${expanded ? "rotate-90" : ""}`}
          aria-hidden="true"
        />
        <span className="text-sm font-medium truncate">{group.family}</span>
        <span className="shrink-0 text-xs text-muted tabular-nums">
          {group.rows.length} {t.styles_label}
        </span>
      </button>
      {expanded ? (
        group.rows.map((f) => (
          <FontCard
            key={f.id}
            font={f}
            proofText={proofText}
            proofSize={proofSize}
            onOpenDetail={onOpenDetail}
          />
        ))
      ) : (
        <div className="relative">
          <FontCard
            font={group.representative}
            proofText={proofText}
            proofSize={proofSize}
            onOpenDetail={onOpenDetail}
          />
          {/* Decorative hint (the header button is the interactive control);
              pointer-events-none so clicks fall through to the card. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-3 rounded-full bg-accent-light px-2 py-0.5 text-xs font-medium text-accent tabular-nums"
          >
            +{hiddenCount} {t.styles_label}
          </span>
        </div>
      )}
    </div>
  );
});
