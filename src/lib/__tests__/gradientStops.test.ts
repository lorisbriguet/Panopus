import { test, expect } from "vitest";
import {
  readStops,
  writeStops,
  sampleGradient,
  addStop,
  removeStop,
  moveStop,
  MAX_STOPS,
} from "../gradientStops";

const bw = [
  { color: "#000000", pos: 0 },
  { color: "#ffffff", pos: 1 },
];

test("sampleGradient mirrors the shader's chained lerp", () => {
  expect(sampleGradient(bw, 0)).toBe("#000000");
  expect(sampleGradient(bw, 1)).toBe("#ffffff");
  expect(sampleGradient(bw, 0.5)).toBe("#808080"); // round(127.5) = 128
  // 3 stops: second segment interpolates from the SECOND color
  const rgb = [
    { color: "#000000", pos: 0 },
    { color: "#ff0000", pos: 0.5 },
    { color: "#ffffff", pos: 1 },
  ];
  expect(sampleGradient(rgb, 0.75)).toBe("#ff8080");
});

test("addStop inserts at position with the sampled color, capped at MAX_STOPS", () => {
  const out = addStop(bw, 0.5);
  expect(out).toHaveLength(3);
  expect(out[1]).toEqual({ color: "#808080", pos: 0.5 });
  let cur = bw;
  for (let i = 0; i < 10; i++) cur = addStop(cur, 0.1 + i * 0.05);
  expect(cur).toHaveLength(MAX_STOPS);
});

test("removeStop keeps at least two stops", () => {
  const three = addStop(bw, 0.5);
  expect(removeStop(three, 1)).toHaveLength(2);
  expect(removeStop(bw, 0)).toHaveLength(2); // refused
});

test("moveStop allows crossing and reports the stop's new index", () => {
  const three = [
    { color: "#000000", pos: 0 },
    { color: "#ff0000", pos: 0.4 },
    { color: "#ffffff", pos: 1 },
  ];
  const { stops, index } = moveStop(three, 1, 1.4); // drag red past white
  expect(index).toBe(2);
  expect(stops[2]).toEqual({ color: "#ff0000", pos: 1 }); // clamped 0..1
  expect(stops[1].color).toBe("#ffffff");
});

test("writeStops/readStops round-trip through flat params, sorted", () => {
  const stops = [
    { color: "#ffffff", pos: 1 },
    { color: "#101014", pos: 0 },
    { color: "#e05252", pos: 0.3 },
  ];
  const patch = writeStops(stops);
  expect(patch.stops).toBe(3);
  expect(patch.c1).toBe("#101014");
  expect(patch.p2).toBe(0.3);
  expect(readStops(patch)).toEqual([
    { color: "#101014", pos: 0 },
    { color: "#e05252", pos: 0.3 },
    { color: "#ffffff", pos: 1 },
  ]);
});

test("readStops falls back to the duotone defaults", () => {
  expect(readStops({})).toEqual([
    { color: "#101014", pos: 0 },
    { color: "#f2ede4", pos: 1 },
  ]);
});
