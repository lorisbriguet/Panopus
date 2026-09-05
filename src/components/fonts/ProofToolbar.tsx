import { useState } from "react";
import { LayoutGrid, List, Pencil } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { SearchBar } from "../ui/SearchBar";
import { Select } from "../ui/Select";
import { Toggle } from "../ui/Toggle";
import { TagManager } from "./TagManager";
import { useAppStore, DEFAULT_PROOF_TEXT } from "../../stores/app-store";
import type { LibrarySortOption, LibraryColumnsOption } from "../../stores/app-store";
import type { TagRow } from "../../hooks/useTags";
import { useT } from "../../i18n/useT";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NUMERALS = "0123456789 .,:;!?\"'()[]{}@#%&*-+=/";

interface ProofToolbarProps {
  /** Distinct source names present in the loaded rows (for the source filter). */
  sources: string[];
  /** Distinct licence statuses present in the loaded rows (for the licence filter). */
  licences: string[];
  /** All tags (for the tag filter) — same props pattern as sources/licences. */
  tags: TagRow[];
  /**
   * Bulk affordance: replace the selection with every currently-shown font
   * ("activate all for a source/licence"). Only offered while a specific
   * source or licence filter narrows the grid.
   */
  onSelectAllShown?: () => void;
  /** Unfold every family group currently shown in the grid. */
  onExpandAll?: () => void;
  /** Fold every family group back to its representative card. */
  onCollapseAll?: () => void;
}

/**
 * Two-row control strip above the library grid: proofing controls (sample
 * text, presets, size) and query controls (search, sort, source/licence,
 * active/favorite gates). All state lives in the app store's library slice.
 */
