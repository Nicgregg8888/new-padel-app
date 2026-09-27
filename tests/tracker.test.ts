import { describe, expect, it } from "vitest";
import { PlayerTracker, canonicalPlayerOrder, dedupeDetections, playerIdentity } from "../src/analysis/tracker";
import type { SampledFrame } from "../src/analysis/types";

describe("PlayerTracker", () => {
  it("keeps identities stable as players move", () => {
    const tr = new PlayerTracker();
    const first = tr.assign(0, [
      { x: 2, y: 17 },
      { x: 8, y: 17 },
      { x: 2, y: 3 },
      { x: 8, y: 3 },
    ]);
    expect(first).toEqual([0, 1, 2, 3]);
    // Shuffled order, everyone moved a little.
    const next = tr.assign(0.1, [
      { x: 8.2, y: 3.1 },
      { x: 2.1, y: 16.8 },
      { x: 7.9, y: 17.2 },
      { x: 2, y: 3.3 },
    ]);
    expect(next).toEqual([3, 0, 1, 2]);
  });

  it("rejects a fifth person while all four players are visible", () => {
    const tr = new PlayerTracker();
    tr.assign(0, [
      { x: 2, y: 17 },
      { x: 8, y: 17 },
      { x: 2, y: 3 },
      { x: 8, y: 3 },
    ]);
    const ids = tr.assign(0.1, [
      { x: 2, y: 17 },
      { x: 8, y: 17 },
      { x: 2, y: 3 },
      { x: 8, y: 3 },
      { x: 5, y: 10 },
    ]);
    expect(ids[4]).toBe(-1);
  });

  it("re-acquires a lost player on the same half after they go stale", () => {
    const tr = new PlayerTracker();
    tr.assign(0, [
      { x: 2, y: 17 },
      { x: 8, y: 17 },
      { x: 2, y: 3 },
      { x: 8, y: 3 },
    ]);
    // Player 1 disappears for 3 s and reappears somewhere else on the near side.
    tr.assign(1, [{ x: 2, y: 17 }, { x: 2, y: 3 }, { x: 8, y: 3 }]);
    const ids = tr.assign(4, [{ x: 2, y: 17 }, { x: 5, y: 12 }, { x: 2, y: 3 }, { x: 8, y: 3 }]);
    expect(ids).toEqual([0, 1, 2, 3]);
  });
});

describe("dedupeDetections", () => {
  it("drops double detections of the same body", () => {
    expect(dedupeDetections([{ x: 1, y: 1 }, { x: 1.2, y: 1.1 }, { x: 5, y: 5 }])).toEqual([0, 2]);
  });
});

describe("canonicalPlayerOrder", () => {
  it("numbers near team left/right then far team left/right", () => {
    const frame = (poses: [number, number, number][]): SampledFrame => ({
      t: 0,
      poses: poses.map(([id, x, y]) => ({ playerId: id, landmarks: [], court: { x, y } })),
    });
    const mapping = canonicalPlayerOrder([
      frame([
        [0, 7, 4], // far right
        [1, 3, 16], // near left
        [2, 3, 4], // far left
        [3, 7, 16], // near right
      ]),
    ]);
    expect(mapping.get(1)).toBe(0);
    expect(mapping.get(3)).toBe(1);
    expect(mapping.get(2)).toBe(2);
    expect(mapping.get(0)).toBe(3);
    expect(playerIdentity(0).team).toBe("A");
    expect(playerIdentity(3).label).toMatch(/^B2/);
  });
});
