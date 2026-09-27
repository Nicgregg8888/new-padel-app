import { NET_Y, COURT_WIDTH, applyHomography, courtToImageHomography } from "./court";
import type { CourtCorners, Point, Pose } from "./types";

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

/**
 * The part of the frame where players can be: the court, plus headroom above
 * each baseline for a standing player (arm raised), plus a little room at the
 * sides. Everything outside (spectators, screens, the umpire) is blanked
 * before pose detection so it can't take the detector's attention.
 *
 * @param aspect frame width / height
 */
export function playArea(corners: CourtCorners, aspect: number, headroom = 1.8): Point[] {
  const [fl, fr, nr, nl] = corners;
  // Image units per meter along each baseline (x scaled by aspect so it matches y units).
  const farScale = (Math.hypot((fr.x - fl.x) * aspect, fr.y - fl.y) / COURT_WIDTH);
  const nearScale = (Math.hypot((nr.x - nl.x) * aspect, nr.y - nl.y) / COURT_WIDTH);
  // Meters, as seen from a high camera (vertical heights look shorter than they are).
  const HEAD = headroom;
  const SIDE = 0.5; // meters of room outside each sideline
  const out = (p: Point, dx: number, dy: number) => ({ x: p.x + dx / aspect, y: p.y + dy });
  return [
    out(fl, -SIDE * farScale, -HEAD * farScale),
    out(fr, SIDE * farScale, -HEAD * farScale),
    out(nr, SIDE * nearScale, 0.3 * nearScale),
    out(nl, -SIDE * nearScale, 0.3 * nearScale),
  ];
}

/**
 * A tight square crop around where a player's feet are expected, sized to
 * the player's height at that spot, so a small far-away player fills much
 * more of the detector's view than in a general tile.
 */
export function focusTile(feet: Point, corners: CourtCorners, courtPos: Point, aspect: number): Tile {
  const toImage = courtToImageHomography(corners);
  const a = applyHomography(toImage, courtPos);
  const b = applyHomography(toImage, { x: courtPos.x + 1, y: courtPos.y });
  const perMeter = Math.hypot((b.x - a.x) * aspect, b.y - a.y); // height-normalized units per meter
  const height = 1.85 * perMeter * 0.85; // a player, as seen from a high camera
  const side = Math.min(1, Math.max(0.08, height * 2.4)); // in height units
  const w = Math.min(1, side / aspect);
  const h = side;
  const cx = feet.x;
  const cy = feet.y - height * 0.45;
  const x = Math.min(1 - w, Math.max(0, cx - w / 2));
  const y = Math.min(1 - h, Math.max(0, cy - h / 2));
  return { x, y, w, h };
}

/** Image-space box around a pose's visible landmarks. */
export function poseBox(pose: Pose): { x0: number; y0: number; x1: number; y1: number } {
  const pts = pose.filter((l) => l.visibility > 0.3);
  const use = pts.length >= 4 ? pts : pose;
  const xs = use.map((l) => l.x);
  const ys = use.map((l) => l.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/**
 * Two detections of the same body: their boxes overlap a lot, or their hips
 * are very close relative to body size. Works for far players, whose court
 * positions are too noisy to compare in meters.
 */
export function samePerson(a: Pose, b: Pose): boolean {
  const A = poseBox(a);
  const B = poseBox(b);
  const ix = Math.max(0, Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0));
  const iy = Math.max(0, Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0));
  const inter = ix * iy;
  const area = (r: typeof A) => Math.max(1e-9, (r.x1 - r.x0) * (r.y1 - r.y0));
  // Overlap relative to the smaller box, so a partial (cut-off) view of the same person counts.
  if (inter / Math.min(area(A), area(B)) > 0.45) return true;
  const hip = (p: Pose) => ({ x: (p[23].x + p[24].x) / 2, y: (p[23].y + p[24].y) / 2 });
  const ha = hip(a);
  const hb = hip(b);
  const size = Math.max(A.y1 - A.y0, B.y1 - B.y0);
  return Math.hypot(ha.x - hb.x, ha.y - hb.y) < 0.25 * size;
}
