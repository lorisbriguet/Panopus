import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import { Toaster, toast } from "sonner";
import { ErrorFallback } from "./components/ErrorFallback";
import { MainLayout } from "./components/layout/MainLayout";
import { GlobalShortcuts } from "./components/GlobalShortcuts";
import { LibraryPage } from "./pages/LibraryPage";
import { ComparePage } from "./pages/ComparePage";
import { DesignersPage } from "./pages/DesignersPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useErrorNotifications } from "./hooks/useErrorNotifications";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useUndoStore } from "./stores/undo-store";
import { getLabels, notifyError } from "./lib/notifyError";

import { queryClient } from "./lib/queryClient";

function StartupChecks() {
  useErrorNotifications();

  // Suppress native WebView context menu globally (Tauri renders its own).
  // Uses bubble phase so React onContextMenu handlers fire first (on #root),
  // then this catches any remaining right-clicks that weren't handled.
  // Allow native menu only on inputs/textareas where users need Copy/Paste.
  useEffect(() => {
    const suppress = (e: MouseEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const editable = (e.target as HTMLElement)?.isContentEditable;
      if (tag === "INPUT" || tag === "TEXTAREA" || editable) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", suppress);
    return () => document.removeEventListener("contextmenu", suppress);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // e.key is "Z" (uppercase) when Shift is held — guard both cases.
      if (!(e.metaKey || e.ctrlKey) || (e.key !== "z" && e.key !== "Z")) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      // Rich-text editors: let the editor handle its own undo/redo
      if (target?.isContentEditable || target?.closest?.('[contenteditable="true"]')) return;

      const store = useUndoStore.getState();
      // Read labels per keypress (not from the mount-time closure) so a
      // mid-session language switch takes effect.
      const t = getLabels();

      if (e.shiftKey) {
        // Redo: Cmd+Shift+Z
        const action = store.redoStack[0];
        if (!action) return;
        e.preventDefault();
        // Remove before executing so a concurrent trigger can't double-run it;
        // put back on failure so it isn't lost and can be retried.
        store.remove(action);
        Promise.resolve(action.execute()).then(() => {
          // Hand the inverse (undo) back to the undo stack without clearing redo
          if (action.redo) {
            store.insertUndo({ label: action.label, execute: action.redo, redo: action.execute }, 0);
          }
          toast.success(`${t.redo_prefix} ${action.label}`);
        }).catch((err) => {
          store.pushRedo(action);
          notifyError(t.redo_failed, err);
        });
      } else {
        // Undo: Cmd+Z
        const action = store.stack[0];
        if (!action) return;
        e.preventDefault();
        // Remove before executing so a concurrent trigger (toast Undo button)
        // can't double-run it; put back on failure so it can be retried.
        store.remove(action);
        Promise.resolve(action.execute()).then(() => {
          if (action.redo) {
            store.pushRedo({ label: action.label, execute: action.redo, redo: action.execute });
          }
          if (action.redirectTo) {
            window.history.pushState({}, "", action.redirectTo);
            window.dispatchEvent(new PopStateEvent("popstate"));
          }
          toast.success(`${t.undo_prefix} ${action.label}`);
        }).catch((err) => {
          store.insertUndo(action, 0);
          notifyError(t.undo_failed, err);
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StartupChecks />
      <BrowserRouter>
        <GlobalShortcuts />
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <Routes>
            <Route element={<MainLayout />}>
              <Route index element={<LibraryPage />} />
              <Route path="library" element={<LibraryPage />} />
              <Route path="compare" element={<ComparePage />} />
              <Route path="designers" element={<DesignersPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </ErrorBoundary>
      </BrowserRouter>
      <Toaster position="bottom-right" />
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
    </QueryClientProvider>
  );
}
