import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useSetActive, type FontActivationResult } from "../useActivation";
import type { FontRow } from "../../lib/fontFilters";

// Final fix wave: useSetActive used to discard the per-id results, so a
// partial CoreText failure (command ok, some ids ok:false) was silent.

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("../../lib/log", () => ({ logError: vi.fn() }));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const results = (spec: Array<[number, boolean]>): FontActivationResult[] =>
  spec.map(([id, ok]) => ({ id, ok, error: ok ? null : "CoreText refused" }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(toast.error).mockClear();
});

describe("useSetActive partial-failure feedback", () => {
  it("toasts a counted message when some ids fail to activate", async () => {
    vi.mocked(invoke).mockResolvedValue(results([[1, true], [2, false], [3, false]]));
    const { result } = renderHook(() => useSetActive(), { wrapper });
    result.current.mutate({ ids: [1, 2, 3], active: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("2 fonts could not be activated");
  });

  it("uses the deactivation wording (singular) when one id fails", async () => {
    vi.mocked(invoke).mockResolvedValue(results([[1, false]]));
    const { result } = renderHook(() => useSetActive(), { wrapper });
    result.current.mutate({ ids: [1], active: false });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.error).toHaveBeenCalledWith("1 font could not be deactivated");
  });

  it("stays silent when every id succeeds", async () => {
    vi.mocked(invoke).mockResolvedValue(results([[1, true], [2, true]]));
    const { result } = renderHook(() => useSetActive(), { wrapper });
    result.current.mutate({ ids: [1, 2], active: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("does not flip the mutation into an error state (consumers use .mutate)", async () => {
    vi.mocked(invoke).mockResolvedValue(results([[1, false]]));
    const { result } = renderHook(() => useSetActive(), { wrapper });
    result.current.mutate({ ids: [1], active: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isError).toBe(false);
  });
});

// Optimistic cache: the ["fonts"] master query measures 4-14s in the field
// (Panopus.log slow-statement warnings), so the toggle must flip from the
// cache immediately — the settled invalidate remains the truth-restorer.
const fontRow = (o: Partial<FontRow>): FontRow => ({
  id: 1,
  path: "/a",
  family: "Rye",
  style: "Regular",
  ps_name: null,
  source: "astigmatic",
  format: "ttf",
  glyph_count: 100,
  is_system: 0,
  active: 0,
  favorite: 0,
  quarantined: 0,
  licence_status: "free",
  sample_text: null,
  tag_ids: "",
  ...o,
});

function makeHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrap };
}

describe("useSetActive optimistic cache", () => {
  it("flips active in the fonts cache before the command resolves", async () => {
    const { qc, wrap } = makeHarness();
    qc.setQueryData(["fonts"], [fontRow({ id: 1 }), fontRow({ id: 2 })]);
    let resolve!: (v: FontActivationResult[]) => void;
    vi.mocked(invoke).mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useSetActive(), { wrapper: wrap });
    act(() => result.current.mutate({ ids: [1], active: true }));
    await waitFor(() =>
      expect(qc.getQueryData<FontRow[]>(["fonts"])![0].active).toBe(1)
    );
    expect(qc.getQueryData<FontRow[]>(["fonts"])![1].active).toBe(0);
    act(() => resolve(results([[1, true]])));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("never patches system rows (their cache state is macOS's, not ours)", async () => {
    const { qc, wrap } = makeHarness();
    qc.setQueryData(["fonts"], [fontRow({ id: 5, is_system: 1 })]);
    vi.mocked(invoke).mockResolvedValue(results([[5, true]]));
    const { result } = renderHook(() => useSetActive(), { wrapper: wrap });
    act(() => result.current.mutate({ ids: [5], active: true }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData<FontRow[]>(["fonts"])![0].active).toBe(0);
  });

  it("rolls the cache back when the command rejects", async () => {
    const { qc, wrap } = makeHarness();
    qc.setQueryData(["fonts"], [fontRow({ id: 1 })]);
    vi.mocked(invoke).mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useSetActive(), { wrapper: wrap });
    act(() => result.current.mutate({ ids: [1], active: true }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<FontRow[]>(["fonts"])![0].active).toBe(0);
  });

  it("reverts only the failed ids on partial failure", async () => {
    const { qc, wrap } = makeHarness();
    qc.setQueryData(["fonts"], [fontRow({ id: 1 }), fontRow({ id: 2 })]);
    vi.mocked(invoke).mockResolvedValue(results([[1, true], [2, false]]));
    const { result } = renderHook(() => useSetActive(), { wrapper: wrap });
    act(() => result.current.mutate({ ids: [1, 2], active: true }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const rows = qc.getQueryData<FontRow[]>(["fonts"])!;
    expect(rows[0].active).toBe(1);
    expect(rows[1].active).toBe(0);
  });
});
