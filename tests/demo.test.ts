import { describe, expect, it } from "vitest";
import { demoResult } from "../src/analysis/demo";

describe("demoResult", () => {
  const r = demoResult();

  it("is deterministic", () => {
    expect(demoResult().shots.length).toBe(r.shots.length);
  });

  it("looks like a real doubles match", () => {
    expect(r.players).toHaveLength(4);
    expect(r.teams).toHaveLength(2);
    expect(r.rallies.length).toBeGreaterThan(5);
    expect(r.shots.some((s) => s.type === "serve")).toBe(true);
    expect(r.shots.some((s) => s.type === "overhead")).toBe(true);
    for (const p of r.players) {
      expect(p.distanceMeters).toBeGreaterThan(50);
      expect(p.maxSpeed).toBeLessThan(8);
    }
  });

  it("gives the user's pair a habit worth coaching: splitting more than the opponents", () => {
    const [a, b] = r.teams;
    expect(a.split).toBeGreaterThan(b.split);
  });
});
