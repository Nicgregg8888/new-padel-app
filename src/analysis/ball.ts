import type { Pixels } from "./courtDetect";
import type { BallEvent, BallObs, FramePose, Point, Shot } from "./types";

/** Axis-aligned box in normalized image coordinates. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Candidate extends Point {
  area: number;
}

const MOTION_THRESHOLD = 14;
/** How much brighter than its surroundings a ball pixel must be. */
const LOCAL_CONTRAST = 18;
const MIN_AREA = 1;
const MAX_AREA_FRACTION = 0.0012; // of the processed frame; a ball is tiny

/** Fluorescent yellow-green, the colour of every padel ball. */
export function isBallColor(r: number, g: number, b: number): boolean {
  const s = r + g + b;
  if (s < 250) return false;
  const rc = r / s;
  const gc = g / s;
  const bc = b / s;
  return bc < 0.24 && gc > 0.36 && rc > 0.24 && Math.abs(rc - gc) < 0.12;
}

/**
 * Finds ball candidates in one frame: small blobs that are ball-coloured AND
 * changed since the previous frame (so a yellow sign or shoe standing still
 * doesn't count).
 */
export class BallDetector {
  private prev: Uint8Array | null = null;

  /**
   * @param exclude boxes to ignore (players' bodies)
   * @param inside optional polygon (normalized) the ball must be in, e.g. the
   *   air above the court, to ignore the crowd and screens
   */
  detect(img: Pixels, exclude: Box[] = [], inside?: Point[]): Candidate[] {
    const { width: W, height: H, data } = img;
    const gray = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      gray[i] = (data[i * 4] * 77 + data[i * 4 + 1] * 150 + data[i * 4 + 2] * 29) >> 8;
    }
    const prev = this.prev;
    this.prev = gray;
    if (!prev || prev.length !== gray.length) return [];

    // Local background brightness (box blur via an integral image).
    const R = 5;
    const integral = new Uint32Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) {
        row += gray[y * W + x];
        integral[(y + 1) * (W + 1) + x + 1] = integral[y * (W + 1) + x + 1] + row;
      }
    }
    const localMean = (x: number, y: number) => {
      const x0 = Math.max(0, x - R);
      const y0 = Math.max(0, y - R);
      const x1 = Math.min(W, x + R + 1);
      const y1 = Math.min(H, y + R + 1);
      const sum =
        integral[y1 * (W + 1) + x1] - integral[y0 * (W + 1) + x1] - integral[y1 * (W + 1) + x0] + integral[y0 * (W + 1) + x0];
      return sum / ((x1 - x0) * (y1 - y0));
    };

    // In real footage a fast ball is a motion-blurred smudge that often loses
    // its yellow, so accept either ball colour or "a moving spot clearly
    // brighter than the surface around it".
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      if (Math.abs(gray[i] - prev[i]) <= MOTION_THRESHOLD) continue;
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      if (isBallColor(r, g, b)) {
        mask[i] = 1;
        continue;
      }
      const x = i % W;
      const y = (i - x) / W;
      if (gray[i] - localMean(x, y) > LOCAL_CONTRAST) mask[i] = 1;
    }

    const maxArea = Math.max(6, MAX_AREA_FRACTION * W * H);
    const out: Candidate[] = [];
    const seen = new Uint8Array(W * H);
    for (let start = 0; start < W * H; start++) {
      if (!mask[start] || seen[start]) continue;
      // Flood fill one blob (8-connected: motion blur makes diagonal streaks).
      const stack = [start];
      seen[start] = 1;
      let area = 0;
      let sx = 0;
      let sy = 0;
      while (stack.length) {
        const i = stack.pop()!;
        const x = i % W;
        const y = (i - x) / W;
        area++;
        sx += x;
        sy += y;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const j = ny * W + nx;
            if (mask[j] && !seen[j]) {
              seen[j] = 1;
              stack.push(j);
            }
          }
        }
      }
      if (area < MIN_AREA || area > maxArea) continue;
      const p = { x: (sx / area + 0.5) / W, y: (sy / area + 0.5) / H };
      if (exclude.some((b) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1)) continue;
      if (inside && !pointInPolygon(p, inside)) continue;
      out.push({ ...p, area });
    }
    return out;
  }
}

