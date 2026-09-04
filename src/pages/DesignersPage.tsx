import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getDb } from "../db";
import { useFonts } from "../hooks/useFonts";
import { useT } from "../i18n/useT";
import { Badge, EmptyState, PageHeader, PageSpinner } from "../components/ui";

export interface DesignerRow {
  id: number;
  name: string;
  slug: string;
  /** Tiptap doc JSON (schema default '{}' = no bio yet). */
  content_json: string;
  /** JSON array of source URLs. */
  links: string;
  /** Comma-joined fonts.source values claimed by this designer. */
  sources: string;
}

async function getDesigners(): Promise<DesignerRow[]> {
  const db = await getDb();
  return db.select<DesignerRow[]>(
    `SELECT d.id, d.name, d.slug, d.content_json, d.links,
            COALESCE(group_concat(ds.source), '') sources
     FROM designers d
     LEFT JOIN designer_sources ds ON ds.designer_id = d.id
     GROUP BY d.id
     ORDER BY d.name`
  );
}

/** Shared designers query — DesignerDetailPage reuses the same cache entry. */
export function useDesigners() {
  return useQuery({ queryKey: ["designers"], queryFn: getDesigners });
}

/** Split the group_concat'ed sources column into clean source names. */
export function designerSources(d: DesignerRow): string[] {
  return d.sources.split(",").filter(Boolean);
}

export function DesignersPage() {
  const t = useT();
  const { data: designers, isLoading } = useDesigners();
  const { data: fonts } = useFonts();

  // fonts.source → file count, so each designer entry can show how many
  // library fonts it covers (via its designer_sources mappings).
  const countsBySource = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of fonts ?? []) map.set(f.source, (map.get(f.source) ?? 0) + 1);
    return map;
  }, [fonts]);

  return (
    <>
      <PageHeader title={t.designers} />
      {isLoading ? (
        <PageSpinner label={t.loading_designers} />
      ) : (designers ?? []).length === 0 ? (
        <EmptyState message={t.designers_empty} />
      ) : (
        <div className="flex flex-col gap-3">
          {(designers ?? []).map((d) => {
            const sources = designerSources(d);
            const fontCount = sources.reduce(
              (n, s) => n + (countsBySource.get(s) ?? 0),
              0
            );
            return (
              <Link
                key={d.slug}
                to={`/designers/${d.slug}`}
                className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border-divider)] p-4 flex items-center justify-between gap-3 hover:border-[var(--color-border)] focus-accent"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{d.name}</div>
                  <div className="text-xs text-muted">
                    {fontCount} {fontCount === 1 ? t.font_label : t.fonts_label}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {sources.map((s) => (
                    <Badge key={s} variant="neutral">
                      {s}
                    </Badge>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
