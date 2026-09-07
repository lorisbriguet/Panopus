import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ExportDialog } from "../ExportDialog";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

// invoke (export_finish), open (destination picker) and listen (progress
// events) all live in the shared src/__mocks__/tauri-api.ts stub — the
// vitest alias maps @tauri-apps/api/core, @tauri-apps/plugin-dialog AND
// @tauri-apps/api/event to that ONE file, so one factory overrides all
// three names on the same resolved module (see projects.test.tsx).
const tauriMocks = vi.hoisted(() => {
  const invokeMock = vi.fn<(cmd: string, args?: unknown) => Promise<unknown>>();
  const openMock = vi.fn<() => Promise<string | null>>();
  type Handler = (event: { payload: unknown }) => void;
  const listeners: Record<string, Handler[]> = {};
  const listenMock = vi.fn(async (name: string, handler: Handler) => {
    (listeners[name] ??= []).push(handler);
    return () => {
      listeners[name] = (listeners[name] ?? []).filter((h) => h !== handler);
    };
  });
  const emit = (name: string, payload: unknown) => {
    for (const h of listeners[name] ?? []) h({ payload });
  };
  const factory = async (
    importOriginal: () => Promise<Record<string, unknown>>
  ) => ({
    ...(await importOriginal()),
    invoke: invokeMock,
    open: openMock,
    listen: listenMock,
  });
  return { invokeMock, openMock, listenMock, emit, listeners, factory };
});
vi.mock("@tauri-apps/api/core", tauriMocks.factory);
vi.mock("@tauri-apps/plugin-dialog", tauriMocks.factory);
vi.mock("@tauri-apps/api/event", tauriMocks.factory);
const { invokeMock, openMock, emit } = tauriMocks;

function renderDialog(overrides: Partial<Parameters<typeof ExportDialog>[0]> = {}) {
  return render(
    <ExportDialog
      open
      onClose={() => {}}
      projectId={7}
      artworkBitmap={null}
      {...overrides}
    />
  );
}

beforeEach(() => {
  invokeMock.mockReset();
  openMock.mockReset();
  for (const k of Object.keys(tauriMocks.listeners)) delete tauriMocks.listeners[k];
});

describe("ExportDialog", () => {
  it("invokes export_finish with only the checked formats", async () => {
    openMock.mockResolvedValue("/tmp/out");
    invokeMock.mockResolvedValue([]);
    renderDialog();

    // png is on by default; also enable tiff, leave pdf off
    fireEvent.click(screen.getByRole("switch", { name: "TIFF" }));
    fireEvent.click(screen.getByRole("button", { name: /choose destination/i }));
    await waitFor(() => expect(screen.getByText("/tmp/out")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("export_finish", {
        projectId: 7,
        formats: ["png", "tiff"],
        destDir: "/tmp/out",
      })
    );
  });

  it("export button stays disabled without a destination", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("updates the progress bar from finish-export-progress events", async () => {
    renderDialog();
    await waitFor(() => expect(tauriMocks.listenMock).toHaveBeenCalled());
    act(() => {
      emit("finish-export-progress", { stage: "render", pct: 50 });
    });
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "50");
  });

  it("lists written paths on success", async () => {
    openMock.mockResolvedValue("/tmp/out");
    invokeMock.mockResolvedValue([
      "/tmp/out/poster-f4-300dpi.png",
      "/tmp/out/poster-f4-300dpi.pdf",
    ]);
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /choose destination/i }));
    await waitFor(() => expect(screen.getByText("/tmp/out")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    await waitFor(() =>
      expect(screen.getByText(/export complete/i)).toBeInTheDocument()
    );
    expect(screen.getByText("/tmp/out/poster-f4-300dpi.png")).toBeInTheDocument();
    expect(screen.getByText("/tmp/out/poster-f4-300dpi.pdf")).toBeInTheDocument();
  });

  it("warns when the artwork aspect is >1% off F4", () => {
    // 1:1 square vs F4's 10571/15118 — way off
    renderDialog({
      artworkBitmap: { width: 1000, height: 1000 } as ImageBitmap,
    });
    expect(screen.getByText(/aspect ratio/i)).toBeInTheDocument();
  });

  it("does not warn when the artwork matches F4 within 1%", () => {
    renderDialog({
      artworkBitmap: { width: 10571, height: 15118 } as ImageBitmap,
    });
    expect(screen.queryByText(/aspect ratio/i)).not.toBeInTheDocument();
  });
});
