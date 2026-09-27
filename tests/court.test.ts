import { describe, expect, it } from "vitest";
import {
  applyHomography,
  computeHomography,
  courtToImageHomography,
  imageToCourtHomography,
  isOnCourt,
  zoneOf,
} from "../src/analysis/court";
import type { CourtCorners } from "../src/analysis/types";

const corners: CourtCorners = [
  { x: 0.35, y: 0.25 },
  { x: 0.65, y: 0.25 },
  { x: 0.9, y: 0.9 },
  { x: 0.1, y: 0.9 },
];

describe("homography", () => {
  it("maps the clicked corners exactly onto the court corners", () => {
    const h = imageToCourtHomography(corners);
    const expected = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ];
    corners.forEach((c, i) => {
      const p = applyHomography(h, c);
      expect(p.x).toBeCloseTo(expected[i].x, 6);
      expect(p.y).toBeCloseTo(expected[i].y, 6);
    });
  });

  it("round-trips through the inverse mapping", () => {
    const toCourt = imageToCourtHomography(corners);
    const toImage = courtToImageHomography(corners);
    const court = { x: 3.2, y: 14.5 };
    const back = applyHomography(toCourt, applyHomography(toImage, court));
    expect(back.x).toBeCloseTo(court.x, 6);
    expect(back.y).toBeCloseTo(court.y, 6);
  });

  it("places the net between the far and near baselines under perspective", () => {
    const net = applyHomography(courtToImageHomography(corners), { x: 5, y: 10 });
    // Perspective: the net appears closer to the far baseline than the midpoint in image space.
    expect(net.y).toBeGreaterThan(0.25);
    expect(net.y).toBeLessThan((0.25 + 0.9) / 2);
  });

  it("rejects degenerate (collinear) corners", () => {
    const line = [0, 1, 2, 3].map((i) => ({ x: i / 3, y: i / 3 }));
    expect(() => computeHomography(line, line)).toThrow();
  });
});

describe("zones", () => {
  it("classifies distance from the net", () => {
    expect(zoneOf({ x: 5, y: 11 })).toBe("net");
    expect(zoneOf({ x: 5, y: 16 })).toBe("transition");
    expect(zoneOf({ x: 5, y: 19.5 })).toBe("baseline");
    expect(zoneOf({ x: 5, y: 1 })).toBe("baseline");
  });

  it("filters people well outside the court", () => {
    expect(isOnCourt({ x: 5, y: 10 })).toBe(true);
    expect(isOnCourt({ x: -1, y: 21 })).toBe(true);
    expect(isOnCourt({ x: 15, y: 10 })).toBe(false);
  });
});
