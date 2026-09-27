import { describe, expect, it } from "vitest";
import { buildCoachSummary, pickKeyShots, planKeyframes } from "../src/analysis/coachRequest";
import { computePlayerStats } from "../src/analysis/stats";
import type { AnalysisResult, SampledFrame, Shot } from "../src/analysis/types";
import { CoachRequestSchema } from "../shared/coach";
import { framePose } from "./fixtures";

// Player walks 1 m/s from the baseline (y=19) toward the net for 5 s.
const frames: SampledFrame[] = Array.from({ length: 51 }, (_, i) => ({
  t: i / 10,
  poses: [framePose(0, { x: 0.5, y: 0.7 }, { x: 5, y: 19 - i / 10 })],
}));

const shots: Shot[] = [
  { t: 1, playerId: 0, type: "forehand", swingSpeed: 12, court: { x: 5, y: 18 }, zone: "baseline" },
  { t: 4, playerId: 0, type: "forehand-volley", swingSpeed: 10, court: { x: 5, y: 15 }, zone: "transition" },
];

describe("computePlayerStats", () => {
  const [p] = computePlayerStats(frames, shots, new Map([[0, "right"]]), 10);

  it("measures distance and speed in meters", () => {
    expect(p.distanceMeters).toBeGreaterThan(4.3);
    expect(p.distanceMeters).toBeLessThan(5.1);
    expect(p.avgSpeed).toBeCloseTo(1, 1);
  });

  it("builds a normalized heatmap and zone split", () => {
    const total = p.heatmap.flat().reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(p.zoneShare.baseline + p.zoneShare.transition + p.zoneShare.net).toBeCloseTo(1, 6);
    expect(p.zoneShare.net).toBe(0);
  });

  it("counts shots by type", () => {
    expect(p.totalShots).toBe(2);
    expect(p.shots.forehand).toBe(1);
    expect(p.shots["forehand-volley"]).toBe(1);
    expect(p.label).toMatch(/^A1/);
  });
});

describe("coach request", () => {
  const result: AnalysisResult = {
    duration: 5,
    sampleFps: 10,
    frames,
    shots,
    rallies: [{ start: 0.5, end: 5, shots: 2 }],
    players: computePlayerStats(frames, shots, new Map(), 10),
    calibrated: true,
  };

  it("produces a summary the server schema accepts", () => {
    const req = {
      summary: buildCoachSummary(result),
      keyframes: planKeyframes(result).map((k) => ({ ...k, image: "data:image/jpeg;base64,AAAA" })),
      context: { level: "Intermediate" },
    };
    const parsed = CoachRequestSchema.safeParse(req);
    expect(parsed.success).toBe(true);
    expect(JSON.stringify(req.summary)).not.toContain("heatmap");
  });

  it("falls back to evenly spaced stills when there are no shots", () => {
    const plan = planKeyframes({ ...result, shots: [] });
    expect(plan).toHaveLength(4);
    expect(plan[0].t).toBeCloseTo(0.625);
  });

  it("spreads key shots across the match", () => {
    const many: Shot[] = Array.from({ length: 30 }, (_, i) => ({ ...shots[0], t: i, playerId: i % 4 }));
    const picked = pickKeyShots(many, 6);
    expect(picked).toHaveLength(6);
    expect(picked[5].t).toBeGreaterThan(20);
  });
});
