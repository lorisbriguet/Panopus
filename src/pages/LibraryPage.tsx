import { useMemo } from "react";
import { EmptyState, PageHeader, PageSpinner } from "../components/ui";
import { FontCard } from "../components/fonts/FontCard";
import { ProofToolbar } from "../components/fonts/ProofToolbar";
import { useFonts } from "../hooks/useFonts";
import { filterFonts } from "../lib/fontFilters";
import { useAppStore } from "../stores/app-store";
import { useT } from "../i18n/useT";

export function LibraryPage() {
  const t = useT();
  const { data: rows, isLoading } = useFonts();
  const libraryQuery = useAppStore((s) => s.libraryQuery);
  const librarySort = useAppStore((s) => s.librarySort);
  const proofText = useAppStore((s) => s.proofText);
  const proofSize = useAppStore((s) => s.proofSize);

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

  return (
    <>
      <PageHeader title={t.library}>
        <span className="text-sm text-muted">
          {filtered.length} {filtered.length === 1 ? t.font_label : t.fonts_label}
        </span>
      </PageHeader>
      <ProofToolbar sources={sources} licences={licences} />
      {isLoading ? (
        <PageSpinner label={t.loading_fonts} />
      ) : filtered.length === 0 ? (
        <EmptyState
          message={(rows ?? []).length === 0 ? t.library_empty : t.no_fonts_match}
        />
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {filtered.map((f) => (
            <FontCard key={f.id} font={f} proofText={proofText} proofSize={proofSize} />
          ))}
        </div>
      )}
    </>
  );
}
