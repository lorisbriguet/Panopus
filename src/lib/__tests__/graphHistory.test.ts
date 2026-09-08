import { describe, test, expect } from "vitest";
import { createHistory } from "../graphHistory";

describe("createHistory", () => {
  test("seed alone cannot undo or redo", () => {
    const h = createHistory();
    h.push("A", 0);
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
  });

  test("undo returns the previous state, redo re-applies", () => {
    const h = createHistory();
    h.push("A", 0);
    h.push("B", 1000);
    expect(h.canUndo()).toBe(true);
    expect(h.undo()).toBe("A");
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(true);
    expect(h.redo()).toBe("B");
    expect(h.canRedo()).toBe(false);
  });

  test("pushes under 400ms apart coalesce into one undo step", () => {
    const h = createHistory();
    h.push("A", 0);
    h.push("B", 1000);
    h.push("C", 1100); // coalesces into B's slot
    expect(h.undo()).toBe("A");
    expect(h.canUndo()).toBe(false);
    // and the coalesced value is what redo restores
    expect(h.redo()).toBe("C");
  });

  test("pushes 400ms+ apart are separate undo steps", () => {
    const h = createHistory();
    h.push("A", 0);
    h.push("B", 1000);
    h.push("C", 1500);
    expect(h.undo()).toBe("B");
    expect(h.undo()).toBe("A");
  });

  test("the first edit never coalesces into the seed", () => {
    const h = createHistory();
    h.push("A", 0);
    h.push("B", 100); // <400ms after seed, still its own step
    expect(h.undo()).toBe("A");
  });

  test("a push after undo clears the redo stack", () => {
    const h = createHistory();
    h.push("A", 0);
    h.push("B", 1000);
    h.undo();
    h.push("C", 5000);
    expect(h.canRedo()).toBe(false);
    expect(h.undo()).toBe("A");
    expect(h.redo()).toBe("C");
  });

  test("identical consecutive states are not pushed", () => {
    const h = createHistory();
    h.push("A", 0);
    h.push("A", 1000);
    expect(h.canUndo()).toBe(false);
  });

  test("bounded: oldest entries fall off at the limit", () => {
    const h = createHistory(3);
    h.push("A", 0);
    h.push("B", 1000);
    h.push("C", 2000);
    h.push("D", 3000); // A falls off
    expect(h.undo()).toBe("C");
    expect(h.undo()).toBe("B");
    expect(h.undo()).toBeNull();
  });

  test("a push right after undo starts a fresh step (no coalescing across undo)", () => {
    const h = createHistory();
    h.push("A", 0);
    h.push("B", 1000);
    h.undo();
    h.push("C", 1100); // close in time to B's push, but must not coalesce into the seed
    expect(h.undo()).toBe("A");
  });
});
