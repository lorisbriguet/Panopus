import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { GlyphMap } from "../GlyphMap";
import { __resetForTest } from "../FontFaceLoader";

// @tauri-apps/api/core is aliased to src/__mocks__/tauri-api.ts in
// vitest.config.ts, so convertFileSrc resolves to the shared stub
// (`asset://localhost/<path>`) — no per-test vi.mock needed.

beforeEach(() => {
  __resetForTest();
});

describe("GlyphMap", () => {
  it("renders exactly 95 basic-latin cells for U+0020-007E", () => {
    render(<GlyphMap id={7} path="/lib/Font.otf" />);
    const section = screen.getByTestId("glyph-section-basic-latin");
    const cells = section.querySelectorAll('span[data-testid="glyph-cell"]');
    expect(cells).toHaveLength(95);
    // First and last code points of the range
    expect(cells[0].textContent).toBe(String.fromCodePoint(0x20));
    expect(cells[94].textContent).toBe(String.fromCodePoint(0x7e));
  });

  it("renders a latin-1 section with the 96 cells of U+00A0-00FF", () => {
    render(<GlyphMap id={7} path="/lib/Font.otf" />);
    const section = screen.getByTestId("glyph-section-latin-1");
    const cells = section.querySelectorAll('span[data-testid="glyph-cell"]');
    expect(cells).toHaveLength(96);
    expect(cells[0].textContent).toBe(String.fromCodePoint(0xa0));
    expect(cells[95].textContent).toBe(String.fromCodePoint(0xff));
  });

  it("styles every cell with the pf<id> family", () => {
    render(<GlyphMap id={7} path="/lib/Font.otf" />);
    const cells = screen.getAllByTestId("glyph-cell");
    for (const cell of cells) {
      expect(cell.tagName).toBe("SPAN");
      expect(cell).toHaveStyle({ fontFamily: "pf7" });
    }
  });

  it("registers the @font-face through ensureFontFace (mocked convertFileSrc)", () => {
    render(<GlyphMap id={7} path="/lib/Font.otf" />);
    const sheet = document.getElementById("panopus-fontfaces") as HTMLStyleElement;
    expect(sheet).not.toBeNull();
    expect(sheet.sheet!.cssRules).toHaveLength(1);
    expect(sheet.sheet!.cssRules[0].cssText).toContain("pf7");
    expect(sheet.sheet!.cssRules[0].cssText).toContain("asset://localhost//lib/Font.otf");
  });
});
