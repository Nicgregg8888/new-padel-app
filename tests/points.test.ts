import { describe, expect, it } from "vitest";
import { buildCoachSummary } from "../src/analysis/coachRequest";
import { demoPointTags, demoResult } from "../src/analysis/demo";
import { defaultBy, lastHitter, pointStats } from "../src/analysis/points";
import { pairPattern, rallyPatterns } from "../src/analysis/tactics";
import type { Rally, SampledFrame, Shot } from "../src/analysis/types";
import { positioningInsight } from "../src/components/PointsPanel";
import { CoachRequestSchema } from "../shared/coach";

describe("pair patterns", () => {
  it("names each positioning", () => {
    expect(pairPattern({ x: 2, y: 12 }, { x: 8, y: 12.5 })).toBe("net");
    expect(pairPattern({ x: 2, y: 12 }, { x: 8, y: 19 })).toBe("split");
    expect(pairPattern({ x: 2, y: 15 }, { x: 8, y: 19 })).toBe("staggered");
    expect(pairPattern({ x: 2, y: 19 }, { x: 8, y: 18.5 })).toBe("back");
  });

  it("finds each pair's dominant pattern in a rally", () => {
    const frames: SampledFrame[] = Array.from({ length: 10 }, (_, i) => ({
      t: i,
      poses: [
        { playerId: 0, landmarks: [], court: { x: 2, y: 12 } },
        { playerId: 1, landmarks: [], court: { x: 8, y: i < 7 ? 19 : 12 } },
      ],
    }));
    const [r] = rallyPatterns(frames, [{ start: 0, end: 9, shots: 4 }]);
    expect(r.patterns).toEqual({ A: "split" });
  });
});

describe("point stats", () => {
  const rallies: Rally[] = [
    { start: 0, end: 5, shots: 4, patterns: { A: "net", B: "back" } },
    { start: 10, end: 15, shots: 6, patterns: { A: "net", B: "back" } },
    { start: 20, end: 25, shots: 3, patterns: { A: "split", B: "net" } },
  ];
  const stats = pointStats(rallies, [
    { rally: 0, winner: "A", ending: "winner", by: 0 },
    { rally: 1, winner: "A", ending: "unforced", by: 3 },
    { rally: 2, winner: "B", ending: "winner", by: 2 },
  ]);

  it("keeps score and win rate by positioning", () => {
    expect(stats.score).toEqual({ A: 2, B: 1 });
    expect(stats.byPattern.A.net).toEqual({ won: 2, played: 2 });
    expect(stats.byPattern.A.split).toEqual({ won: 0, played: 1 });
    expect(stats.perPlayer[3].unforced).toBe(1);
  });

  it("explains the difference in one sentence when there's enough data", () => {
    expect(positioningInsight("Your pair", { net: { won: 4, played: 5 }, split: { won: 1, played: 4 } })).toBe(
      "Your pair wins 80% of points when together at net, but 25% when split.",
    );
    expect(positioningInsight("Your pair", { net: { won: 1, played: 1 } })).toBeNull();
  });

  it("defaults 'by' to the last hitter only when they're on the right side", () => {
    const shots: Shot[] = [{ t: 4, playerId: 2, type: "forehand", swingSpeed: 9, court: { x: 5, y: 3 }, zone: "baseline" }];
    const last = lastHitter(rallies[0], shots);
    expect(defaultBy("B", "winner", last)).toBe(2);
    expect(defaultBy("A", "unforced", last)).toBe(2);
    expect(defaultBy("A", "winner", last)).toBeUndefined();
  });
});

describe("demo points", () => {
  it("tags every rally and feeds a valid coach request", () => {
    const r = demoResult();
    const tags = demoPointTags(r);
    expect(tags).toHaveLength(r.rallies.length);
    const summary = buildCoachSummary(r, { me: 0, points: tags });
    const parsed = CoachRequestSchema.safeParse({ summary, keyframes: [] });
    expect(parsed.success).toBe(true);
    expect(summary.points?.tagged).toBe(tags.length);
  });
});
