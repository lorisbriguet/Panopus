import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, Star, X } from "lucide-react";
import { getDb } from "../../db";
import { useSetActive } from "../../hooks/useActivation";
import { useFonts, useToggleFavorite } from "../../hooks/useFonts";
import { useAssignTag, useCreateTag, useTags, useUnassignTag } from "../../hooks/useTags";
import { useT } from "../../i18n/useT";
import { notifyError } from "../../lib/notifyError";
import { getStoredTagColor, TAG_COLOR_NAMES } from "../../lib/tagColors";
import type { FontRow } from "../../lib/fontFilters";
import { useAppStore } from "../../stores/app-store";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Toggle } from "../ui/Toggle";
import { LICENCE_VARIANTS } from "./FontCard";
import { GlyphMap } from "./GlyphMap";
import { Waterfall } from "./Waterfall";

type DetailTab = "info" | "glyphs" | "waterfall";

type DesignerRef = { slug: string; name: string };

/**
 * Resolve the designer wiki entry linked to a font source (designers ⋈
 * designer_sources). Returns null when no designer claims the source —
 * the normal case until Task 13 seeds the wiki — and the panel then
 * simply omits the designer row.
 */
function useDesignerForSource(source: string) {
  return useQuery({
    queryKey: ["designer-for-source", source],
    queryFn: async (): Promise<DesignerRef | null> => {
      const db = await getDb();
      const rows = await db.select<DesignerRef[]>(
        `SELECT d.slug, d.name FROM designers d
         JOIN designer_sources ds ON ds.designer_id = d.id
         WHERE ds.source = $1`,
        [source]
      );
      return rows?.[0] ?? null;
    },
  });
}

/** One label/value line of the Info tab. */
function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-xs text-muted shrink-0">{label}</span>
      <span className="text-xs text-right min-w-0 break-all">{children}</span>
    </div>
  );
}

function TagEditor({ font }: { font: FontRow }) {
  const t = useT();
  const darkMode = useAppStore((s) => s.darkMode);
  const { data: tags } = useTags();
  const createTag = useCreateTag();
  const assignTag = useAssignTag();
  const unassignTag = useUnassignTag();
  const [newTag, setNewTag] = useState("");

  const assigned = new Set(
    font.tag_ids.split(",").filter(Boolean).map(Number)
  );

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    const name = newTag.trim();
    if (!name || createTag.isPending) return;
    if ((tags ?? []).some((tg) => tg.name.toLowerCase() === name.toLowerCase())) return;
    createTag.mutate(
      // Cycle the palette so successive new tags get distinct colors.
      { name, color: TAG_COLOR_NAMES[(tags?.length ?? 0) % TAG_COLOR_NAMES.length] },
      { onSuccess: () => setNewTag("") }
    );
  };

  return (
    <div>
      <h4 className="text-xs font-medium text-muted uppercase tracking-wide mb-2">
        {t.detail_tags}
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {(tags ?? []).map((tag) => {
          const on = assigned.has(tag.id);
          // Stored color (tags.color), not the name hash — a rename or an
          // explicit color change in the TagManager must show everywhere.
          const color = getStoredTagColor(tag.color, darkMode);
          return (
            <button
              key={tag.id}
              type="button"
              aria-pressed={on}
              onClick={() =>
                on
                  ? unassignTag.mutate({ fontId: font.id, tagId: tag.id })
                  : assignTag.mutate({ fontId: font.id, tagId: tag.id })
              }
              className="text-xs px-2.5 py-0.5 rounded-full font-medium status-transition focus-accent border"
              style={
                on
                  ? { background: color.bg, color: color.text, borderColor: "transparent" }
                  : {
                      background: "transparent",
                      color: "var(--color-muted)",
                      borderColor: "var(--color-input-border)",
                    }
              }
            >
              {tag.name}
            </button>
          );
        })}
      </div>
      <form onSubmit={handleCreate} className="mt-2 flex items-center gap-2">
        <Input
          fullWidth={false}
          className="w-44"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          placeholder={t.new_tag_placeholder}
          aria-label={t.new_tag_placeholder}
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={newTag.trim() === ""}
          loading={createTag.isPending}
        >
          {t.add_tag_button}
        </Button>
      </form>
    </div>
  );
}

