import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Palette, RefreshCw } from "lucide-react";
import { getDb } from "../db";
import { useAppStore, ACCENT_PRESETS, type AccentPreset } from "../stores/app-store";
import { THEMES } from "../lib/themes";
import { useT } from "../i18n/useT";
import type { AppLanguage } from "../i18n/ui";
import { Select, Button } from "../components/ui";
import { Toggle } from "../components/ui/Toggle";
import { logError } from "../lib/log";
import { notifyError } from "../lib/notifyError";

type SettingsCategory = "library" | "appearance";

/** Shape returned by the Rust `index_library` command. */
interface IndexReport {
  indexed: number;
  quarantined: number;
  removed: number;
}

interface ProblemRow {
  id: number;
  family: string;
  path: string;
}

/** All settings rows as a key → value map (queryKey ['settings']). */
function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async (): Promise<Record<string, string>> => {
      const db = await getDb();
      const rows = await db.select<{ key: string; value: string }[]>(
        "SELECT key, value FROM settings"
      );
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },
  });
}

/** Quarantined fonts — files the indexer could not parse (family holds the
 *  filename for those rows, see indexer::upsert_one). */
function useProblems() {
  return useQuery({
    queryKey: ["problems"],
    queryFn: async (): Promise<ProblemRow[]> => {
      const db = await getDb();
      return db.select<ProblemRow[]>(
        "SELECT id, family, path FROM fonts WHERE quarantined = 1 ORDER BY family, path"
      );
    },
  });
}

