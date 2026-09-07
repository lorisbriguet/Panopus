import { memo } from "react";
import { ChevronRight } from "lucide-react";
import { FontCard } from "./FontCard";
import { useT } from "../../i18n/useT";
import type { FamilyGroup as FamilyGroupData } from "../../lib/familyGroups";

/**
 * Header button shared by both grid renderings of a family (collapsed cell
 * and expanded full-width band). Carries `data-family-toggle` so the
 * virtualized library can re-focus whichever header is mounted after the
 * expand/collapse remount (the collapsed cell and the expanded header row
 * are different virtual items, hence different elements).
 */
export const FamilyGroupHeader = memo(function FamilyGroupHeader({
  group,
  expanded,
  onToggle,
}: {
  group: FamilyGroupData;
  expanded: boolean;
  /** Fold/unfold the family — owned by the library list (focus restore). */
  onToggle: (family: string) => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      data-family-toggle={group.family}
      onClick={() => onToggle(group.family)}
      aria-expanded={expanded}
      aria-label={`${expanded ? t.collapse_family : t.expand_family}: ${group.family}`}
      className="flex items-center gap-2 self-start max-w-full rounded-lg px-1.5 py-1 text-left cursor-pointer focus-accent hover:bg-[var(--color-hover-row)]"
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
  );
});

interface CollapsedFamilyGroupProps {
  group: FamilyGroupData;
  proofText: string;
  proofSize: number;
  /** Passed through to the representative FontCard, exactly like bare cells. */
  onOpenDetail?: (id: number) => void;
  onToggle: (family: string) => void;
}

/**
 * A COLLAPSED family as one grid cell: slim header (family name, style
 * count, chevron) stacked over the representative card with a "+N styles"
 * pill. The cell flows with the single-font cards — a full-width band for
 * one card left ugly dead zones. The EXPANDED rendering lives in the
 * virtualized grid instead: a FamilyGroupHeader row followed by the style
 * cards chunked into normal cell rows (lib/libraryItems.chunkGrid), which
 * reproduces the old col-span-full band with the IDENTICAL column template.
 */
export const CollapsedFamilyGroup = memo(function CollapsedFamilyGroup({
  group,
  proofText,
  proofSize,
  onOpenDetail,
  onToggle,
}: CollapsedFamilyGroupProps) {
  const t = useT();
  // The representative stands in for the rest — hint counts the HIDDEN styles.
  const hiddenCount = group.rows.length - 1;
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <FamilyGroupHeader group={group} expanded={false} onToggle={onToggle} />
      <div className="relative min-w-0">
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
          +{hiddenCount} {hiddenCount === 1 ? t.style_label : t.styles_label}
        </span>
      </div>
    </div>
  );
});
