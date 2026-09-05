import {
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Star, Pin, PinOff } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Toggle } from "../ui/Toggle";
import { useToggleFavorite } from "../../hooks/useFonts";
import { useSetActive } from "../../hooks/useActivation";
import { useAppStore } from "../../stores/app-store";
import { useT } from "../../i18n/useT";
import type { FontRow } from "../../lib/fontFilters";
import type { FamilyGroup as FamilyGroupData } from "../../lib/familyGroups";
import { LICENCE_VARIANTS } from "./FontCard";
import { ensureFontFace } from "./FontFaceLoader";

/**
 * Gutter affordance for folded families in list mode: the representative row
 * shows a "+N styles" chip (collapsed) or a "−" chip on the first style row
 * (expanded). The chip is a BUTTON so the row's `closest("button, input, a")`
 * guard keeps a chip click from also opening the detail panel.
 */
interface FamilyChip {
  family: string;
  /** Styles hidden behind the representative (rows.length - 1). */
  hiddenCount: number;
  expanded: boolean;
}

interface FontListRowProps {
  font: FontRow;
  proofText: string;
  proofSize: number;
  /** Same contract as FontCard.onOpenDetail — referentially stable, memoized row. */
  onOpenDetail?: (id: number) => void;
  /** Present only on a family's lead row (see FamilyListRows). */
  familyChip?: FamilyChip;
}

/**
 * One specimen row for the library's list view (Font Book style): fixed
 * left gutter (family/style + source/licence), a single nowrap proof line
 * fading out on the right, and the same selection/favorite/pin/activation
 * controls as FontCard. The @font-face registration is IO-lazy exactly like
 * FontCard so huge libraries never load thousands of files at once.
 */
