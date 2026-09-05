import { useMemo, useState } from "react";
import { Badge, EmptyState, PageHeader, PageSpinner } from "../components/ui";
import { BulkBar } from "../components/fonts/BulkBar";
import { FamilyGroup } from "../components/fonts/FamilyGroup";
import { FontCard } from "../components/fonts/FontCard";
import { FontDetail } from "../components/fonts/FontDetail";
import { FamilyListRows, FontListRow } from "../components/fonts/FontListRow";
import { ProofToolbar } from "../components/fonts/ProofToolbar";
import { useFonts } from "../hooks/useFonts";
import { useTags } from "../hooks/useTags";
import { groupByFamily, isFamilyGroup } from "../lib/familyGroups";
import { gridTemplateForColumns } from "../lib/gridColumns";
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
  // Selector returns the derived template STRING (a primitive), so the page
  // only re-renders when the setting actually changes the template.
  const gridTemplate = useAppStore((s) => gridTemplateForColumns(s.libraryColumns));
  const libraryView = useAppStore((s) => s.libraryView);
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
          {activeCount} {t.active_label}
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
      ) : libraryView === "list" ? (
        // Specimen list (default): one divider-separated row per font, family
        // groups folding to their representative — same grouped data as the grid.
        <div className="mt-4">
          {grouped.map((entry) =>
            isFamilyGroup(entry) ? (
              <FamilyListRows
                key={entry.family}
                group={entry}
                proofText={proofText}
                proofSize={proofSize}
                onOpenDetail={setDetailId}
              />
            ) : (
              <FontListRow
                key={entry.id}
                font={entry}
                proofText={proofText}
                proofSize={proofSize}
                onOpenDetail={setDetailId}
              />
            )
          )}
        </div>
      ) : (
        <div
          className="mt-4 grid gap-3 items-start"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {grouped.map((entry) =>
            isFamilyGroup(entry) ? (
              <FamilyGroup
                key={entry.family}
                group={entry}
                proofText={proofText}
                proofSize={proofSize}
                onOpenDetail={setDetailId}
              />
            ) : (
              <FontCard
                key={entry.id}
                font={entry}
                proofText={proofText}
                proofSize={proofSize}
                onOpenDetail={setDetailId}
              />
            )
          )}
        </div>
      )}
      <FontDetail
        fontId={detailId}
        onClose={() => setDetailId(null)}
        onSelectFont={setDetailId}
      />
    </>
  );
}
