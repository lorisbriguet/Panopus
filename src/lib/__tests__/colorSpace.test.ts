import { test, expect } from "vitest";
import {
  hexToRgb,
  rgbToHex,
  rgbToHsv,
  hsvToRgb,
  normalizeHex,
} from "../colorSpace";

test("hex <-> rgb", () => {
  expect(hexToRgb("#ff8000")).toEqual([255, 128, 0]);
  expect(hexToRgb("#abc")).toEqual([170, 187, 204]);
  expect(rgbToHex(255, 128, 0)).toBe("#ff8000");
  expect(hexToRgb("nonsense")).toBeNull();
});

test("rgb -> hsv on known anchors", () => {
  expect(rgbToHsv(255, 0, 0)).toEqual([0, 1, 1]);
  expect(rgbToHsv(0, 255, 0)).toEqual([120, 1, 1]);
  const [h, s, v] = rgbToHsv(128, 128, 128);
  expect(h).toBe(0);
  expect(s).toBe(0);
  expect(v).toBeCloseTo(128 / 255, 5);
});

test("hsv -> rgb on known anchors", () => {
  expect(hsvToRgb(0, 1, 1)).toEqual([255, 0, 0]);
  expect(hsvToRgb(240, 1, 1)).toEqual([0, 0, 255]);
  expect(hsvToRgb(60, 1, 1)).toEqual([255, 255, 0]);
  expect(hsvToRgb(0, 0, 0.5)).toEqual([128, 128, 128]);
});

test("hsv round-trips through rgb within 1/255", () => {
  for (const [h, s, v] of [[17, 0.3, 0.9], [200, 0.85, 0.4], [330, 0.5, 0.66]]) {
    const [r, g, b] = hsvToRgb(h, s, v);
    const [h2, s2, v2] = rgbToHsv(r, g, b);
    expect(Math.abs(h2 - h)).toBeLessThan(2);
    expect(Math.abs(s2 - s)).toBeLessThan(0.02);
    expect(Math.abs(v2 - v)).toBeLessThan(0.005);
  }
});

test("normalizeHex accepts loose input, rejects garbage", () => {
  expect(normalizeHex("aabbcc")).toBe("#aabbcc");
  expect(normalizeHex("#AABBCC")).toBe("#aabbcc");
  expect(normalizeHex("abc")).toBe("#aabbcc");
  expect(normalizeHex(" #ff8000 ")).toBe("#ff8000");
  expect(normalizeHex("xyz")).toBeNull();
  expect(normalizeHex("#12345")).toBeNull();
});
