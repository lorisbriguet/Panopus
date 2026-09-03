import { describe, expect, test, vi } from "vitest";
import { ensureFontFace, __resetForTest } from "../FontFaceLoader";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
}));

describe("ensureFontFace", () => {
  test("injects one rule per font id", () => {
    __resetForTest();
    expect(ensureFontFace(7, "/lib/a.ttf")).toBe("pf7");
    ensureFontFace(7, "/lib/a.ttf");
    const sheet = document.getElementById("panopus-fontfaces") as HTMLStyleElement;
    expect(sheet.sheet!.cssRules).toHaveLength(1);
    expect(sheet.sheet!.cssRules[0].cssText).toContain("asset://");
  });

  test("distinct ids get distinct rules in the same singleton sheet", () => {
    __resetForTest();
    expect(ensureFontFace(1, "/lib/a.ttf")).toBe("pf1");
    expect(ensureFontFace(2, "/lib/b.otf")).toBe("pf2");
    const styles = document.querySelectorAll("style#panopus-fontfaces");
    expect(styles).toHaveLength(1);
    const sheet = styles[0] as HTMLStyleElement;
    expect(sheet.sheet!.cssRules).toHaveLength(2);
    expect(sheet.sheet!.cssRules[0].cssText).toContain("pf1");
    expect(sheet.sheet!.cssRules[1].cssText).toContain("pf2");
  });

  test("escapes double quotes in the converted URL", () => {
    __resetForTest();
    ensureFontFace(3, '/lib/we"ird.ttf');
    const sheet = document.getElementById("panopus-fontfaces") as HTMLStyleElement;
    expect(sheet.sheet!.cssRules).toHaveLength(1);
  });

  test("__resetForTest clears the sheet and the id cache", () => {
    __resetForTest();
    ensureFontFace(9, "/lib/x.ttf");
    __resetForTest();
    expect(document.getElementById("panopus-fontfaces")).toBeNull();
    ensureFontFace(9, "/lib/x.ttf");
    const sheet = document.getElementById("panopus-fontfaces") as HTMLStyleElement;
    expect(sheet.sheet!.cssRules).toHaveLength(1);
  });
});