export const FontListRow = memo(function FontListRow({
  font,
  proofText,
  proofSize,
  onOpenDetail,
  familyChip,
}: FontListRowProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [family, setFamily] = useState<string | null>(null);
  const toggleFavorite = useToggleFavorite();
  const setActive = useSetActive();
  // Boolean selectors (Task-10 precedent): the memoized row only re-renders
  // when ITS tick flips, not on every selection change across the library.
  const selected = useAppStore((s) => s.selectedIds.includes(font.id));
  const toggleSelected = useAppStore((s) => s.toggleSelected);
  const isPinned = useAppStore((s) => s.pinnedIds.includes(font.id));
  const pinFont = useAppStore((s) => s.pinFont);
  const unpinFont = useAppStore((s) => s.unpinFont);
  const toggleFamily = useAppStore((s) => s.toggleFamily);

  useEffect(() => {
    if (family) return;
    const el = ref.current;
    if (!el) return;
    // Test environments (happy-dom) have no IntersectionObserver — load eagerly.
    if (typeof IntersectionObserver === "undefined") {
      setFamily(ensureFontFace(font.id, font.path));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setFamily(ensureFontFace(font.id, font.path));
          io.disconnect();
        }
      },
      { rootMargin: "600px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [family, font.id, font.path]);

  const isSystem = font.is_system === 1;
  const isFavorite = font.favorite === 1;

  // Row click → detail panel, EXCEPT when the click originated on an
  // interactive control (checkbox, star, pin, toggle, family chip): those
  // must keep their own behaviour without also opening the panel.
  const handleRowClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!onOpenDetail) return;
    if ((e.target as HTMLElement).closest("button, input, a")) return;
    onOpenDetail(font.id);
  };

  // Keyboard access (I1): Enter/Space on the FOCUSED ROW opens the panel.
  // Keys forwarded (bubbled) from inner controls have e.target !== the row
  // root and keep their own behaviour.
  const handleRowKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!onOpenDetail) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.target !== e.currentTarget) return;
    e.preventDefault(); // Space would scroll the page
    onOpenDetail(font.id);
  };

  return (
    <div
      ref={ref}
      onClick={handleRowClick}
      {...(onOpenDetail
        ? {
            role: "button",
            tabIndex: 0,
            "aria-label": `${t.open_details}: ${font.family} ${font.style}`,
            onKeyDown: handleRowKeyDown,
          }
        : {})}
      className={`flex items-center gap-4 border-b border-[var(--color-border-divider)] px-2 py-2 ${
        onOpenDetail ? "cursor-pointer hover:bg-[var(--color-hover-row)] focus-accent" : ""
      }`}
      // content-visibility keeps off-screen rows out of layout/paint; the
      // intrinsic height depends on the live proofSize so it stays inline.
      style={
        {
          contentVisibility: "auto",
          containIntrinsicSize: `auto ${Math.ceil(proofSize * 1.25) + 20}px`,
        } as CSSProperties
      }
    >
      {/* Gutter + preview share a baseline so the specimen sits on the same
          line as the family name, Font Book style. */}
      <div className="min-w-0 flex-1 flex items-baseline gap-4">
        <div className="w-[180px] shrink-0 min-w-0">
          <div className="flex items-baseline gap-1.5 min-w-0 text-sm">
            <span className="font-semibold truncate">{font.family}</span>
            <span className="shrink-0 text-xs text-muted">{font.style}</span>
            {familyChip && (
              <button
                type="button"
                onClick={() => toggleFamily(familyChip.family)}
                aria-expanded={familyChip.expanded}
                aria-label={`${
                  familyChip.expanded ? t.collapse_family : t.expand_family
                }: ${familyChip.family}`}
                className="shrink-0 self-center rounded-full bg-accent-light px-1.5 py-px text-[10px] font-medium text-accent tabular-nums cursor-pointer focus-accent"
              >
                {familyChip.expanded
                  ? "\u2212"
                  : `+${familyChip.hiddenCount} ${
                      familyChip.hiddenCount === 1 ? t.style_label : t.styles_label
                    }`}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 min-w-0 text-xs text-muted">
            <span className="truncate">{font.source}</span>
            <Badge variant={LICENCE_VARIANTS[font.licence_status] ?? "neutral"}>
              {font.licence_status}
            </Badge>
          </div>
        </div>
        <div
          className="min-w-0 flex-1 whitespace-nowrap overflow-hidden leading-tight [mask-image:linear-gradient(90deg,black_85%,transparent)]"
          style={{
            fontFamily: family ?? undefined,
            fontSize: proofSize,
            minHeight: Math.ceil(proofSize * 1.25),
          }}
        >
          {/* Specimen fallback: fonts mapping no Latin letters would render
              the proof text as a blank line — show their indexed specimen. */}
          {font.sample_text ?? proofText}
        </div>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        {/* System fonts can't be (de)activated, so bulk-selecting them
            would only produce guaranteed per-id failures — keep them out. */}
        <input
          type="checkbox"
          checked={selected}
          disabled={isSystem}
          onChange={() => toggleSelected(font.id)}
          aria-label={t.select_font}
          className="shrink-0 h-4 w-4 accent-accent focus-accent disabled:opacity-40"
        />
        <button
          type="button"
          onClick={() =>
            toggleFavorite.mutate({ id: font.id, favorite: isFavorite ? 0 : 1 })
          }
          aria-label={isFavorite ? t.remove_favorite : t.add_favorite}
          aria-pressed={isFavorite}
          className="focus-accent rounded p-0.5"
        >
          <Star
            size={16}
            className={isFavorite ? "text-warning fill-current" : "text-muted"}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          onClick={() => (isPinned ? unpinFont(font.id) : pinFont(font.id))}
          aria-label={isPinned ? t.unpin_font : t.pin_font}
          aria-pressed={isPinned}
          className="focus-accent rounded p-0.5"
        >
          {isPinned ? (
            <Pin size={16} className="text-accent fill-current" aria-hidden="true" />
          ) : (
            <PinOff size={16} className="text-muted" aria-hidden="true" />
          )}
        </button>
        <span title={isSystem ? t.system_font_locked : undefined}>
          <Toggle
            checked={font.active === 1}
            disabled={isSystem}
            onChange={(checked) => setActive.mutate({ ids: [font.id], active: checked })}
            ariaLabel={t.font_active}
          />
        </span>
      </div>
    </div>
  );
});

interface FamilyListRowsProps {
  group: FamilyGroupData;
  proofText: string;
  proofSize: number;
  onOpenDetail?: (id: number) => void;
}

/**
 * List-mode counterpart of FamilyGroup: collapsed = ONE FontListRow for the
 * representative with a "+N styles" chip; expanded = every style row, the
 * first one carrying the "−" collapse chip. Same ephemeral expandedFamilies
 * store slice, same primitive-selector memo discipline — toggling one family
 * never re-renders the other rows.
 */
export const FamilyListRows = memo(function FamilyListRows({
  group,
  proofText,
  proofSize,
  onOpenDetail,
}: FamilyListRowsProps) {
  const expanded = useAppStore((s) => s.expandedFamilies.includes(group.family));
  // The representative stands in for the rest — hint counts the HIDDEN styles.
  const hiddenCount = group.rows.length - 1;

  if (!expanded) {
    return (
      <FontListRow
        font={group.representative}
        proofText={proofText}
        proofSize={proofSize}
        onOpenDetail={onOpenDetail}
        familyChip={{ family: group.family, hiddenCount, expanded: false }}
      />
    );
  }
  return (
    <>
      {group.rows.map((f, i) => (
        <FontListRow
          key={f.id}
          font={f}
          proofText={proofText}
          proofSize={proofSize}
          onOpenDetail={onOpenDetail}
          familyChip={
            i === 0 ? { family: group.family, hiddenCount, expanded: true } : undefined
          }
        />
      ))}
    </>
  );
});
