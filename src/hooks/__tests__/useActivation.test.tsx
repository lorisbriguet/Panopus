import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useSetActive, type FontActivationResult } from "../useActivation";

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

  it("uses the deactivation wording when active is false", async () => {
    vi.mocked(invoke).mockResolvedValue(results([[1, false]]));
    const { result } = renderHook(() => useSetActive(), { wrapper });
    result.current.mutate({ ids: [1], active: false });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.error).toHaveBeenCalledWith("1 fonts could not be deactivated");
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
