import { zoneOf } from "./court";
import type { FramePose, Point, Pose, Rally, SampledFrame, Shot, ShotType } from "./types";

/** MediaPipe pose landmark indices. */
export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export interface ShotDetectionOptions {
  /** Image width / height, so x and y distances are comparable. */
  aspect: number;
  /** Minimum wrist speed (torso-lengths/s, relative to the hips) to count as a swing. */
  minSwingSpeed?: number;
  /** Minimum gap between two shots by the same player, seconds. */
  cooldown?: number;
  /**
   * Ball-hit times heard in the soundtrack. When given, each one becomes a
   * shot credited to whoever was swinging then, and swings without a sound
   * are dropped.
   */
  hits?: number[];
}

const MIN_VISIBILITY = 0.4;

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const len = (p: Point) => Math.hypot(p.x, p.y);

/** Scale x by aspect ratio so geometry is in (height-normalized) pixels. */
function px(pose: Pose, i: number, aspect: number): Point {
  return { x: pose[i].x * aspect, y: pose[i].y };
}

interface BodyFrame {
  t: number;
  court: Point;
  hipMid: Point;
  shoulderMid: Point;
  torso: number;
  nose: Point;
  leftShoulder: Point;
  rightShoulder: Point;
  wrists: [Point | null, Point | null]; // [left, right]
}

function bodyFrame(t: number, p: FramePose, aspect: number): BodyFrame | null {
  const lm = p.landmarks;
  if (lm.length < 33) return null; // a filled-in position, no body to read
  const ls = px(lm, LM.leftShoulder, aspect);
  const rs = px(lm, LM.rightShoulder, aspect);
  const lh = px(lm, LM.leftHip, aspect);
  const rh = px(lm, LM.rightHip, aspect);
  const shoulderMid = mid(ls, rs);
  const hipMid = mid(lh, rh);
  const torso = len(sub(shoulderMid, hipMid));
  if (torso < 1e-3) return null;
  const wrist = (i: number) => (lm[i].visibility >= MIN_VISIBILITY ? px(lm, i, aspect) : null);
  return {
    t,
    court: p.court,
    hipMid,
    shoulderMid,
    torso,
    nose: px(lm, LM.nose, aspect),
    leftShoulder: ls,
    rightShoulder: rs,
    wrists: [wrist(LM.leftWrist), wrist(LM.rightWrist)],
  };
}

interface SpeedSample {
  frame: BodyFrame;
  speed: number;
  wrist: 0 | 1;
}

/** Wrist speed relative to the hips, in torso-lengths per second. */
function wristSpeeds(track: BodyFrame[]): SpeedSample[] {
  const out: SpeedSample[] = [];
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1];
    const b = track[i];
    const dt = b.t - a.t;
    if (dt <= 0 || dt > 0.5) continue;
    let best: SpeedSample | null = null;
    for (const w of [0, 1] as const) {
      const wa = a.wrists[w];
      const wb = b.wrists[w];
      if (!wa || !wb) continue;
      const ra = sub(wa, a.hipMid);
      const rb = sub(wb, b.hipMid);
      const torso = (a.torso + b.torso) / 2;
      const speed = len(sub(rb, ra)) / torso / dt;
      if (!best || speed > best.speed) best = { frame: b, speed, wrist: w };
    }
    if (best) out.push(best);
  }
  return out;
}

/** Local maxima above threshold, keeping the strongest peak inside each cooldown window. */
export function findPeaks<T extends { speed: number; frame: { t: number } }>(
  samples: T[],
  threshold: number,
  cooldown: number,
): T[] {
  const candidates = samples.filter((s, i) => {
    if (s.speed < threshold) return false;
    const prev = samples[i - 1]?.speed ?? -Infinity;
    const next = samples[i + 1]?.speed ?? -Infinity;
    return s.speed >= prev && s.speed >= next;
  });
  const peaks: T[] = [];
  for (const c of candidates) {
    const last = peaks[peaks.length - 1];
    if (last && c.frame.t - last.frame.t < cooldown) {
      if (c.speed > last.speed) peaks[peaks.length - 1] = c;
    } else {
      peaks.push(c);
    }
  }
  return peaks;
}

/**
 * Classify a swing from the body geometry at the moment of peak wrist speed.
 * Forehand vs backhand: is the racket wrist on the racket-hand side of the
 * shoulder line? Projecting onto the shoulder axis makes this work whether the
 * player faces the camera or has their back to it.
 */
export function classifySwing(
  frame: BodyFrame,
  hand: "left" | "right",
): "forehand" | "backhand" | "overhead" {
  const wrist = frame.wrists[hand === "left" ? 0 : 1] ?? frame.wrists[hand === "left" ? 1 : 0];
  if (!wrist) return "forehand";
  // Image y grows downward: a wrist well above the nose is an overhead (smash/bandeja/víbora).
  if (frame.nose.y - wrist.y > frame.torso * 0.15) return "overhead";
  const axis =
    hand === "right"
      ? sub(frame.rightShoulder, frame.leftShoulder)
      : sub(frame.leftShoulder, frame.rightShoulder);
  const rel = sub(wrist, frame.shoulderMid);
  const proj = rel.x * axis.x + rel.y * axis.y;
  return proj >= 0 ? "forehand" : "backhand";
}

function toShotType(base: "forehand" | "backhand" | "overhead", court: Point): ShotType {
  if (base === "overhead") return "overhead";
  return zoneOf(court) === "net" ? `${base}-volley` : base;
}

