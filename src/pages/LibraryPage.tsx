import { useMemo, useState } from "react";
import { Badge, EmptyState, PageHeader, PageSpinner } from "../components/ui";
import { BulkBar } from "../components/fonts/BulkBar";
import { FontDetail } from "../components/fonts/FontDetail";
import { LibraryList } from "../components/fonts/LibraryList";
import { ProofToolbar } from "../components/fonts/ProofToolbar";
import { useFonts } from "../hooks/useFonts";
import { useTags } from "../hooks/useTags";
import { groupByFamily, isFamilyGroup } from "../lib/familyGroups";
import { filterFonts } from "../lib/fontFilters";
import { useAppStore } from "../stores/app-store";
import { useT } from "../i18n/useT";

export function LibraryPage() {
  const t = useT();
  const { data: rows, isLoading } = useFonts();
  const { data: tags } = useTags();
  const libraryQuery = useAppStore((s) => s.libraryQuery);
  const librarySort = useAppStore((s) => s.librarySort);
  const proofText = useAppStore((s) => s.proofText);
  const proofSize = useAppStore((s) => s.proofSize);
  const selectMany = useAppStore((s) => s.selectMany);
  const setAllFamiliesExpanded = useAppStore((s) => s.setAllFamiliesExpanded);
  // Detail slide-over: id of the inspected font, null = closed. Ephemeral
  // page state — no store slice needed, and useState's setter is stable so
  // the memoized cards never re-render because of it.
  const [detailId, setDetailId] = useState<number | null>(null);

  const sources = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.source))].sort(),
    [rows]
  );
  const licences = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.licence_status))].sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const out = filterFonts(rows ?? [], libraryQuery);
    // The fonts query orders family ASC, style ASC; only desc needs a re-sort
    // (flip family, keep styles ascending within a family).
    if (librarySort === "family_desc") {
      return [...out].sort(
        (a, b) => b.family.localeCompare(a.family) || a.style.localeCompare(b.style)
      );
    }
    return out;
  }, [rows, libraryQuery, librarySort]);

  // Mixed render list: 2+ style families fold into a FamilyGroup, singles
  // stay bare rows. Grouping runs AFTER filter+sort so it inherits the
  // family order (asc AND desc) and never changes what matches.
  const grouped = useMemo(() => groupByFamily(filtered), [filtered]);

  const activeCount = useMemo(
    () => (rows ?? []).filter((r) => r.active === 1).length,
    [rows]
  );

  return (
    <>
      <PageHeader title={t.library}>
        <Badge variant="success">
          {activeCount} {activeCount === 1 ? t.active_label_one : t.active_label}
        </Badge>
        <span className="text-sm text-muted">
          {filtered.length} {filtered.length === 1 ? t.font_label : t.fonts_label}
        </span>
      </PageHeader>
      <ProofToolbar
        sources={sources}
        licences={licences}
        tags={tags ?? []}
        // "Activate all for a source/licence": tick every currently-filtered
        // row (system fonts excluded — they can't be toggled) so the BulkBar
        // can act on the whole set with one click.
        onSelectAllShown={() =>
          selectMany(filtered.filter((f) => f.is_system !== 1).map((f) => f.id))
        }
        onExpandAll={() =>
          setAllFamiliesExpanded(grouped.filter(isFamilyGroup).map((g) => g.family))
        }
        onCollapseAll={() => setAllFamiliesExpanded(null)}
      />
      <BulkBar rows={rows ?? []} />
      {isLoading ? (
        <PageSpinner label={t.loading_fonts} />
      ) : filtered.length === 0 ? (
        <EmptyState
          message={(rows ?? []).length === 0 ? t.library_empty : t.no_fonts_match}
        />
      ) : (
        // Both views virtualize through LibraryList: only the visible window
        // of rows is mounted, so a font-face arrival re-layouts ~30 rows
        // instead of the whole 7'000+ row library.
        <LibraryList
          entries={grouped}
          proofText={proofText}
          proofSize={proofSize}
          onOpenDetail={setDetailId}
        />
      )}
      <FontDetail
        fontId={detailId}
        onClose={() => setDetailId(null)}
        onSelectFont={setDetailId}
      />
    </>
  );
}
