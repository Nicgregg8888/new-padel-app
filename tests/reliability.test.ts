import { describe, expect, it } from "vitest";
import { demoResult } from "../src/analysis/demo";
import { analysedSeconds, assessReliability } from "../src/analysis/reliability";

describe("assessReliability", () => {
  const r = demoResult(2);

  it("rates a fully tracked, calibrated match as reliable", () => {
    const rel = assessReliability(r);
    expect(rel.grade).toBe("good");
    expect(rel.coverage.every((c) => c.share > 0.9)).toBe(true);
    expect(rel.tips).toEqual([]);
  });

  it("flags poorly tracked far players and missing calibration", () => {
    const poor = {
      ...r,
      calibrated: false,
      players: r.players.map((p) =>
        p.playerId >= 2 ? { ...p, trackedSeconds: p.trackedSeconds * 0.2, detectedSeconds: (p.detectedSeconds ?? 0) * 0.2 } : p,
      ),
    };
    const rel = assessReliability(poor);
    expect(rel.grade).not.toBe("good");
    expect(rel.tips.some((t) => t.includes("Far-side"))).toBe(true);
    expect(rel.tips.some((t) => t.includes("court corners"))).toBe(true);
  });

  it("measures rates over the analysed segment only", () => {
    expect(analysedSeconds({ duration: 600, range: { start: 60, end: 180 } })).toBe(120);
    expect(analysedSeconds({ duration: 600 })).toBe(600);
  });
});
