import { NET_Y, COURT_WIDTH, applyHomography, courtToImageHomography } from "./court";
import type { CourtCorners, Pose } from "./types";

/** A crop of the frame, normalized [0,1] coordinates. */
export interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function splitRow(x0: number, x1: number, y0: number, y1: number, aspect: number, overlap = 0.15): Tile[] {
  const wPx = (x1 - x0) * aspect;
  const hPx = y1 - y0;
  const cols = Math.min(3, Math.max(1, Math.round(wPx / hPx)));
  const step = (x1 - x0) / cols;
  const pad = step * overlap;
  return Array.from({ length: cols }, (_, i) => {
    const a = clamp01(x0 + i * step - pad);
    const b = clamp01(x0 + (i + 1) * step + pad);
    return { x: a, y: y0, w: b - a, h: y1 - y0 };
  });
}

/**
 * Pose detection downsizes its whole input to ~224 px, so players far from
 * the camera vanish. We detect on zoomed crops instead: one band for the far
 * half of the court and one for the near half, each cut into roughly square,
 * overlapping tiles. Bands extend upward to include bodies, not just feet.
 *
 * @param aspect frame width / height
 */
export function computeTiles(corners: CourtCorners, aspect: number): Tile[] {
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const net = courtToImageHomography(corners);
  const netY = (applyHomography(net, { x: 0, y: NET_Y }).y + applyHomography(net, { x: COURT_WIDTH, y: NET_Y }).y) / 2;

  const farDepth = Math.max(netY - top, 0.02);
  const nearDepth = Math.max(bottom - netY, 0.02);
  const xPad = (right - left) * 0.06;
  const x0 = clamp01(left - xPad);
  const x1 = clamp01(right + xPad);

  // A far player standing on the baseline is roughly as tall as the far half is deep.
  const farTop = clamp01(top - farDepth * 1.1);
  const farBottom = clamp01(netY + nearDepth * 0.12);
  // A near player at the net has their head well above the net line.
  const nearTop = clamp01(netY - farDepth * 0.9);
  const nearBottom = clamp01(bottom + nearDepth * 0.08);

  return [...splitRow(x0, x1, farTop, farBottom, aspect), ...splitRow(x0, x1, nearTop, nearBottom, aspect)];
}

/** Map landmarks detected inside a tile back to full-frame coordinates. */
export function tileToFrame(pose: Pose, tile: Tile): Pose {
  return pose.map((l) => ({ x: tile.x + l.x * tile.w, y: tile.y + l.y * tile.h, visibility: l.visibility }));
}

/**
 * How trustworthy a detection is: mean visibility of the body landmarks we
 * rely on, penalised when the feet fall outside the tile (the body was cut off
 * and the model guessed).
 */
export function poseQuality(tilePose: Pose): number {
  const key = [11, 12, 15, 16, 23, 24, 27, 28];
  const vis = key.reduce((a, i) => a + tilePose[i].visibility, 0) / key.length;
  const feetInside = [27, 28].every((i) => tilePose[i].y <= 1.02 && tilePose[i].y >= -0.02);
  return feetInside ? vis : vis * 0.5;
}
