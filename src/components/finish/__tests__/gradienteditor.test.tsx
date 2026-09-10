import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GradientMapParams } from "../ParamsPanel";
import type { GraphNode } from "../../../lib/finishGraph";

// Photoshop grammar (#387 node review): click the bar to add a stop
// with the gradient's sampled color; drag a marker off the bar to
// delete it; stops may cross.

const onParamsChange = vi.fn();

function renderEditor(params: Record<string, number | string>) {
  const node: GraphNode = {
    id: "g",
    kind: "effect",
    effectId: "gradientmap",
    params,
    x: 0,
    y: 0,
  };
  const r = render(<GradientMapParams node={node} onParamsChange={onParamsChange} />);
  const bar = screen.getByTestId("gradient-bar");
  bar.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 100, bottom: 28, width: 100, height: 28, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return { ...r, bar };
}

beforeEach(() => onParamsChange.mockClear());

test("clicking the bar adds a stop there with the sampled color", () => {
  const { bar } = renderEditor({ stops: 2, c1: "#000000", p1: 0, c2: "#ffffff", p2: 1 });
  fireEvent.pointerDown(bar, { clientX: 50, clientY: 14 });
  const patch = onParamsChange.mock.calls[onParamsChange.mock.calls.length - 1][0];
  expect(patch.stops).toBe(3);
  expect(patch.c2).toBe("#808080");
  expect(patch.p2).toBe(0.5);
});

test("dragging a marker off the bar deletes it (Photoshop gesture)", () => {
  const { bar } = renderEditor({
    stops: 3,
    c1: "#000000", p1: 0,
    c2: "#ff0000", p2: 0.4,
    c3: "#ffffff", p3: 1,
  });
  fireEvent.pointerDown(screen.getByRole("button", { name: "stop 2" }), {
    clientX: 40, clientY: 14,
  });
  fireEvent.pointerMove(bar, { clientX: 40, clientY: 120 }); // far below
  fireEvent.pointerUp(bar);
  const patch = onParamsChange.mock.calls[onParamsChange.mock.calls.length - 1][0];
  expect(patch.stops).toBe(2);
  expect(patch.c1).toBe("#000000");
  expect(patch.c2).toBe("#ffffff");
});

test("stops can cross while dragging (list reorders)", () => {
  const { bar } = renderEditor({
    stops: 3,
    c1: "#000000", p1: 0,
    c2: "#ff0000", p2: 0.4,
    c3: "#ffffff", p3: 1,
  });
  fireEvent.pointerDown(screen.getByRole("button", { name: "stop 2" }), {
    clientX: 40, clientY: 14,
  });
  fireEvent.pointerMove(bar, { clientX: 120, clientY: 14 }); // past the last stop
  const patch = onParamsChange.mock.calls[onParamsChange.mock.calls.length - 1][0];
  expect(patch.c3).toBe("#ff0000"); // red is now the last slot
  expect(patch.p3).toBe(1); // clamped
});

test("double-clicking a marker opens the color picker at the marker", () => {
  renderEditor({ stops: 2, c1: "#000000", p1: 0, c2: "#ffffff", p2: 1 });
  expect(screen.queryByRole("dialog", { name: "color picker" })).toBeNull();
  fireEvent.doubleClick(screen.getByRole("button", { name: "stop 1" }));
  expect(screen.getByRole("dialog", { name: "color picker" })).toBeInTheDocument();
});

test("dragging off the bar never deletes below two stops", () => {
  const { bar } = renderEditor({ stops: 2, c1: "#000000", p1: 0, c2: "#ffffff", p2: 1 });
  fireEvent.pointerDown(screen.getByRole("button", { name: "stop 1" }), {
    clientX: 0, clientY: 14,
  });
  fireEvent.pointerMove(bar, { clientX: 0, clientY: 120 });
  fireEvent.pointerUp(bar);
  const patch = onParamsChange.mock.calls[onParamsChange.mock.calls.length - 1][0];
  expect(patch.stops).toBe(2);
});