export function ProofToolbar({
  sources,
  licences,
  tags,
  onSelectAllShown,
  onExpandAll,
  onCollapseAll,
}: ProofToolbarProps) {
  const t = useT();
  const proofText = useAppStore((s) => s.proofText);
  const proofSize = useAppStore((s) => s.proofSize);
  const libraryQuery = useAppStore((s) => s.libraryQuery);
  const librarySort = useAppStore((s) => s.librarySort);
  const libraryColumns = useAppStore((s) => s.libraryColumns);
  const libraryView = useAppStore((s) => s.libraryView);
  const setProofText = useAppStore((s) => s.setProofText);
  const setProofSize = useAppStore((s) => s.setProofSize);
  const setLibraryQuery = useAppStore((s) => s.setLibraryQuery);
  const setLibrarySort = useAppStore((s) => s.setLibrarySort);
  const setLibraryColumns = useAppStore((s) => s.setLibraryColumns);
  const setLibraryView = useAppStore((s) => s.setLibraryView);
  // Tag manager modal: ephemeral open state, like FontDetail's detailId.
  const [tagManagerOpen, setTagManagerOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          fullWidth={false}
          className="w-72"
          value={proofText}
          onChange={(e) => setProofText(e.target.value)}
          placeholder={t.proof_text}
          aria-label={t.proof_text}
        />
        <Button variant="ghost" size="sm" onClick={() => setProofText(DEFAULT_PROOF_TEXT)}>
          {t.preset_pangram}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setProofText(ALPHABET)}>
          {t.preset_alphabet}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setProofText(NUMERALS)}>
          {t.preset_numerals}
        </Button>
        <label className="flex items-center gap-2 text-xs text-muted ml-2">
          {t.proof_size}
          <input
            type="range"
            min={12}
            max={96}
            value={proofSize}
            onChange={(e) => setProofSize(Number(e.target.value))}
            className="w-32 accent-accent"
            aria-label={t.proof_size}
          />
          <span className="tabular-nums w-6 text-right">{proofSize}</span>
        </label>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <SearchBar
          value={libraryQuery.search}
          onChange={(search) => setLibraryQuery({ search })}
          placeholder={t.search_fonts}
        />
        <Select
          fullWidth={false}
          value={librarySort}
          onChange={(e) => setLibrarySort(e.target.value as LibrarySortOption)}
          aria-label={t.sort_family_asc}
        >
          <option value="family_asc">{t.sort_family_asc}</option>
          <option value="family_desc">{t.sort_family_desc}</option>
        </Select>
        {/* Segmented list/grid switch — list is the default specimen view. */}
        <div className="flex items-center rounded-lg border border-[var(--color-border-divider)] p-0.5 gap-0.5">
          <button
            type="button"
            onClick={() => setLibraryView("list")}
            aria-label={t.view_list}
            aria-pressed={libraryView === "list"}
            title={t.view_list}
            className={`rounded-md p-1.5 focus-accent ${
              libraryView === "list"
                ? "bg-accent-light text-accent"
                : "text-muted hover:text-[var(--color-text-secondary)]"
            }`}
          >
            <List size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setLibraryView("grid")}
            aria-label={t.view_grid}
            aria-pressed={libraryView === "grid"}
            title={t.view_grid}
            className={`rounded-md p-1.5 focus-accent ${
              libraryView === "grid"
                ? "bg-accent-light text-accent"
                : "text-muted hover:text-[var(--color-text-secondary)]"
            }`}
          >
            <LayoutGrid size={14} aria-hidden="true" />
          </button>
        </div>
        {/* Column override only means something for the card grid. */}
        {libraryView === "grid" && (
          <Select
            fullWidth={false}
            // Option values are strings: "auto" stays, "1"/"2"/"3" parse back to numbers.
            value={String(libraryColumns)}
            onChange={(e) =>
              setLibraryColumns(
                e.target.value === "auto"
                  ? "auto"
                  : (Number(e.target.value) as LibraryColumnsOption)
              )
            }
            aria-label={t.columns_label}
          >
            <option value="auto">{t.columns_auto}</option>
            <option value="1">{t.columns_one}</option>
            <option value="2">{t.columns_two}</option>
            <option value="3">{t.columns_three}</option>
          </Select>
        )}
        {onExpandAll && (
          <Button variant="ghost" size="sm" onClick={onExpandAll}>
            {t.expand_all_families}
          </Button>
        )}
        {onCollapseAll && (
          <Button variant="ghost" size="sm" onClick={onCollapseAll}>
            {t.collapse_all_families}
          </Button>
        )}
        <Select
          fullWidth={false}
          value={libraryQuery.source ?? ""}
          onChange={(e) => setLibraryQuery({ source: e.target.value || null })}
          aria-label={t.all_sources}
        >
          <option value="">{t.all_sources}</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select
          fullWidth={false}
          value={libraryQuery.licence ?? ""}
          onChange={(e) => setLibraryQuery({ licence: e.target.value || null })}
          aria-label={t.all_licences}
        >
          <option value="">{t.all_licences}</option>
          {licences.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
        <Select
          fullWidth={false}
          // Select values are strings: "" ↔ null, otherwise the tag id parsed back.
          value={libraryQuery.tagId === null ? "" : String(libraryQuery.tagId)}
          onChange={(e) =>
            setLibraryQuery({ tagId: e.target.value === "" ? null : Number(e.target.value) })
          }
          aria-label={t.all_tags}
        >
          <option value="">{t.all_tags}</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </Select>
        <button
          type="button"
          onClick={() => setTagManagerOpen(true)}
          aria-label={t.manage_tags}
          title={t.manage_tags}
          className="text-muted hover:text-[var(--color-text-secondary)] focus-accent rounded p-1"
        >
          <Pencil size={14} aria-hidden="true" />
        </button>
        {onSelectAllShown &&
          (libraryQuery.source !== null || libraryQuery.licence !== null) && (
            <Button variant="ghost" size="sm" onClick={onSelectAllShown}>
              {t.select_all_shown}
            </Button>
          )}
        <label className="flex items-center gap-1.5 text-xs text-muted ml-2">
          <Toggle
            checked={libraryQuery.onlyActive}
            onChange={(onlyActive) => setLibraryQuery({ onlyActive })}
            ariaLabel={t.only_active}
          />
          {t.only_active}
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <Toggle
            checked={libraryQuery.onlyFavorites}
            onChange={(onlyFavorites) => setLibraryQuery({ onlyFavorites })}
            ariaLabel={t.only_favorites}
          />
          {t.only_favorites}
        </label>
      </div>
      <TagManager open={tagManagerOpen} onClose={() => setTagManagerOpen(false)} />
    </div>
  );
}
