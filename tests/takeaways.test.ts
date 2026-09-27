import { describe, expect, it } from "vitest";
import { demoPointTags, demoResult } from "../src/analysis/demo";
import { DEFAULT_GOALS } from "../src/analysis/goals";
import { takeaways } from "../src/analysis/takeaways";

const result = demoResult();
const name = (id: number) => ["You", "Partner", "Rival 1", "Rival 2"][id];

describe("takeaways", () => {
  it("leads with the positioning-vs-points finding once points are tagged", () => {
    const t = takeaways({ result, me: 0, name, points: demoPointTags(result), goals: DEFAULT_GOALS, demo: true });
    expect(t.length).toBeGreaterThan(0);
    expect(t.length).toBeLessThanOrEqual(4);
    expect(t[0].section).toBe("points");
    expect(t[0].title).toMatch(/^Your pair wins \d+% together at net, \d+% split$/);
    expect(t.some((x) => x.section === "pair" && x.title.includes("split"))).toBe(true);
  });

  it("nudges to tag points and pick yourself when that's missing", () => {
    const t = takeaways({ result, me: null, name, goals: DEFAULT_GOALS, demo: true });
    expect(t.map((x) => x.title)).toEqual(expect.arrayContaining(["Tag who won each point", "Tell us which player you are"]));
  });

  it("warns about poor tracking on real matches", () => {
    const poor = {
      ...result,
      players: result.players.map((p) => ({ ...p, trackedSeconds: p.trackedSeconds * 0.2, detectedSeconds: (p.detectedSeconds ?? 0) * 0.2 })),
    };
    const t = takeaways({ result: poor, me: 0, name, goals: [] });
    expect(t[0].section).toBe("reliability");
  });
});
