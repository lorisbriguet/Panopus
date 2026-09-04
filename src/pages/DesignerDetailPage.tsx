import { useCallback, useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getDb } from "../db";
import { FontCard } from "../components/fonts/FontCard";
import { Badge, EmptyState, PageSpinner } from "../components/ui";
import { useFonts } from "../hooks/useFonts";
import { useT } from "../i18n/useT";
import { useAppStore } from "../stores/app-store";
import {
  designerSources,
  useDesigners,
  type DesignerRow,
} from "./DesignersPage";

function useUpdateBio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slug, content }: { slug: string; content: string }) => {
      const db = await getDb();
      await db.execute(
        "UPDATE designers SET content_json = $1 WHERE slug = $2",
        [content, slug]
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["designers"] }),
  });
}

/**
 * Stored bio → Tiptap content. The schema default is '{}' (no bio yet),
 * which is not a doc node: map it — and any unparseable value — to an
 * empty editor instead of crashing the page.
 */
function parseBio(contentJson: string): Record<string, unknown> | "" {
  try {
    const doc: unknown = JSON.parse(contentJson);
    if (
      doc !== null &&
      typeof doc === "object" &&
      (doc as Record<string, unknown>).type === "doc"
    ) {
      return doc as Record<string, unknown>;
    }
    return "";
  } catch {
    return "";
  }
}

/** Parse the links column (JSON array of URLs); malformed → no links. */
function parseLinks(links: string): string[] {
  try {
    const arr: unknown = JSON.parse(links);
    if (!Array.isArray(arr)) return [];
    return arr.filter((u): u is string => typeof u === "string");
  } catch {
    return [];
  }
}

/**
 * Editable designer bio — the wiki editor pattern kept from the
 * StudioManager fork (StarterKit + Placeholder + Link, debounced
 * auto-save, flush on unmount), persisting Tiptap doc JSON back to
 * designers.content_json instead of the fork's HTML wiki articles.
 */
function BioEditor({ designer }: { designer: DesignerRow }) {
  const t = useT();
  const updateBio = useUpdateBio();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSave = useCallback(
    (content: string) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        updateBio.mutate({ slug: designer.slug, content });
      }, 2000);
    },
    [designer.slug, updateBio]
  );

  const editor = useEditor(
    {
      extensions: [
        // Tiptap v3 StarterKit already bundles Link — configure it HERE.
        // A separate @tiptap/extension-link entry would register a
        // duplicate whose default openOnClick:true wins and would
        // window.open links inside the app webview.
        StarterKit.configure({ link: { openOnClick: false } }),
        Placeholder.configure({ placeholder: t.designer_bio_placeholder }),
      ],
      content: parseBio(designer.content_json),
      onUpdate: ({ editor: ed }) => debouncedSave(JSON.stringify(ed.getJSON())),
    },
    [designer.slug]
  );

  // Keep refs for unmount cleanup to avoid stale closures (fork pattern)
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const slugRef = useRef(designer.slug);
  slugRef.current = designer.slug;

  // Flush a pending debounced save on unmount so no edits are lost
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        const ed = editorRef.current;
        if (ed) {
          updateBio.mutate({
            slug: slugRef.current,
            content: JSON.stringify(ed.getJSON()),
          });
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only flush; reads live values via refs on purpose (see comment above)
  }, []);

  return (
    <div className="tiptap-editor rounded-xl bg-[var(--color-surface)] border border-[var(--color-border-divider)] p-4">
      <EditorContent editor={editor} />
    </div>
  );
}

export function DesignerDetailPage() {
  const t = useT();
  const { slug } = useParams<{ slug: string }>();
  const { data: designers, isLoading } = useDesigners();
  const { data: fonts } = useFonts();
  const proofText = useAppStore((s) => s.proofText);
  const proofSize = useAppStore((s) => s.proofSize);

  if (isLoading) return <PageSpinner label={t.loading_designers} />;

  const designer = (designers ?? []).find((d) => d.slug === slug);
  if (!designer) return <EmptyState message={t.designer_not_found} />;

  const sources = designerSources(designer);
  const sourceSet = new Set(sources);
  const designerFonts = (fonts ?? []).filter((f) => sourceSet.has(f.source));
  const links = parseLinks(designer.links);

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/designers"
          aria-label={t.back_to_designers}
          title={t.back_to_designers}
          className="text-muted hover:text-[var(--color-text-secondary)] focus-accent rounded p-0.5"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <h1 className="text-xl font-semibold min-w-0 truncate">
          {designer.name}
        </h1>
        <div className="flex items-center gap-1.5 shrink-0">
          {sources.map((s) => (
            <Badge key={s} variant="neutral">
              {s}
            </Badge>
          ))}
        </div>
      </div>

      {/* key: a slug change fully remounts the editor with the new bio */}
      <BioEditor key={designer.slug} designer={designer} />

      {links.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-2">
            {t.designer_links}
          </h2>
          <ul className="flex flex-col gap-1">
            {links.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline focus-accent rounded break-all"
                >
                  <ExternalLink size={14} aria-hidden="true" className="shrink-0" />
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-2">
          {t.designer_fonts_by}
        </h2>
        {designerFonts.length === 0 ? (
          <EmptyState message={t.designer_no_fonts} />
        ) : (
          <div className="flex flex-col gap-3">
            {designerFonts.map((f) => (
              <FontCard
                key={f.id}
                font={f}
                proofText={proofText}
                proofSize={proofSize}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
