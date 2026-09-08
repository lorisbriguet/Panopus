import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Modal } from "../ui/Modal";
import { Toggle } from "../ui/Toggle";
import { Button } from "../ui/Button";
import {
  DEFAULT_OUTPUT,
  outputPx,
  outputRatio,
  type OutputSettings,
} from "../../lib/finishGraph";
import { useT } from "../../i18n/useT";

const ALL_FORMATS = ["png", "tiff", "pdf"] as const;
type Format = (typeof ALL_FORMATS)[number];

interface ExportProgress {
  stage: string;
  pct: number;
}

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: number;
  /** For the aspect warning; null while the artwork is still loading. */
  artworkBitmap: ImageBitmap | null;
  /** Output node settings (size, density, color space). */
  settings?: OutputSettings;
}

/**
 * Export dialog: pick formats + destination, run export_finish, follow
 * its finish-export-progress events, list the written files.
 */
export function ExportDialog({
  open,
  onClose,
  projectId,
  artworkBitmap,
  settings = DEFAULT_OUTPUT,
}: ExportDialogProps) {
  const t = useT();
  const [formats, setFormats] = useState<Record<Format, boolean>>({
    png: true,
    tiff: false,
    pdf: false,
  });
  const [destDir, setDestDir] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [written, setWritten] = useState<string[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<ExportProgress>("finish-export-progress", (e) => {
      setProgress(e.payload);
    }).then((un) => {
      if (cancelled) un();
      else unlisten = un;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [open]);

  const ratio = outputRatio(settings);
  const px = outputPx(settings);
  // Cropping only happens in fill mode; fit/place never lose pixels.
  const aspectOff =
    settings.fit === "fill" &&
    artworkBitmap !== null &&
    Math.abs(artworkBitmap.width / artworkBitmap.height - ratio) / ratio > 0.01;

  const chosen = ALL_FORMATS.filter((f) => formats[f]);

  const pickDest = async () => {
    const dir = await openDialog({ directory: true });
    if (typeof dir === "string") setDestDir(dir);
  };

  const run = async () => {
    if (!destDir || chosen.length === 0) return;
    setRunning(true);
    setProgress(null);
    setWritten(null);
    try {
      const paths = await invoke<string[]>("export_finish", {
        projectId,
        formats: chosen,
        destDir,
      });
      setWritten(paths);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setRunning(false);
    }
  };

  const formatLabels: Record<Format, string> = {
    png: t.format_png,
    tiff: t.format_tiff,
    pdf: t.format_pdf,
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.export_title}
      footer={
        <Button
          onClick={run}
          disabled={!destDir || chosen.length === 0 || running}
          loading={running}
        >
          {t.export_run}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted font-mono tabular-nums">
          {px.w} × {px.h} px · {settings.dpi} dpi · {settings.color.toUpperCase()}
        </p>
        {aspectOff && (
          <p className="text-xs text-[var(--color-danger-text)]">{t.aspect_warning}</p>
        )}

        <div className="flex flex-col gap-2">
          {ALL_FORMATS.map((f) => (
            <label key={f} className="flex items-center justify-between gap-3 text-sm">
              <span>{formatLabels[f]}</span>
              <Toggle
                checked={formats[f]}
                onChange={(checked) => setFormats((prev) => ({ ...prev, [f]: checked }))}
                disabled={running}
                ariaLabel={formatLabels[f]}
              />
            </label>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={pickDest} disabled={running}>
            {t.export_dest}
          </Button>
          {destDir && (
            <span className="text-xs text-muted truncate" title={destDir}>
              {destDir}
            </span>
          )}
        </div>

        {(running || progress) && written === null && (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress?.pct ?? 0}
            aria-label={t.export_title}
            className="h-1.5 rounded-full bg-[var(--color-input-bg)] overflow-hidden"
          >
            <div
              className="h-full bg-accent transition-[width] duration-200"
              style={{ width: `${progress?.pct ?? 0}%` }}
            />
          </div>
        )}

        {written !== null && (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-[var(--color-success-text)]">{t.export_done}</p>
            <ul className="flex flex-col gap-0.5">
              {written.map((p) => (
                <li key={p} className="text-xs text-muted break-all">
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
