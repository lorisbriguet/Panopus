import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
} from "../hooks/useProjects";
import { useT } from "../i18n/useT";
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  PageSpinner,
} from "../components/ui";

/**
 * /projects — create a project by name, list all projects (each row links
 * to its detail page) and delete with the two-click confirm pattern from
 * TagManager (first click arms the row, second click deletes; there is no
 * ConfirmDialog in the house kit).
 */
export function ProjectsPage() {
  const t = useT();
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const [name, setName] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || createProject.isPending) return;
    createProject.mutate(trimmed, { onSuccess: () => setName("") });
  };

  const handleDelete = (id: number) => {
    setConfirmId(null);
    deleteProject.mutate(id);
  };

  return (
    <>
      <PageHeader title={t.projects} />
      <form onSubmit={handleCreate} className="mb-4 flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.project_new_placeholder}
          aria-label={t.project_new_placeholder}
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={name.trim() === ""}
          loading={createProject.isPending}
        >
          {t.project_create}
        </Button>
      </form>
      {isLoading ? (
        <PageSpinner />
      ) : (projects ?? []).length === 0 ? (
        <EmptyState message={t.projects_empty} />
      ) : (
        <ul className="flex flex-col gap-3">
          {(projects ?? []).map((p) => {
            const confirming = confirmId === p.id;
            return (
              <li
                key={p.id}
                className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border-divider)] p-4 flex items-center justify-between gap-3 hover:border-[var(--color-border)]"
              >
                {/* The delete button sits OUTSIDE the link (no nested
                    interactive elements) — only the name area navigates. */}
                <Link
                  to={`/projects/${p.id}`}
                  className="min-w-0 flex-1 focus-accent rounded"
                >
                  <div className="text-sm font-medium truncate">{p.name}</div>
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    confirming ? handleDelete(p.id) : setConfirmId(p.id)
                  }
                  aria-label={`${
                    confirming ? t.confirm_delete_project : t.project_delete
                  } ${p.name}`}
                  title={
                    confirming ? t.confirm_delete_project : t.project_delete
                  }
                  className={`shrink-0 flex items-center gap-1 text-xs focus-accent rounded p-0.5 ${
                    confirming
                      ? "text-[var(--color-danger-text)] font-medium"
                      : "text-muted hover:text-[var(--color-danger-text)]"
                  }`}
                >
                  {confirming && <span>{t.confirm_delete_project}</span>}
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