function InfoTab({
  font,
  siblings,
  onSelectFont,
}: {
  font: FontRow;
  siblings: FontRow[];
  onSelectFont: (id: number) => void;
}) {
  const t = useT();
  const { data: designer } = useDesignerForSource(font.source);

  const reveal = () => {
    invoke("open_in_finder", { path: font.path }).catch((e) =>
      notifyError(t.reveal_failed, e)
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h4 className="text-xs font-medium text-muted uppercase tracking-wide mb-2">
          {t.detail_styles}
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {siblings.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => onSelectFont(row.id)}
              aria-pressed={row.id === font.id}
              className={`text-xs px-2.5 py-1 rounded-md border focus-accent status-transition ${
                row.id === font.id
                  ? "bg-accent-light text-accent border-transparent"
                  : "text-muted border-[var(--color-input-border)] hover:text-[var(--color-text)]"
              }`}
            >
              {row.style}
            </button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-[var(--color-border-divider)]">
        <MetaRow label={t.detail_glyph_count}>
          <span className="tabular-nums">{font.glyph_count}</span>
        </MetaRow>
        <MetaRow label={t.detail_format}>{font.format}</MetaRow>
        <MetaRow label={t.detail_source}>{font.source}</MetaRow>
        <MetaRow label={t.detail_licence}>
          <Badge variant={LICENCE_VARIANTS[font.licence_status] ?? "neutral"}>
            {font.licence_status}
          </Badge>
        </MetaRow>
        {designer && (
          <MetaRow label={t.detail_designer}>
            <Link to={`/designers/${designer.slug}`} className="text-accent hover:underline">
              {designer.name}
            </Link>
          </MetaRow>
        )}
        <MetaRow label={t.detail_path}>
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <span className="break-all">{font.path}</span>
            <button
              type="button"
              onClick={reveal}
              aria-label={t.reveal_in_finder}
              title={t.reveal_in_finder}
              className="shrink-0 text-muted hover:text-[var(--color-text-secondary)] focus-accent rounded p-0.5"
            >
              <FolderOpen size={14} aria-hidden="true" />
            </button>
          </span>
        </MetaRow>
      </div>
      <TagEditor font={font} />
    </div>
  );
}

interface FontDetailProps {
  /** fonts.id of the row to show, or null when the panel is closed. */
  fontId: number | null;
  onClose: () => void;
  /** Switch the panel to another style of the same family. */
  onSelectFont: (id: number) => void;
}

/**
 * Right slide-over detail panel for one font. The design system only ships
 * a centered Modal, so this re-uses its conventions (backdrop click + Escape
 * close, dialog semantics, focus on open) in a right-anchored token-styled
 * panel. Rows come from the shared fonts query, so favorite/activation
 * state stays DB-truthful across mutations. Glyphs and Waterfall content
 * is mounted only while its tab is selected — never rendered hidden.
 */
export function FontDetail({ fontId, onClose, onSelectFont }: FontDetailProps) {
  const t = useT();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<DetailTab>("info");
  const { data: rows } = useFonts();
  const toggleFavorite = useToggleFavorite();
  const setActive = useSetActive();

  const open = fontId !== null;

  // Fresh open → Info tab (spec default). Style switches within the family
  // keep the current tab so Glyphs/Waterfall can be compared across styles.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) setTab("info");
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();
  }, [open, fontId]);

  const font = open ? (rows ?? []).find((r) => r.id === fontId) : undefined;
  if (!font) return null;

  const siblings = (rows ?? []).filter((r) => r.family === font.family);
  const isSystem = font.is_system === 1;
  const isFavorite = font.favorite === 1;

  const tabs: { key: DetailTab; label: string }[] = [
    { key: "info", label: t.detail_info },
    { key: "glyphs", label: t.detail_glyphs },
    { key: "waterfall", label: t.detail_waterfall },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 animate-in fade-in"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 w-full max-w-xl bg-[var(--color-surface)] border-l border-[var(--color-border-divider)] shadow-[0_16px_48px_rgba(0,0,0,0.5)] flex flex-col outline-none peek-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[var(--color-border-divider)]">
          <h3 id={titleId} className="text-sm font-medium min-w-0 truncate">
            {font.family} <span className="text-muted font-normal">{font.style}</span>
          </h3>
          <div className="flex items-center gap-2.5 shrink-0">
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
            <button
              onClick={onClose}
              className="text-muted hover:text-[var(--color-text-secondary)] focus-accent rounded p-0.5"
              aria-label={t.close}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div
          role="tablist"
          className="flex items-center gap-1 px-5 pt-3 border-b border-[var(--color-border-divider)]"
        >
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`text-xs px-3 py-1.5 rounded-t-md border-b-2 focus-accent transition-colors ${
                tab === key
                  ? "border-[var(--color-accent)] text-[var(--color-text)] font-medium"
                  : "border-transparent text-muted hover:text-[var(--color-text)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {/* Opt-in mounting: only the selected tab's content exists in the
              DOM — Glyphs/Waterfall never render hidden. */}
          {tab === "info" && (
            <InfoTab font={font} siblings={siblings} onSelectFont={onSelectFont} />
          )}
          {tab === "glyphs" && <GlyphMap id={font.id} path={font.path} />}
          {tab === "waterfall" && (
            <Waterfall id={font.id} path={font.path} sampleText={font.sample_text} />
          )}
        </div>
      </div>
    </div>
  );
}
