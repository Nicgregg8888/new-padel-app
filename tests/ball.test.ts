import { describe, expect, it } from "vitest";
import { BallDetector, BallTracker, annotateShots, ballEvents, cleanTrack, isBallColor } from "../src/analysis/ball";
import type { Pixels } from "../src/analysis/courtDetect";
import type { BallObs, Shot } from "../src/analysis/types";

const W = 200;
const H = 120;

/** Blue court frame with a static yellow sign and an optional moving ball. */
function frame(ball: { x: number; y: number } | null): Pixels {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set([30, 80, 160, 255], i * 4);
  const paint = (cx: number, cy: number, r: number, rgb: number[]) => {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++)
        if (x >= 0 && y >= 0 && x < W && y < H && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) data.set([...rgb, 255], (y * W + x) * 4);
  };
  paint(20, 20, 4, [225, 235, 60]); // static yellow sign
  if (ball) paint(Math.round(ball.x * W), Math.round(ball.y * H), 1, [220, 232, 70]);
  return { width: W, height: H, data };
}

describe("ball colour", () => {
  it("accepts padel-ball yellow and rejects court blue, white and skin", () => {
    expect(isBallColor(220, 232, 70)).toBe(true);
    expect(isBallColor(30, 80, 160)).toBe(false);
    expect(isBallColor(250, 250, 250)).toBe(false);
    expect(isBallColor(210, 160, 130)).toBe(false);
  });
});

describe("BallDetector + BallTracker", () => {
  it("follows a moving ball and ignores a static yellow object", () => {
    const det = new BallDetector();
    const tr = new BallTracker();
    det.detect(frame(null));
    for (let i = 0; i < 10; i++) {
      const t = i / 30;
      const cands = det.detect(frame({ x: 0.3 + i * 0.03, y: 0.6 - i * 0.02 }));
      expect(cands.every((c) => Math.hypot(c.x - 0.1, c.y - 0.17) > 0.05)).toBe(true);
      tr.push(t, cands);
    }
    const track = tr.result();
    expect(track.length).toBeGreaterThanOrEqual(8);
    const last = track[track.length - 1];
    expect(last.x).toBeCloseTo(0.57, 1);
  });

  it("keeps the travelling ball and drops a blob that only jiggles in place", () => {
    const tr = new BallTracker();
    for (let i = 0; i < 15; i++) {
      const t = i / 30;
      tr.push(t, [
        { x: 0.2 + i * 0.03, y: 0.5, area: 3 },
        { x: 0.8 + (i % 2) * 0.01, y: 0.3 + (i % 3) * 0.005, area: 3 },
      ]);
    }
    const track = tr.result();
    expect(track.length).toBeGreaterThanOrEqual(14);
    expect(track.every((o) => o.x < 0.7)).toBe(true);
  });

  it("skips candidates inside excluded (torso) boxes", () => {
    const det = new BallDetector();
    det.detect(frame(null));
    expect(det.detect(frame({ x: 0.5, y: 0.5 }), [{ x0: 0.4, y0: 0.4, x1: 0.6, y1: 0.6 }])).toHaveLength(0);
  });
});

describe("ball events", () => {
  const path: BallObs[] = [];
  // Falls, bounces at t=0.3, rises; then is hit back at t=0.6 near a wrist.
  for (let i = 0; i <= 9; i++) {
    const t = i / 30 * 3;
    const y = i <= 3 ? 0.5 + i * 0.05 : i <= 6 ? 0.65 - (i - 3) * 0.05 : 0.5 + (i - 6) * 0.05;
    const x = i <= 6 ? 0.2 + i * 0.05 : 0.5 - (i - 6) * 0.05;
    path.push({ t, x, y });
  }
  const events = ballEvents(path, (t) => (Math.abs(t - 0.6) < 0.05 ? [{ playerId: 2, p: { x: 0.5, y: 0.52 } }] : []));

  it("classifies bounces and hits", () => {
    expect(events.map((e) => e.kind)).toEqual(["bounce", "hit"]);
    expect(events[1].playerId).toBe(2);
  });

  it("confirms shots near a hit and flags lobs", () => {
    const shot: Shot = { t: 0.62, playerId: 2, type: "forehand", swingSpeed: 10, court: { x: 5, y: 3 }, zone: "baseline" };
    const other: Shot = { ...shot, playerId: 0 };
    const high = [...path, { t: 0.8, x: 0.4, y: 0.05 }, { t: 0.9, x: 0.38, y: 0.02 }, { t: 1.0, x: 0.36, y: 0.04 }];
    const [a, b] = annotateShots([shot, other], high, events, 0.3, 0.2);
    expect(a.confirmed).toBe(true);
    expect(a.lob).toBe(true);
    expect(b.confirmed).toBeUndefined();
  });

  it("drops isolated detections", () => {
    const noisy: BallObs[] = [...path.slice(0, 4), { t: 2, x: 0.9, y: 0.9 }];
    expect(cleanTrack(noisy)).toHaveLength(4);
  });
});
