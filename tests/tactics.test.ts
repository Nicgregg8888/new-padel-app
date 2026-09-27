import { describe, expect, it } from "vitest";
import { computeTeamTactics } from "../src/analysis/tactics";
import type { SampledFrame } from "../src/analysis/types";

const frame = (t: number, positions: [number, number, number][]): SampledFrame => ({
  t,
  poses: positions.map(([playerId, x, y]) => ({ playerId, landmarks: [], court: { x, y } })),
});

describe("computeTeamTactics", () => {
  // Team A (near side, y > 10): 1 s split (one up, one back), then 1 s both at the net.
  const frames: SampledFrame[] = [];
  for (let i = 0; i < 20; i++) {
    const t = i / 10;
    const a1: [number, number, number] = [0, 3, i < 10 ? 12 : 12.5];
    const a2: [number, number, number] = [1, 7, i < 10 ? 19 : 12.5];
    frames.push(frame(t, [a1, a2]));
  }

  it("splits paired time into positioning patterns", () => {
    const [a] = computeTeamTactics(frames);
    expect(a.team).toBe("A");
    expect(a.split).toBeCloseTo(0.5, 1);
    expect(a.togetherNet).toBeCloseTo(0.5, 1);
    expect(a.togetherNet + a.togetherMid + a.togetherBack + a.staggered + a.split).toBeCloseTo(1, 6);
    expect(a.netTakings).toBe(1);
    expect(a.avgLateralGap).toBeCloseTo(4, 5);
  });

  it("skips teams whose partners are never both tracked", () => {
    expect(computeTeamTactics(frames).map((t) => t.team)).toEqual(["A"]);
  });
});
