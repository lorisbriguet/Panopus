import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ColorPicker } from "../ColorPicker";

const onChange = vi.fn();

function openPicker(value = "#ff0000") {
  render(<ColorPicker value={value} onChange={onChange} ariaLabel="ink" />);
  fireEvent.click(screen.getByRole("button", { name: "ink" }));
  const sv = screen.getByTestId("sv-field");
  const hue = screen.getByTestId("hue-strip");
  const rect = (w: number, h: number) =>
    ({ left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  sv.getBoundingClientRect = () => rect(100, 100);
  hue.getBoundingClientRect = () => rect(360, 12);
  return { sv, hue };
}

beforeEach(() => onChange.mockClear());

test("clicking the saturation/value field picks s and v for the current hue", () => {
  const { sv } = openPicker("#ff0000"); // h 0, s 1, v 1
  fireEvent.pointerDown(sv, { clientX: 50, clientY: 50 }); // s .5, v .5
  expect(onChange).toHaveBeenLastCalledWith("#804040");
});

test("the hue strip re-hues while keeping s/v", () => {
  const { hue } = openPicker("#ff0000");
  fireEvent.pointerDown(hue, { clientX: 120, clientY: 6 }); // 120deg
  expect(onChange).toHaveBeenLastCalledWith("#00ff00");
});

test("hex field commits loose input on Enter", () => {
  openPicker("#ff0000");
  const hex = screen.getByLabelText("hex");
  fireEvent.change(hex, { target: { value: "00ff88" } });
  fireEvent.keyDown(hex, { key: "Enter" });
  expect(onChange).toHaveBeenLastCalledWith("#00ff88");
});

test("rgb channel fields write directly", () => {
  openPicker("#000000");
  fireEvent.change(screen.getByLabelText("g"), { target: { value: "255" } });
  expect(onChange).toHaveBeenLastCalledWith("#00ff00");
});

test("escape closes the dialog", () => {
  openPicker();
  expect(screen.getByRole("dialog", { name: "color picker" })).toBeInTheDocument();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "color picker" })).toBeNull();
});
