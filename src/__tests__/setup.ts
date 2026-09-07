import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// happy-dom gives @tanstack/react-virtual a zero-size scroll viewport, so the
// real virtualizer would mount NOTHING. Passthrough mock: every index is
// "visible" (start stacked by estimate, measureElement a no-op) so component
// tests keep exercising real row rendering.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: {
    count: number;
    estimateSize: (index: number) => number;
    getItemKey?: (index: number) => string | number;
    scrollMargin?: number;
  }) => {
    let start = 0;
    const items = Array.from({ length: opts.count }, (_, index) => {
      const size = opts.estimateSize(index);
      const item = {
        index,
        key: opts.getItemKey?.(index) ?? index,
        start,
        end: start + size,
        size,
        lane: 0,
      };
      start += size;
      return item;
    });
    return {
      getVirtualItems: () => items,
      getTotalSize: () => start,
      measureElement: () => {},
      measure: () => {},
      options: { scrollMargin: opts.scrollMargin ?? 0 },
    };
  },
}));

// Minimal localStorage mock for jsdom
const store: Record<string, string> = {};
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => {
      store[key] = val;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  },
});

// matchMedia stub
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
