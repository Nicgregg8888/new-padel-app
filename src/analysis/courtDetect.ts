import type { CourtCorners, Point } from "./types";

/** Minimal ImageData shape, so this runs in tests without a DOM. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * Find the playing surface automatically. A padel court is enclosed by walls
 * and covered wall to wall in one carpet colour, so the carpet's outline is
 * the court boundary. We take the carpet colour from the lower middle of the
 * frame, grow that region, and fit the largest quadrilateral inside its hull.
 *
 * Returns corners in normalized coordinates (far-left, far-right, near-right,
 * near-left), or null when nothing court-shaped is found.
 */
export function detectCourt(img: Pixels): CourtCorners | null {
  const { width: W, height: H, data } = img;
  const seed = surfaceColor(img);
  if (!seed) return null;

  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (matches(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], seed)) mask[i] = 1;
  }

  // Court lines and the net cut the carpet into pieces: bridge thin gaps.
  const radius = Math.max(2, Math.round(W / 110));
  close(mask, W, H, radius);

  const start = seedPixel(mask, W, H);
  if (start < 0) return null;
  const region = floodFill(mask, W, H, start);
  const area = region.count / (W * H);
  if (area < 0.05 || area > 0.92) return null;

  // Row extremes are enough to build the hull and ignore holes (players, lines).
  const pts: Point[] = [];
  for (let y = 0; y < H; y++) {
    if (region.minX[y] <= region.maxX[y]) {
      pts.push({ x: region.minX[y], y }, { x: region.maxX[y] + 1, y });
    }
  }
  const hull = convexHull(pts);
  if (hull.length < 4) return null;
  const quad = maxAreaQuad(hull);
  const hullArea = polygonArea(hull);
  if (polygonArea(quad) < 0.85 * hullArea) return null;

  const ordered = orderCorners(quad.map((p) => ({ x: p.x / W, y: p.y / H })));
  // Camera is behind a baseline: the far edge can't be much wider than the near one.
  const farW = ordered[1].x - ordered[0].x;
  const nearW = ordered[2].x - ordered[3].x;
  if (farW <= 0 || nearW <= 0 || farW > nearW * 1.15) return null;
  return ordered;
}

interface Chroma {
  r: number;
  g: number;
  lum: number;
}

function chroma(r: number, g: number, b: number): Chroma {
  const s = r + g + b + 1;
  return { r: r / s, g: g / s, lum: s / 3 };
}

function matches(r: number, g: number, b: number, seed: Chroma): boolean {
  const c = chroma(r, g, b);
  // Compare hue-ish chromaticity tightly and brightness loosely (shadows, glare).
  return Math.hypot(c.r - seed.r, c.g - seed.g) < 0.045 && c.lum > seed.lum * 0.45 && c.lum < seed.lum * 1.8;
}

/** Median colour of the lower-middle of the frame, where the near court usually is. */
function surfaceColor({ width: W, height: H, data }: Pixels): Chroma | null {
  const rs: number[] = [];
  const gs: number[] = [];
  const ls: number[] = [];
  for (let y = Math.floor(H * 0.6); y < H * 0.92; y += 2) {
    for (let x = Math.floor(W * 0.3); x < W * 0.7; x += 2) {
      const i = (y * W + x) * 4;
      const c = chroma(data[i], data[i + 1], data[i + 2]);
      rs.push(c.r);
      gs.push(c.g);
      ls.push(c.lum);
    }
  }
  if (!rs.length) return null;
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
  const seed = { r: med(rs), g: med(gs), lum: med(ls) };
  // Grey (white lines, concrete) isn't a carpet colour we can segment reliably.
  if (Math.hypot(seed.r - 1 / 3, seed.g - 1 / 3) < 0.03) return null;
  return seed;
}