/**
 * Player boxes: where shirts, limbs and rackets (not balls) move. Whole
 * bodies, since white kit and bare arms look just like a blurred ball.
 */
export function torsoBoxes(poses: FramePose[]): Box[] {
  return poses.map(({ landmarks: l }) => {
    const pts = l.filter((p) => p.visibility > 0.2);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    if (!xs.length) return { x0: 0, x1: 0, y0: 0, y1: 0 };
    const h = Math.max(...ys) - Math.min(...ys);
    return {
      x0: Math.min(...xs) - h * 0.12,
      x1: Math.max(...xs) + h * 0.12,
      y0: Math.min(...ys) - h * 0.1,
      y1: Math.max(...ys) + h * 0.05,
    };
  });
}

interface Tracklet {
  obs: BallObs[];
  vel: Point;
}

/**
 * Links per-frame candidates into paths. Several paths are followed at once
 * (constant-velocity prediction); at the end only paths that actually travel
 * are kept, which throws out things that jiggle in place like shirt logos.
 */
export class BallTracker {
  private live: Tracklet[] = [];
  private done: Tracklet[] = [];

  push(t: number, cands: Candidate[]): void {
    // Retire paths that went quiet.
    const still: Tracklet[] = [];
    for (const tr of this.live) (t - tr.obs[tr.obs.length - 1].t > 0.3 ? this.done : still).push(tr);
    this.live = still;

    const pairs: { tr: Tracklet; c: Candidate; d: number }[] = [];
    for (const tr of this.live) {
      const last = tr.obs[tr.obs.length - 1];
      const dt = t - last.t;
      if (dt <= 0) continue;
      const pred = { x: last.x + tr.vel.x * dt, y: last.y + tr.vel.y * dt };
      // A struck ball can cross a big slice of the frame in a few frames.
      const gate = 0.05 + 1.2 * dt;
      for (const c of cands) {
        const d = Math.hypot(c.x - pred.x, c.y - pred.y);
        if (d < gate) pairs.push({ tr, c, d });
      }
    }
    pairs.sort((a, b) => a.d - b.d);
    const usedT = new Set<Tracklet>();
    const usedC = new Set<Candidate>();
    for (const { tr, c } of pairs) {
      if (usedT.has(tr) || usedC.has(c)) continue;
      usedT.add(tr);
      usedC.add(c);
      const last = tr.obs[tr.obs.length - 1];
      const dt = Math.max(t - last.t, 1e-3);
      const v = { x: (c.x - last.x) / dt, y: (c.y - last.y) / dt };
      tr.vel = tr.obs.length === 1 ? v : { x: tr.vel.x * 0.3 + v.x * 0.7, y: tr.vel.y * 0.3 + v.y * 0.7 };
      tr.obs.push({ t, x: c.x, y: c.y });
    }
    for (const c of cands) {
      if (!usedC.has(c) && this.live.length < 12) this.live.push({ obs: [{ t, x: c.x, y: c.y }], vel: { x: 0, y: 0 } });
    }
  }

  /** The ball path: travelling tracklets, stitched in time order. */
  result(): BallObs[] {
    const all = [...this.done, ...this.live].filter((tr) => tr.obs.length >= 3);
    const score = (tr: Tracklet) => {
      const a = tr.obs[0];
      const b = tr.obs[tr.obs.length - 1];
      let path = 0;
      for (let i = 1; i < tr.obs.length; i++) {
        path += Math.hypot(tr.obs[i].x - tr.obs[i - 1].x, tr.obs[i].y - tr.obs[i - 1].y);
      }
      const span = Math.max(b.t - a.t, 1e-3);
      return { travel: Math.hypot(b.x - a.x, b.y - a.y), speed: path / span, path };
    };
    const moving = all
      .map((tr) => ({ tr, ...score(tr) }))
      // Must go somewhere, and not just by wobbling back and forth.
      .filter((m) => m.travel > 0.06 && m.speed > 0.12 && m.travel > 0.35 * m.path)
      .sort((a, b) => b.travel - a.travel);
    // Where two travelling paths overlap in time, the one that went further wins.
    const taken: [number, number][] = [];
    const out: BallObs[] = [];
    for (const { tr } of moving) {
      const t0 = tr.obs[0].t;
      const t1 = tr.obs[tr.obs.length - 1].t;
      if (taken.some(([a, b]) => t0 < b && t1 > a)) continue;
      taken.push([t0, t1]);
      out.push(...tr.obs);
    }
    return out.sort((a, b) => a.t - b.t);
  }
}

