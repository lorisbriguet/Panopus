/**
 * Bounded undo history for the Finish graph (serialized-graph strings —
 * pure, no React). Rapid pushes coalesce so a slider drag lands as ONE
 * undo step; undo/redo never coalesce across their boundary.
 */

export interface GraphHistory {
  /** Record a new current state. `now` in ms (Date.now()). */
  push(json: string, now: number): void;
  /** Step back; returns the state to restore, or null at the seed. */
  undo(): string | null;
  /** Step forward; returns the state to restore, or null. */
  redo(): string | null;
  canUndo(): boolean;
  canRedo(): boolean;
}

const COALESCE_MS = 400;

export function createHistory(limit = 100): GraphHistory {
  // past[past.length - 1] is ALWAYS the current state; index 0 is the
  // oldest reachable state (initially the seed).
  const past: string[] = [];
  let future: string[] = [];
  let lastPush = Number.NEGATIVE_INFINITY;

  return {
    push(json, now) {
      if (json === past[past.length - 1]) return;
      future = [];
      // Coalesce rapid successions into the current entry — but never
      // into the seed (past.length 1), which must stay reachable.
      if (now - lastPush < COALESCE_MS && past.length > 1) {
        past[past.length - 1] = json;
      } else {
        past.push(json);
        if (past.length > limit) past.shift();
      }
      lastPush = now;
    },
    undo() {
      if (past.length < 2) return null;
      future.push(past.pop()!);
      lastPush = Number.NEGATIVE_INFINITY;
      return past[past.length - 1];
    },
    redo() {
      const next = future.pop();
      if (next === undefined) return null;
      past.push(next);
      lastPush = Number.NEGATIVE_INFINITY;
      return next;
    },
    canUndo: () => past.length > 1,
    canRedo: () => future.length > 0,
  };
}
