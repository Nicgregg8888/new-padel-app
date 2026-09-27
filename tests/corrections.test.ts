import { describe, expect, it } from "vitest";
import { editShot, swapPlayers } from "../src/analysis/corrections";
import { demoResult } from "../src/analysis/demo";

describe("corrections", () => {
  const r = demoResult(2);

  it("relabels a shot and recounts", () => {
    const s = r.shots.find((x) => x.type === "forehand")!;
    const before = r.players.find((p) => p.playerId === s.playerId)!;
    const out = editShot(r, s, { type: "backhand" });
    const after = out.players.find((p) => p.playerId === s.playerId)!;
    expect(after.shots.forehand).toBe(before.shots.forehand - 1);
    expect(after.shots.backhand).toBe(before.shots.backhand + 1);
    expect(out.shots.find((x) => x.t === s.t)?.edited).toBe(true);
    expect(out.rallies).toBe(r.rallies);
  });

  it("deletes a false shot", () => {
    const s = r.shots[3];
    const out = editShot(r, s, null);
    expect(out.shots).toHaveLength(r.shots.length - 1);
    expect(out.players.reduce((a, p) => a + p.totalShots, 0)).toBe(r.shots.length - 1);
  });

  it("swaps two players from a moment onward", () => {
    const mid = r.duration / 2;
    const out = swapPlayers(r, 0, 1, mid);
    const early = out.frames.find((f) => f.t < 1)!;
    const late = out.frames.find((f) => f.t > mid + 1)!;
    const lateBefore = r.frames.find((f) => f.t === late.t)!;
    expect(early.poses.find((p) => p.playerId === 0)!.court).toEqual(r.frames[0].poses.find((p) => p.playerId === 0)!.court);
    expect(late.poses.find((p) => p.playerId === 0)!.court).toEqual(lateBefore.poses.find((p) => p.playerId === 1)!.court);
    expect(out.shots.filter((s) => s.t >= mid && s.playerId === 0).length).toBe(
      r.shots.filter((s) => s.t >= mid && s.playerId === 1).length,
    );
  });
});