export interface ShotDetectionResult {
  shots: Shot[];
  dominantHand: Map<number, "left" | "right">;
}

export function detectShots(frames: SampledFrame[], opts: ShotDetectionOptions): ShotDetectionResult {
  const threshold = opts.minSwingSpeed ?? 9;
  const cooldown = opts.cooldown ?? 0.8;

  const tracks = new Map<number, BodyFrame[]>();
  for (const f of frames) {
    for (const p of f.poses) {
      if (p.playerId < 0) continue;
      const bf = bodyFrame(f.t, p, opts.aspect);
      if (!bf) continue;
      const list = tracks.get(p.playerId) ?? [];
      list.push(bf);
      tracks.set(p.playerId, list);
    }
  }

  const shots: Shot[] = [];
  const dominantHand = new Map<number, "left" | "right">();
  const speeds = new Map<number, SpeedSample[]>();
  for (const [playerId, track] of tracks) {
    const samples = wristSpeeds(track);
    speeds.set(playerId, samples);
    const peaks = findPeaks(samples, threshold, cooldown);
    const rightPeaks = peaks.filter((p) => p.wrist === 1).length;
    const hand = rightPeaks >= peaks.length - rightPeaks ? "right" : "left";
    dominantHand.set(playerId, hand);
    if (opts.hits) continue; // the soundtrack decides when shots happened
    for (const peak of peaks) {
      const base = classifySwing(peak.frame, hand);
      shots.push({
        t: peak.frame.t,
        playerId,
        type: toShotType(base, peak.frame.court),
        swingSpeed: peak.speed,
        court: peak.frame.court,
        zone: zoneOf(peak.frame.court),
      });
    }
  }
  if (opts.hits) shots.push(...shotsFromHits(opts.hits, speeds, dominantHand, threshold));
  shots.sort((a, b) => a.t - b.t);
  return { shots, dominantHand };
}

const HIT_WINDOW_S = 0.35;
/** A return can't come faster than this; a pop sooner after a shot is the glass, the floor or an echo. */
const MIN_RETURN_S = 0.45;
const teamOfId = (id: number) => (id < 2 ? "A" : "B");

/**
 * Turn heard ball hits into shots: the hitter is the player whose wrist moved
 * fastest around that moment. Shots alternate across the net, so right after
 * a hit by one pair, prefer the other pair if anyone there was swinging.
 */
function shotsFromHits(
  hits: number[],
  speeds: Map<number, SpeedSample[]>,
  hands: Map<number, "left" | "right">,
  threshold: number,
): Shot[] {
  const out: Shot[] = [];
  const minSpeed = threshold * 0.35;
  let lastTeam: "A" | "B" | null = null;
  let lastT = -Infinity;
  for (const h of [...hits].sort((a, b) => a - b)) {
    if (h - lastT < MIN_RETURN_S) continue;
    // Everyone's fastest wrist movement around the sound.
    const near: { playerId: number; s: SpeedSample }[] = [];
    for (const [playerId, samples] of speeds) {
      const best = samples
        .filter((s) => Math.abs(s.frame.t - h) <= HIT_WINDOW_S)
        .reduce<SpeedSample | null>((a, b) => (!a || b.speed > a.speed ? b : a), null);
      if (best) near.push({ playerId, s: best });
    }
    near.sort((a, b) => b.s.speed - a.s.speed);
    const swinging = near.filter((n) => n.s.speed >= minSpeed);
    const inRally = h - lastT < 3;
    let pick: { playerId: number; s: SpeedSample } | undefined;
    if (inRally && lastTeam) {
      // The same pair never hits twice in a row: it's the other side's shot,
      // even if their swing was hard to see. Still need some movement, or
      // the pop was a bounce or the glass.
      pick = near.find((n) => teamOfId(n.playerId) !== lastTeam && n.s.speed >= minSpeed * 0.5);
    } else {
      pick = swinging[0];
    }
    if (!pick) continue; // a bounce or the glass, or a hitter we can't see
    const hand = hands.get(pick.playerId) ?? "right";
    const base = classifySwing(pick.s.frame, hand);
    out.push({
      t: h,
      playerId: pick.playerId,
      type: toShotType(base, pick.s.frame.court),
      swingSpeed: pick.s.speed,
      court: pick.s.frame.court,
      zone: zoneOf(pick.s.frame.court),
      heard: true,
    });
    lastTeam = teamOfId(pick.playerId);
    lastT = h;
  }
  return out;
}

/** Group shots into rallies: a pause longer than `maxGap` seconds ends a rally. */
export function groupRallies(shots: Shot[], maxGap = 4): Rally[] {
  const rallies: Rally[] = [];
  let current: Shot[] = [];
  const flush = () => {
    if (current.length >= 2) {
      rallies.push({
        start: Math.max(0, current[0].t - 0.5),
        end: current[current.length - 1].t + 1,
        shots: current.length,
      });
    }
    current = [];
  };
  for (const s of shots) {
    if (current.length && s.t - current[current.length - 1].t > maxGap) flush();
    current.push(s);
  }
  flush();
  return rallies;
}

/** The first shot of a rally, hit from the back of the court, is the serve. */
export function markServes(shots: Shot[], rallies: Rally[]): Shot[] {
  const firsts = new Set(
    rallies.map((r) => shots.find((s) => s.t >= r.start && s.t <= r.end)).filter((s): s is Shot => !!s),
  );
  return shots.map((s) => (firsts.has(s) && s.zone === "baseline" && s.type !== "overhead" ? { ...s, type: "serve" } : s));
}
