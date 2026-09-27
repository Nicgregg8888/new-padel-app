import { describe, expect, it } from "vitest";
import { compareWithUsual, formatDelta } from "../src/analysis/compare";
import { demoPointTags, demoResult } from "../src/analysis/demo";

const result = demoResult(2);
const withNet = (share: number) => ({
  ...result,
  players: result.players.map((p) => (p.playerId === 0 ? { ...p, zoneShare: { ...p.zoneShare, net: share } } : p)),
});

describe("compareWithUsual", () => {
  const history = [0.2, 0.3, 0.25].map((net, i) => ({ id: `h${i}`, createdAt: i, result: withNet(net), me: 0 }));
  const current = { id: "now", createdAt: 10, result: withNet(0.4), me: 0, points: demoPointTags(result) };

  it("compares against the average of earlier matches", () => {
    const net = compareWithUsual(current, history).find((c) => c.key === "net")!;
    expect(net.usual).toBeCloseTo(25);
    expect(net.delta).toBeCloseTo(15);
    expect(net.better).toBe(true);
    expect(net.basis).toBe(3);
    expect(formatDelta(net)).toBe("+15 pts");
  });

  it("skips metrics the history can't compare (no tagged points before)", () => {
    expect(compareWithUsual(current, history).some((c) => c.key === "won")).toBe(false);
  });

  it("needs you marked and earlier matches", () => {
    expect(compareWithUsual({ ...current, me: null }, history)).toEqual([]);
    expect(compareWithUsual(current, [])).toEqual([]);
    expect(compareWithUsual({ ...current, createdAt: -1 }, history)).toEqual([]);
  });
});
