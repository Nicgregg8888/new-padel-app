import { describe, expect, it } from "vitest";
import { computeTiles, poseQuality, tileToFrame } from "../src/analysis/tiles";
import type { CourtCorners } from "../src/analysis/types";
import { makePose } from "./fixtures";

const corners: CourtCorners = [
  { x: 0.33, y: 0.3 },
  { x: 0.67, y: 0.3 },
  { x: 0.95, y: 0.95 },
  { x: 0.05, y: 0.95 },
];

describe("computeTiles", () => {
  const tiles = computeTiles(corners, 16 / 9);

  it("covers the whole court with zoomed, roughly square tiles", () => {
    expect(tiles.length).toBeGreaterThanOrEqual(2);
    expect(tiles.length).toBeLessThanOrEqual(6);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.x + t.w).toBeLessThanOrEqual(1 + 1e-9);
      expect(t.y + t.h).toBeLessThanOrEqual(1 + 1e-9);
      const ratio = (t.w * 16) / 9 / t.h;
      expect(ratio).toBeGreaterThan(0.4);
      expect(ratio).toBeLessThan(2.6);
    }
    // Every court corner lies inside some tile.
    for (const c of corners) {
      expect(tiles.some((t) => c.x >= t.x && c.x <= t.x + t.w && c.y >= t.y && c.y <= t.y + t.h)).toBe(true);
    }
  });

  it("leaves headroom above the far baseline for far players' bodies", () => {
    expect(Math.min(...tiles.map((t) => t.y))).toBeLessThan(0.3);
  });

  it("uses smaller tiles for the far half than the near half", () => {
    const far = tiles.filter((t) => t.y < 0.3);
    const near = tiles.filter((t) => t.y >= 0.3);
    expect(far.length).toBeGreaterThan(0);
    expect(near.length).toBeGreaterThan(0);
    expect(Math.max(...far.map((t) => t.h))).toBeLessThan(Math.max(...near.map((t) => t.h)));
  });
});

describe("tile mapping", () => {
  it("maps tile coordinates back to the frame", () => {
    const pose = makePose({ x: 0.5, y: 0.5 });
    const out = tileToFrame(pose, { x: 0.2, y: 0.4, w: 0.5, h: 0.25 });
    expect(out[0].x).toBeCloseTo(0.2 + pose[0].x * 0.5);
    expect(out[0].y).toBeCloseTo(0.4 + pose[0].y * 0.25);
  });

  it("scores clipped bodies lower", () => {
    const whole = makePose({ x: 0.5, y: 0.5 });
    const clipped = makePose({ x: 0.5, y: 0.97 });
    expect(poseQuality(clipped)).toBeLessThan(poseQuality(whole));
  });
});