/** Morphological closing (dilate then erode) with a square window, in place. */
function close(mask: Uint8Array, W: number, H: number, r: number) {
  const pass = (src: Uint8Array, dilate: boolean) => {
    const tmp = new Uint8Array(W * H);
    const out = new Uint8Array(W * H);
    // Separable: rows then columns, using running counts.
    for (let y = 0; y < H; y++) {
      let sum = 0;
      for (let x = -r; x < W; x++) {
        if (x + r < W) sum += src[y * W + x + r];
        if (x - r - 1 >= 0) sum -= src[y * W + x - r - 1];
        if (x >= 0) {
          const span = Math.min(W - 1, x + r) - Math.max(0, x - r) + 1;
          tmp[y * W + x] = dilate ? +(sum > 0) : +(sum === span);
        }
      }
    }
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let y = -r; y < H; y++) {
        if (y + r < H) sum += tmp[(y + r) * W + x];
        if (y - r - 1 >= 0) sum -= tmp[(y - r - 1) * W + x];
        if (y >= 0) {
          const span = Math.min(H - 1, y + r) - Math.max(0, y - r) + 1;
          out[y * W + x] = dilate ? +(sum > 0) : +(sum === span);
        }
      }
    }
    return out;
  };
  mask.set(pass(pass(mask, true), false));
}

function seedPixel(mask: Uint8Array, W: number, H: number): number {
  // Nearest masked pixel to the lower-middle, searching outward.
  const cx = Math.floor(W / 2);
  const cy = Math.floor(H * 0.75);
  for (let r = 0; r < Math.max(W, H) / 3; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x]) return y * W + x;
      }
    }
  }
  return -1;
}

function floodFill(mask: Uint8Array, W: number, H: number, start: number) {
  const minX = new Int32Array(H).fill(W);
  const maxX = new Int32Array(H).fill(-1);
  const seen = new Uint8Array(W * H);
  const stack = [start];
  seen[start] = 1;
  let count = 0;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % W;
    const y = (i - x) / W;
    count++;
    if (x < minX[y]) minX[y] = x;
    if (x > maxX[y]) maxX[y] = x;
    const n = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
    for (const j of n) {
      if (j >= 0 && mask[j] && !seen[j]) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return { count, minX, maxX };
}

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Andrew's monotone chain. */
export function convexHull(points: Point[]): Point[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const lower: Point[] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper: Point[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function polygonArea(poly: Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Largest-area quadrilateral with vertices on the hull (local search from extreme points). */
function maxAreaQuad(hull: Point[]): Point[] {
  const n = hull.length;
  const argBy = (f: (p: Point) => number) => hull.reduce((best, p, i) => (f(p) > f(hull[best]) ? i : best), 0);
  let idx = [
    argBy((p) => -(p.x + p.y)),
    argBy((p) => p.x - p.y),
    argBy((p) => p.x + p.y),
    argBy((p) => -(p.x - p.y)),
  ].sort((a, b) => a - b);
  if (new Set(idx).size < 4) idx = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4)];
  const area = (ix: number[]) => polygonArea(ix.map((i) => hull[i]));
  let best = area(idx);
  for (let improved = true, iter = 0; improved && iter < 50; iter++) {
    improved = false;
    for (let k = 0; k < 4; k++) {
      for (let c = 0; c < n; c++) {
        if (idx.includes(c)) continue;
        const trial = [...idx];
        trial[k] = c;
        trial.sort((a, b) => a - b);
        const a = area(trial);
        if (a > best + 1e-9) {
          best = a;
          idx = trial;
          improved = true;
        }
      }
    }
  }
  return idx.map((i) => hull[i]);
}

/** Far-left, far-right, near-right, near-left (image y grows downward). */
export function orderCorners(pts: Point[]): CourtCorners {
  const byY = [...pts].sort((a, b) => a.y - b.y);
  const [fl, fr] = byY.slice(0, 2).sort((a, b) => a.x - b.x);
  const [nl, nr] = byY.slice(2).sort((a, b) => a.x - b.x);
  return [fl, fr, nr, nl];
}

/** Grab a small copy of the current video frame for detection. */
export function framePixels(video: HTMLVideoElement, width = 320): Pixels {
  const scale = width / video.videoWidth;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = Math.max(1, Math.round(video.videoHeight * scale));
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, c.width, c.height);
  return ctx.getImageData(0, 0, c.width, c.height);
}
