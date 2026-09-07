import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
import { FontListRow } from "../components/fonts/FontListRow";
import { EmptyState, Input, PageSpinner } from "../components/ui";
import { useFonts } from "../hooks/useFonts";
import {
  useProject,
  useProjectFontIds,
  useRemoveFontFromProject,
  useRenameProject,
} from "../hooks/useProjects";
import { useT } from "../i18n/useT";
import { DEFAULT_PROOF_TEXT, useAppStore } from "../stores/app-store";

/**
 * /projects/:id — project name with inline rename (TagManagerRow pattern:
 * click → input, Enter/blur commits, Escape cancels), the project's fonts
 * as FontListRows (no detail panel on this page — rows are display-only)
 * each with a remove-from-project button beside the row.
 */
export function ProjectDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const { data: project, isLoading } = useProject(projectId);
  const { data: fontIds } = useProjectFontIds(projectId);
  const { data: fonts } = useFonts();
  const renameProject = useRenameProject();
  const removeFont = useRemoveFontFromProject();
  const storeProofText = useAppStore((s) => s.proofText);
  const proofSize = useAppStore((s) => s.proofSize);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (isLoading) return <PageSpinner />;
  if (!project) return <EmptyState message={t.project_not_found} />;

  // Waterfall's fallback: an all-whitespace proof text would render every
  // specimen line blank — substitute the default instead.
  const proofText =
    storeProofText.trim() === "" ? DEFAULT_PROOF_TEXT : storeProofText;

  const idSet = new Set(fontIds ?? []);
  const projectFonts = (fonts ?? []).filter((f) => idSet.has(f.id));

  const commitRename = () => {
    setEditing(false);
    const name = draft.trim();
    if (!name || name === project.name) return;
    renameProject.mutate({ id: project.id, name });
  };

  const handleRenameKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setDraft(project.name);
      setEditing(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/projects"
          aria-label={t.back_to_projects}
          title={t.back_to_projects}
          className="text-muted hover:text-[var(--color-text-secondary)] focus-accent rounded p-0.5"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        {editing ? (
          <Input
            fullWidth={false}
            className="w-64"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleRenameKey}
            aria-label={t.project_rename}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(project.name);
              setEditing(true);
            }}
            title={t.project_rename}
            className="text-xl font-semibold min-w-0 truncate text-left hover:text-accent focus-accent rounded px-0.5"
          >
            {project.name}
          </button>
        )}
      </div>

      <section>
        <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-2">
          {t.project_fonts_title}
        </h2>
        {projectFonts.length === 0 ? (
          <EmptyState message={t.project_empty} />
        ) : (
          <ul className="flex flex-col">
            {projectFonts.map((f) => (
              <li key={f.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <FontListRow
                    font={f}
                    proofText={proofText}
                    proofSize={proofSize}
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    removeFont.mutate({ projectId: project.id, fontId: f.id })
                  }
                  aria-label={`${t.project_remove_font}: ${f.family} ${f.style}`}
                  title={t.project_remove_font}
                  className="shrink-0 text-muted hover:text-[var(--color-danger-text)] focus-accent rounded p-0.5"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Placeholder: artwork board section — Task 4 mounts it here. */}
      {/* Placeholder: activation graph section — Task 5 mounts it here. */}
    </>
  );
}
