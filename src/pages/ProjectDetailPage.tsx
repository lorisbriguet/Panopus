import {
  useEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Link, useParams } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ArrowLeft, X } from "lucide-react";
import { FontListRow } from "../components/fonts/FontListRow";
import { FinishTab } from "../components/finish/FinishTab";
import { Button, EmptyState, Input, Modal, PageSpinner } from "../components/ui";
import { useSetActive } from "../hooks/useActivation";
import { useFonts } from "../hooks/useFonts";
import {
  useProject,
  useProjectFontIds,
  useRemoveFontFromProject,
  useRenameProject,
  useSetProjectArtwork,
} from "../hooks/useProjects";
import { useT } from "../i18n/useT";
import { notifyError } from "../lib/notifyError";
import { parseGraph } from "../lib/finishGraph";
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
  const setActive = useSetActive();
  const setArtwork = useSetProjectArtwork();
  const storeProofText = useAppStore((s) => s.proofText);
  const proofSize = useAppStore((s) => s.proofSize);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirmExclusive, setConfirmExclusive] = useState(false);
  const [artworkMissing, setArtworkMissing] = useState(false);
  // Default to "fonts" so the fonts section shows when no artwork is set (no tabs)
  const [activeTab, setActiveTab] = useState<"fonts" | "finish">("fonts");

  // Liveness probe: read_artwork_bytes rejection means the file moved or
  // vanished since it was attached → show the relink prompt. The bytes are
  // deliberately dropped — the Finish tab does the real read when it needs
  // them; this only answers "is the path still good?".
  const artworkPath = project?.artwork_path ?? null;
  useEffect(() => {
    setArtworkMissing(false);
    if (!artworkPath) return;
    let cancelled = false;
    invoke("read_artwork_bytes", { path: artworkPath }).catch(() => {
      if (!cancelled) setArtworkMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [artworkPath]);

  if (isLoading) return <PageSpinner />;
  if (!project) return <EmptyState message={t.project_not_found} />;

  // Waterfall's fallback: an all-whitespace proof text would render every
  // specimen line blank — substitute the default instead.
  const proofText =
    storeProofText.trim() === "" ? DEFAULT_PROOF_TEXT : storeProofText;

  const idSet = new Set(fontIds ?? []);
  const projectFonts = (fonts ?? []).filter((f) => idSet.has(f.id));

  // "Other active" = user fonts currently active that are NOT in this project
  // — the set "Activate exclusively" turns off. System fonts are untouchable.
  const otherActiveIds = (fonts ?? [])
    .filter((f) => f.active === 1 && f.is_system === 0 && !idSet.has(f.id))
    .map((f) => f.id);

  const activateProjectFonts = () =>
    setActive.mutate({ ids: fontIds ?? [], active: true });

  const handleExclusiveClick = () => {
    // Nothing else is active → exclusive degenerates to a plain activate;
    // a "0 fonts will be deactivated" confirm would be noise, so skip it.
    if (otherActiveIds.length === 0) activateProjectFonts();
    else setConfirmExclusive(true);
  };

  const handleExclusiveConfirm = () => {
    setConfirmExclusive(false);
    // Sequence matters: deactivate the others first, THEN activate the
    // project's fonts — chained via the first mutation's per-call onSuccess.
    setActive.mutate(
      { ids: otherActiveIds, active: false },
      { onSuccess: activateProjectFonts }
    );
  };

  const commitRename = () => {
    setEditing(false);
    const name = draft.trim();
    if (!name || name === project.name) return;
    renameProject.mutate({ id: project.id, name });
  };

  // Same picker for first attach AND relink — useSetProjectArtwork
  // overwrites the path either way, and the probe effect re-runs on the
  // new value.
  const pickArtwork = async () => {
    try {
      const picked = await open({
        filters: [{ name: "Image", extensions: ["png", "tif", "tiff"] }],
      });
      if (typeof picked === "string")
        setArtwork.mutate({ id: project.id, path: picked });
    } catch (e) {
      notifyError(t.choose_folder_failed, e);
    }
  };

  const artworkName = artworkPath ? artworkPath.split("/").pop() : null;

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

      {/* Fonts section: visible when no tabs (no artwork) OR when Fonts tab selected */}
      {(!artworkPath || activeTab === "fonts") && (
        <>
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

          <section className="mt-6 flex items-center gap-2">
            <Button
              onClick={activateProjectFonts}
              disabled={(fontIds ?? []).length === 0}
              loading={setActive.isPending}
            >
              {t.project_activate}
            </Button>
            <Button
              variant="secondary"
              onClick={handleExclusiveClick}
              disabled={(fontIds ?? []).length === 0}
              loading={setActive.isPending}
            >
              {t.project_activate_exclusive}
            </Button>
          </section>
        </>
      )}

      <Modal
        open={confirmExclusive}
        onClose={() => setConfirmExclusive(false)}
        title={t.project_activate_exclusive}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmExclusive(false)}
            >
              {t.close}
            </Button>
            <Button onClick={handleExclusiveConfirm}>{t.confirm}</Button>
          </>
        }
      >
        <p className="text-sm text-[var(--color-text-secondary)]">
          {(otherActiveIds.length === 1
            ? t.confirm_exclusive_body_one
            : t.confirm_exclusive_body
          ).replace("{count}", String(otherActiveIds.length))}
        </p>
      </Modal>

      <section className="mt-8">
        <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-2">
          {t.project_artwork_title}
        </h2>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={pickArtwork}
            loading={setArtwork.isPending}
          >
            {t.project_pick_artwork}
          </Button>
          {artworkName &&
            (artworkMissing ? (
              <span className="text-sm text-[var(--color-danger-text)]">
                {t.artwork_missing}
              </span>
            ) : (
              <span className="text-sm text-[var(--color-text-secondary)] truncate">
                {artworkName}
              </span>
            ))}
        </div>
      </section>

      {/* Tab strip: Fonts | Finish (Finish gated on artwork) */}
      {artworkPath && (
        <>
          <div
            role="tablist"
            aria-label={t.finish_tab}
            className="mt-6 flex gap-1 border-b border-[var(--color-border)]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "fonts"}
              onClick={() => setActiveTab("fonts")}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 ${
                activeTab === "fonts"
                  ? "border-accent text-[var(--color-text-secondary)]"
                  : "border-transparent text-muted hover:text-[var(--color-text-secondary)]"
              }`}
            >
              {t.project_fonts_title}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "finish"}
              onClick={() => setActiveTab("finish")}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 ${
                activeTab === "finish"
                  ? "border-accent text-[var(--color-text-secondary)]"
                  : "border-transparent text-muted hover:text-[var(--color-text-secondary)]"
              }`}
            >
              {t.finish_tab}
            </button>
          </div>

          {activeTab === "finish" && (
            <div className="mt-4 h-[600px]">
              <FinishTab
                projectId={project.id}
                artworkPath={artworkPath}
                graph={parseGraph(project.graph_json)}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