/** Drop isolated detections: a real ball has neighbours in time along its path. */
export function cleanTrack(track: BallObs[]): BallObs[] {
  return track.filter((o, i) => {
    const near = (j: number) => {
      const p = track[j];
      if (!p) return false;
      const dt = Math.abs(p.t - o.t);
      return dt > 0 && dt < 0.25 && Math.hypot(p.x - o.x, p.y - o.y) < 0.05 + 1.5 * dt;
    };
    return near(i - 1) || near(i + 1);
  });
}

/**
 * Where the ball changed direction sharply. Next to a player's wrist it was
 * hit; turning from falling to rising elsewhere is a bounce; anything else a
 * wall (glass) rebound.
 */
export function ballEvents(track: BallObs[], wristsAt: (t: number) => { playerId: number; p: Point }[]): BallEvent[] {
  const events: BallEvent[] = [];
  for (let i = 1; i < track.length - 1; i++) {
    const a = track[i - 1];
    const b = track[i];
    const c = track[i + 1];
    if (b.t - a.t > 0.25 || c.t - b.t > 0.25) continue;
    const v1 = { x: (b.x - a.x) / (b.t - a.t), y: (b.y - a.y) / (b.t - a.t) };
    const v2 = { x: (c.x - b.x) / (c.t - b.t), y: (c.y - b.y) / (c.t - b.t) };
    const s1 = Math.hypot(v1.x, v1.y);
    const s2 = Math.hypot(v2.x, v2.y);
    if (s1 < 0.05 || s2 < 0.05) continue;
    const cos = (v1.x * v2.x + v1.y * v2.y) / (s1 * s2);
    if (cos > 0.5) continue; // less than 60° turn

    const near = wristsAt(b.t)
      .map((w) => ({ ...w, d: Math.hypot(w.p.x - b.x, w.p.y - b.y) }))
      .sort((p, q) => p.d - q.d)[0];
    let kind: BallEvent["kind"];
    if (near && near.d < 0.06) kind = "hit";
    else if (v1.y > 0 && v2.y < 0) kind = "bounce";
    else kind = "wall";
    const last = events[events.length - 1];
    if (last && b.t - last.t < 0.12) continue; // one event per turn
    events.push({ t: b.t, x: b.x, y: b.y, kind, playerId: kind === "hit" ? near.playerId : undefined });
  }
  return events;
}

/**
 * Use the ball path to vouch for detected swings and spot lobs.
 * A swing is confirmed when the ball was hit near that time by that player.
 * A lob is a hit after which the ball climbs well above the far baseline in
 * the image (height projects upward on screen).
 */
export function annotateShots(
  shots: Shot[],
  track: BallObs[],
  events: BallEvent[],
  farBaselineY: number,
  farDepth: number,
): Shot[] {
  const hits = events.filter((e) => e.kind === "hit");
  const lobLine = farBaselineY - 0.5 * farDepth;
  return shots.map((s) => {
    const hit = hits.find((h) => h.playerId === s.playerId && Math.abs(h.t - s.t) < 0.4);
    if (!hit) return s;
    const nextEvent = events.find((e) => e.t > hit.t + 0.05);
    const until = Math.min(nextEvent?.t ?? Infinity, hit.t + 2.5);
    const flight = track.filter((o) => o.t > hit.t && o.t <= until);
    const apex = Math.min(...flight.map((o) => o.y));
    const lob = flight.length >= 3 && apex < lobLine && s.type !== "overhead";
    return { ...s, confirmed: true, ...(lob ? { lob: true } : {}) };
  });
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
