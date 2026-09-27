import { describe, expect, it } from "vitest";
import { bestSnapshot } from "../src/analysis/snapshot";
import type { SampledFrame } from "../src/analysis/types";
import { framePose } from "./fixtures";

describe("bestSnapshot", () => {
  it("picks a real sighting and crops around the body", () => {
    const frames: SampledFrame[] = [
      { t: 0, poses: [{ playerId: 1, landmarks: [], court: { x: 2, y: 15 }, interpolated: true }] },
      { t: 1, poses: [framePose(1, { x: 0.3, y: 0.6 }, { x: 2, y: 15 })] },
    ];
    const snap = bestSnapshot(frames, 1)!;
    expect(snap.t).toBe(1);
    expect(snap.box.x).toBeLessThan(0.3);
    expect(snap.box.x + snap.box.w).toBeGreaterThan(0.3);
    expect(snap.box.y).toBeLessThan(0.6);
    expect(snap.box.y + snap.box.h).toBeGreaterThan(0.6);
  });

  it("prefers a frame where no one else is in the crop", () => {
    const frames: SampledFrame[] = [
      { t: 1, poses: [framePose(0, { x: 0.5, y: 0.6 }, { x: 5, y: 15 }), framePose(1, { x: 0.51, y: 0.6 }, { x: 5, y: 15 })] },
      { t: 2, poses: [framePose(0, { x: 0.5, y: 0.6 }, { x: 5, y: 15 }), framePose(1, { x: 0.9, y: 0.6 }, { x: 9, y: 15 })] },
    ];
    expect(bestSnapshot(frames, 0)!.t).toBe(2);
  });

  it("returns null for a player never seen", () => {
    expect(bestSnapshot([{ t: 0, poses: [] }], 3)).toBeNull();
  });
});
