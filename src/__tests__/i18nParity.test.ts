import { describe, it, expect } from "vitest";
import ui from "../i18n/ui";
describe("i18n parity", () => {
  it("EN and FR have identical key sets", () => {
    const en = Object.keys(ui.en).sort();
    const fr = Object.keys(ui.fr).sort();
    expect(en.length).toBe(fr.length);
    expect(en).toEqual(fr);
  });
});
