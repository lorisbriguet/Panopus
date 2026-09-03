import { memo, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Star } from "lucide-react";
import { Badge } from "../ui/Badge";
import type { BadgeVariant } from "../ui/Badge";
import { Toggle } from "../ui/Toggle";
import { useToggleFavorite } from "../../hooks/useFonts";
import { useSetActive } from "../../hooks/useActivation";
import { useAppStore } from "../../stores/app-store";
import { useT } from "../../i18n/useT";
import type { FontRow } from "../../lib/fontFilters";
import { ensureFontFace } from "./FontFaceLoader";

export const LICENCE_VARIANTS: Record<string, BadgeVariant> = {
  free: "success",
  donationware: "info",
  "personal use": "warning",
  commercial: "warning",
  "rights unclear": "danger",
};

interface FontCardProps {
  font: FontRow;
  proofText: string;
  proofSize: number;
  /**
   * Open the detail panel for this font. Fired on card clicks that do NOT
   * originate from an interactive control (checkbox, star, toggle, links) —
   * those keep their own behaviour. Must be referentially stable (the card
   * is memoized).
   */
  onOpenDetail?: (id: number) => void;
}

/**
 * One card per font style. The @font-face is only registered when the card
 * scrolls near the viewport (IntersectionObserver, 600px lookahead) so a
 * 6'345-row library never asks the WebView for thousands of file loads at
 * once; `content-visibility: auto` additionally lets the browser skip
 * layout/paint for off-screen cards.
 */
export const FontCard = memo(function FontCard({
  font,
  proofText,
  proofSize,
  onOpenDetail,
}: FontCardProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [family, setFamily] = useState<string | null>(null);
  const toggleFavorite = useToggleFavorite();
  const setActive = useSetActive();
  // Boolean selector: the memoized card only re-renders when ITS tick flips,
  // not on every selection change across a 6'345-row library.
  const selected = useAppStore((s) => s.selectedIds.includes(font.id));
  const toggleSelected = useAppStore((s) => s.toggleSelected);

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

  // Card click → detail panel, EXCEPT when the click originated on an
  // interactive control (checkbox, star, activation toggle, links): those
  // must keep their own behaviour without also opening the panel.
  const handleCardClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!onOpenDetail) return;
    if ((e.target as HTMLElement).closest("button, input, a")) return;
    onOpenDetail(font.id);
  };

  return (
    <div
      ref={ref}
      onClick={handleCardClick}
      className={`rounded-xl bg-[var(--color-surface)] border border-[var(--color-border-divider)] p-4 [content-visibility:auto] [contain-intrinsic-size:auto_190px] ${
        onOpenDetail ? "cursor-pointer hover:border-[var(--color-border)]" : ""
      }`}
    >
      <div
        className="overflow-hidden break-words leading-tight"
        style={{
          fontFamily: family ?? undefined,
          fontSize: proofSize,
          minHeight: Math.ceil(proofSize * 1.25),
        }}
      >
        {proofText}
      </div>
      <div className="mt-3 pt-2 border-t border-[var(--color-border-divider)] flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2.5">
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
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">
              {font.family} <span className="text-muted font-normal">{font.style}</span>
            </div>
            <div className="text-xs text-muted truncate">{font.source}</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <Badge variant={LICENCE_VARIANTS[font.licence_status] ?? "neutral"}>
            {font.licence_status}
          </Badge>
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
    </div>
  );
});