export function SettingsPage() {
  const accentColor = useAppStore((s) => s.accentColor);
  const setAccentColor = useAppStore((s) => s.setAccentColor);
  const themeId = useAppStore((s) => s.themeId);
  const setTheme = useAppStore((s) => s.setTheme);
  const reduceMotion = useAppStore((s) => s.reduceMotion);
  const setReduceMotion = useAppStore((s) => s.setReduceMotion);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("library");
  const [appVersion, setAppVersion] = useState("");
  const t = useT();
  const qc = useQueryClient();

  const { data: settings } = useSettings();
  const { data: problems } = useProblems();

  const updateLibraryPath = useMutation({
    mutationFn: async (path: string) => {
      const db = await getDb();
      await db.execute("UPDATE settings SET value = $1 WHERE key = 'library_path'", [path]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
    onError: (e) => notifyError(t.library_path_update_failed, e),
  });

  const reindex = useMutation({
    mutationFn: () => invoke<IndexReport>("index_library"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fonts"] });
      qc.invalidateQueries({ queryKey: ["problems"] });
    },
    onError: (e) => notifyError(t.reindex_failed, e),
  });

  useEffect(() => {
    getVersion().then(setAppVersion).catch((e) => logError("Failed to read app version:", e));
  }, []);

  const pickLibraryFolder = async () => {
    try {
      const picked = await open({ directory: true });
      if (typeof picked === "string") updateLibraryPath.mutate(picked);
    } catch (e) {
      notifyError(t.choose_folder_failed, e);
    }
  };

  const reveal = (path: string) => {
    invoke("open_in_finder", { path }).catch((e) => notifyError(t.reveal_failed, e));
  };

  const renderLibrary = () => (
    <div className="space-y-6">
      <div>
        <label className="block mb-1.5 text-sm font-medium text-fg-base">
          {t.library_folder}
        </label>
        <div className="flex items-center gap-3">
          <code className="flex-1 min-w-0 break-all text-xs text-[var(--color-text-secondary)] bg-[var(--color-input-bg)] border border-[var(--color-input-border)] rounded-md px-2.5 py-1.5">
            {settings?.library_path ?? ""}
          </code>
          <Button
            variant="secondary"
            size="sm"
            onClick={pickLibraryFolder}
            loading={updateLibraryPath.isPending}
            icon={<FolderOpen size={14} aria-hidden="true" />}
          >
            {t.choose_folder}
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-muted">{t.library_folder_restart_note}</p>
      </div>

      <div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => reindex.mutate()}
          loading={reindex.isPending}
          icon={<RefreshCw size={14} aria-hidden="true" />}
        >
          {t.reindex_library}
        </Button>
        {reindex.data && !reindex.isPending && (
          <p className="mt-2 text-xs text-muted tabular-nums" role="status">
            {reindex.data.indexed} {t.report_indexed} ·{" "}
            {reindex.data.quarantined} {t.report_quarantined} ·{" "}
            {reindex.data.removed} {t.report_removed}
          </p>
        )}
      </div>

      <div className="pt-4 border-t border-[var(--color-border-divider)]">
        <h3 className="text-sm font-medium text-fg-base mb-1">{t.problems}</h3>
        <p className="text-xs text-muted mb-3">{t.problems_desc}</p>
        {(problems ?? []).length === 0 ? (
          <p className="text-xs text-muted">{t.problems_empty}</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border-divider)]">
            {(problems ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{p.family}</div>
                  <div className="text-xs text-muted break-all">{p.path}</div>
                </div>
                <button
                  type="button"
                  onClick={() => reveal(p.path)}
                  aria-label={t.reveal_in_finder}
                  title={t.reveal_in_finder}
                  className="shrink-0 text-muted hover:text-[var(--color-text-secondary)] focus-accent rounded p-0.5"
                >
                  <FolderOpen size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  const renderAppearance = () => (
    <div className="space-y-6">
      <div>
        <label className="block mb-1.5 text-sm font-medium text-fg-base">
          {t.app_language}
        </label>
        <Select
          value={language}
          onChange={(e) => setLanguage(e.target.value as AppLanguage)}
        >
          <option value="en">English</option>
          <option value="fr">Français</option>
        </Select>
      </div>

      <div>
        <label className="block mb-1.5 text-sm font-medium text-fg-base">
          {t.theme}
        </label>
        <Select
          value={themeId}
          onChange={(e) => setTheme(e.target.value)}
        >
          {Object.entries(THEMES).map(([id, theme]) => (
            <option key={id} value={id}>
              {theme.name}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label className="block mb-1.5 text-sm font-medium text-fg-base">
          {t.accent_color}
        </label>
        <div className="grid grid-cols-6 gap-2">
          {ACCENT_PRESETS.map((preset: AccentPreset) => (
            <button
              key={preset.name}
              onClick={() => setAccentColor(preset)}
              className={`
                h-10 rounded-md border-2 transition-all
                ${accentColor.name === preset.name ? "border-accent ring-2 ring-accent/30" : "border-transparent hover:border-border"}
              `}
              style={{ backgroundColor: preset.color }}
              title={preset.name}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-fg-base">{t.reduce_motion}</div>
          <div className="text-xs text-fg-subtle mt-0.5">{t.reduce_motion_desc}</div>
        </div>
        <Toggle checked={reduceMotion} onChange={setReduceMotion} />
      </div>

      <div className="mt-8 pt-6 border-t border-border">
        <div className="text-xs text-fg-subtle">Version {appVersion}</div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold text-fg-base mb-6">{t.settings}</h1>

        <div className="flex gap-6">
          <div className="w-48 shrink-0">
            <nav className="space-y-1">
              <Button
                variant={activeCategory === "library" ? "secondary" : "ghost"}
                className="w-full justify-start"
                onClick={() => setActiveCategory("library")}
              >
                <FolderOpen className="mr-2 h-4 w-4" />
                {t.library}
              </Button>
              <Button
                variant={activeCategory === "appearance" ? "secondary" : "ghost"}
                className="w-full justify-start"
                onClick={() => setActiveCategory("appearance")}
              >
                <Palette className="mr-2 h-4 w-4" />
                {t.appearance}
              </Button>
            </nav>
          </div>

          <div className="flex-1">
            <div className="bg-bg-elevated rounded-lg p-6 border border-border">
              {activeCategory === "library" && renderLibrary()}
              {activeCategory === "appearance" && renderAppearance()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
