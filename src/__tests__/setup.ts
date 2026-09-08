import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import type { ComponentType, ReactNode } from "react";

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

// @xyflow/react needs real layout/ResizeObserver/d3-zoom plumbing that
// happy-dom lacks. Minimal passthrough mock: renders every node through its
// registered nodeType component (so node labels/params reach the DOM),
// renders children, and parks the latest props on
// globalThis.__xyflowProps so tests can drive onConnect/onNodesChange etc.
// directly.
type XyMockNode = {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  selected?: boolean;
};
type XyMockProps = {
  nodes?: XyMockNode[];
  nodeTypes?: Record<string, unknown>;
  children?: unknown;
} & Record<string, unknown>;

vi.mock("@xyflow/react", async () => {
  const { createElement } = await import("react");
  const ReactFlow = (props: XyMockProps) => {
    (globalThis as Record<string, unknown>).__xyflowProps = props;
    return createElement(
      "div",
      { "data-testid": "react-flow" },
      (props.nodes ?? []).map((n) => {
        const Comp = props.nodeTypes?.[n.type ?? "default"] as
          | ComponentType<{
              id: string;
              data: Record<string, unknown> | undefined;
              selected: boolean;
            }>
          | undefined;
        return createElement(
          "div",
          { key: n.id, "data-nodeid": n.id },
          Comp
            ? createElement(Comp, {
                id: n.id,
                data: n.data,
                selected: !!n.selected,
              })
            : n.id
        );
      }),
      props.children as ReactNode
    );
  };
  return {
    ReactFlow,
    default: ReactFlow,
    ReactFlowProvider: (p: { children?: unknown }) => p.children,
    Panel: (p: { children?: unknown }) => p.children,
    Handle: () => null,
    Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
    // Passthrough: tests assert on the graph, not rf-internal node state.
    applyNodeChanges: (_changes: unknown[], nodes: XyMockNode[]) => nodes,
  };
});

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
