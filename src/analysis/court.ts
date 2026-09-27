import type { CourtCorners, CourtZone, Point } from "./types";

/** Padel court: 10 m wide, 20 m long, net across the middle. */
export const COURT_WIDTH = 10;
export const COURT_LENGTH = 20;
export const NET_Y = COURT_LENGTH / 2;
/** Service lines sit 6.95 m from the net. */
export const SERVICE_LINE_OFFSET = 6.95;

/** Court-space corners matching the order of {@link CourtCorners}. */
const COURT_CORNERS: [Point, Point, Point, Point] = [
  { x: 0, y: 0 },
  { x: COURT_WIDTH, y: 0 },
  { x: COURT_WIDTH, y: COURT_LENGTH },
  { x: 0, y: COURT_LENGTH },
];

/** Used when the user skips calibration: assume the frame roughly frames the court. */
export const DEFAULT_CORNERS: CourtCorners = [
  { x: 0.3, y: 0.3 },
  { x: 0.7, y: 0.3 },
  { x: 0.95, y: 0.95 },
  { x: 0.05, y: 0.95 },
];

export type Homography = number[]; // 3x3, row-major, h[8] = 1

/** Solve the 8x8 system for a homography mapping src[i] -> dst[i]. */
export function computeHomography(src: Point[], dst: Point[]): Homography {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinear(A, b);
  return [...h, 1];
}

/** Gaussian elimination with partial pivoting. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) throw new Error("Degenerate court corners");
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export function applyHomography(h: Homography, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / w,
  };
}

export function imageToCourtHomography(corners: CourtCorners): Homography {
  return computeHomography(corners, COURT_CORNERS);
}

export function courtToImageHomography(corners: CourtCorners): Homography {
  return computeHomography(COURT_CORNERS, corners);
}

export function netDistance(p: Point): number {
  return Math.abs(p.y - NET_Y);
}

export function zoneOf(p: Point): CourtZone {
  const d = netDistance(p);
  if (d < 4) return "net";
  if (d < SERVICE_LINE_OFFSET + 1) return "transition";
  return "baseline";
}

/** Players can stand a little outside the lines (glass walls, exits), but not far. */
export function isOnCourt(p: Point, margin = 2): boolean {
  return (
    p.x > -margin &&
    p.x < COURT_WIDTH + margin &&
    p.y > -margin &&
    p.y < COURT_LENGTH + margin
  );
}
