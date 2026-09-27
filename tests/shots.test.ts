import { describe, expect, it } from "vitest";
import { detectShots, findPeaks, groupRallies, markServes } from "../src/analysis/shots";
import type { SampledFrame, Shot } from "../src/analysis/types";
import { framePose } from "./fixtures";

const FPS = 10;
const center = { x: 0.5, y: 0.7 };

/** Near-side right-handed player, idle except for one fast swing of the right wrist at t≈1s. */
function swingFrames(courtY: number, wristAtContact: { x: number; y: number }): SampledFrame[] {
  const frames: SampledFrame[] = [];
  for (let i = 0; i < 20; i++) {
    const t = i / FPS;
    let rightWrist = { x: 0.025, y: -0.01 };
    if (i === 9) rightWrist = { x: -wristAtContact.x, y: wristAtContact.y };
    if (i === 10) rightWrist = wristAtContact;
    frames.push({ t, poses: [framePose(0, center, { x: 5, y: courtY }, { rightWrist })] });
  }
  return frames;
}

describe("detectShots", () => {
  it("detects a forehand from the back of the court", () => {
    const { shots, dominantHand } = detectShots(swingFrames(18, { x: 0.06, y: -0.02 }), { aspect: 1 });
    expect(shots).toHaveLength(1);
    expect(shots[0].type).toBe("forehand");
    expect(shots[0].zone).toBe("baseline");
    expect(dominantHand.get(0)).toBe("right");
  });

  it("detects a backhand volley at the net", () => {
    const { shots } = detectShots(swingFrames(12, { x: -0.06, y: -0.02 }), { aspect: 1 });
    expect(shots.map((s) => s.type)).toEqual(["backhand-volley"]);
  });

  it("detects an overhead when the wrist is above the head", () => {
    const { shots } = detectShots(swingFrames(13, { x: 0.02, y: -0.16 }), { aspect: 1 });
    expect(shots.map((s) => s.type)).toEqual(["overhead"]);
  });

  it("ignores whole-body movement without an arm swing", () => {
    const frames: SampledFrame[] = Array.from({ length: 20 }, (_, i) => ({
      t: i / FPS,
      poses: [framePose(0, { x: 0.3 + i * 0.02, y: 0.7 }, { x: 5, y: 18 })],
    }));
    expect(detectShots(frames, { aspect: 1 }).shots).toHaveLength(0);
  });
});

describe("findPeaks", () => {
  it("keeps only the strongest peak within the cooldown", () => {
    const s = (t: number, speed: number) => ({ frame: { t }, speed });
    const peaks = findPeaks([s(0, 1), s(0.1, 12), s(0.2, 3), s(0.3, 15), s(0.4, 2), s(2, 11), s(2.1, 1)], 9, 0.8);
    expect(peaks.map((p) => p.frame.t)).toEqual([0.3, 2]);
  });
});

describe("groupRallies", () => {
  const shot = (t: number): Shot => ({
    t,
    playerId: 0,
    type: "forehand",
    swingSpeed: 10,
    court: { x: 5, y: 18 },
    zone: "baseline",
  });
  it("splits on long pauses and drops single shots", () => {
    const rallies = groupRallies([shot(1), shot(2.5), shot(4), shot(20), shot(40), shot(41)]);
    expect(rallies).toHaveLength(2);
    expect(rallies[0].shots).toBe(3);
    expect(rallies[1].shots).toBe(2);
  });
});

describe("markServes", () => {
  const shot = (t: number, zone: Shot["zone"], type: Shot["type"] = "forehand"): Shot => ({
    t,
    playerId: 0,
    type,
    swingSpeed: 10,
    court: { x: 5, y: 18 },
    zone,
  });
  it("labels the first back-court shot of each rally as the serve", () => {
    const shots = [shot(1, "baseline"), shot(2, "net"), shot(10, "net"), shot(11, "baseline")];
    const out = markServes(shots, groupRallies(shots));
    expect(out.map((s) => s.type)).toEqual(["serve", "forehand", "forehand", "forehand"]);
  });
});

describe("detectShots with heard hits", () => {
  // Two players swing at t≈1 (near, id 0) and t≈2 (far, id 2); a third pop at t≈3 has nobody swinging.
  const frames: SampledFrame[] = [];
  for (let i = 0; i < 40; i++) {
    const t = i / FPS;
    const w0 = i === 10 ? { x: 0.06, y: -0.02 } : i === 9 ? { x: -0.06, y: -0.02 } : { x: 0.025, y: -0.01 };
    const w2 = i === 20 ? { x: 0.06, y: -0.02 } : i === 19 ? { x: -0.06, y: -0.02 } : { x: 0.025, y: -0.01 };
    frames.push({
      t,
      poses: [
        framePose(0, { x: 0.3, y: 0.7 }, { x: 3, y: 18 }, { rightWrist: w0 }),
        framePose(2, { x: 0.5, y: 0.3 }, { x: 3, y: 2 }, { rightWrist: w2 }),
      ],
    });
  }

  it("uses the sound for timing and the body for who hit it; silent pops are skipped", () => {
    const { shots } = detectShots(frames, { aspect: 1, hits: [1.02, 1.98, 3.1] });
    expect(shots.map((s) => [s.t, s.playerId, s.heard])).toEqual([
      [1.02, 0, true],
      [1.98, 2, true],
    ]);
  });

  it("drops swings that made no sound", () => {
    expect(detectShots(frames, { aspect: 1, hits: [1.02] }).shots).toHaveLength(1);
  });
});
