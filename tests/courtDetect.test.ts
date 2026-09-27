import { describe, expect, it } from "vitest";
import { convexHull, detectCourt, orderCorners, type Pixels } from "../src/analysis/courtDetect";
import type { Point } from "../src/analysis/types";

function inside(p: Point, poly: Point[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** A frame with green surroundings, a blue court trapezoid, white lines and a grey "player". */
function frame(court: Point[], W = 320, H = 180): Pixels {
  const data = new Uint8ClampedArray(W * H * 4);
  const px = court.map((p) => ({ x: p.x * W, y: p.y * H }));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let rgb = [60, 110, 70];
      if (y < H * 0.2) rgb = [200, 205, 210];
      if (inside({ x: x + 0.5, y: y + 0.5 }, px)) {
        // Mild lighting gradient across the carpet.
        const shade = 0.85 + 0.3 * (y / H);
        rgb = [30 * shade, 90 * shade, 170 * shade];
        if (Math.abs(y - H * 0.55) < 1) rgb = [240, 240, 240]; // service line
        if (x > W * 0.45 && x < W * 0.5 && y > H * 0.6 && y < H * 0.85) rgb = [120, 120, 120]; // player
      }
      data.set([rgb[0], rgb[1], rgb[2], 255], i);
    }
  }
  return { width: W, height: H, data };
}

describe("detectCourt", () => {
  it("finds the corners of a court in perspective", () => {
    const truth = [
      { x: 0.33, y: 0.32 },
      { x: 0.67, y: 0.32 },
      { x: 0.93, y: 0.95 },
      { x: 0.07, y: 0.95 },
    ];
    const got = detectCourt(frame(truth));
    expect(got).not.toBeNull();
    got!.forEach((c, i) => {
      expect(Math.abs(c.x - truth[i].x)).toBeLessThan(0.02);
      expect(Math.abs(c.y - truth[i].y)).toBeLessThan(0.03);
    });
  });

  it("gives up when there is no uniform surface", () => {
    const W = 160;
    const H = 90;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) data.set([(i * 37) % 255, (i * 91) % 255, (i * 53) % 255, 255], i * 4);
    expect(detectCourt({ width: W, height: H, data })).toBeNull();
  });
});

describe("geometry helpers", () => {
  it("builds a convex hull", () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]);
    expect(hull).toHaveLength(4);
  });

  it("orders corners far-left, far-right, near-right, near-left", () => {
    const [fl, fr, nr, nl] = orderCorners([
      { x: 0.9, y: 0.9 },
      { x: 0.3, y: 0.3 },
      { x: 0.1, y: 0.9 },
      { x: 0.7, y: 0.3 },
    ]);
    expect([fl.x, fr.x, nr.x, nl.x]).toEqual([0.3, 0.7, 0.9, 0.1]);
  });
});
