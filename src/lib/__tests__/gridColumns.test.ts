import { describe, test, expect } from "vitest";
import { gridTemplateForColumns } from "../gridColumns";

describe("gridTemplateForColumns", () => {
  test("auto yields the responsive auto-fill template", () => {
    expect(gridTemplateForColumns("auto")).toBe(
      "repeat(auto-fill, minmax(340px, 1fr))"
    );
  });

  test("fixed counts yield an n-track template with a 0 min so cards can shrink", () => {
    expect(gridTemplateForColumns(1)).toBe("repeat(1, minmax(0, 1fr))");
    expect(gridTemplateForColumns(2)).toBe("repeat(2, minmax(0, 1fr))");
    expect(gridTemplateForColumns(3)).toBe("repeat(3, minmax(0, 1fr))");
  });
});
