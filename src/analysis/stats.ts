import { COURT_LENGTH, COURT_WIDTH, netDistance, zoneOf } from "./court";
import { playerIdentity } from "./tracker";
import type { CourtZone, PlayerStats, Point, SampledFrame, Shot, ShotType } from "./types";

const SHOT_TYPES: ShotType[] = [
  "serve",
  "forehand",
  "backhand",
  "forehand-volley",
  "backhand-volley",
  "overhead",
];
/** Faster than a sprinting padel player: treat as tracking noise. */
const MAX_REALISTIC_SPEED = 8;

export function emptyShotCounts(): Record<ShotType, number> {
  return Object.fromEntries(SHOT_TYPES.map((t) => [t, 0])) as Record<ShotType, number>;
}

/** Centered moving average to take the jitter out of foot positions. */
export function smooth(points: { t: number; p: Point }[], window = 2) {
  return points.map((pt, i) => {
    let x = 0;
    let y = 0;
    let n = 0;
    for (let j = Math.max(0, i - window); j <= Math.min(points.length - 1, i + window); j++) {
      x += points[j].p.x;
      y += points[j].p.y;
      n++;
    }
    return { t: pt.t, p: { x: x / n, y: y / n } };
  });
}

export function computePlayerStats(
  frames: SampledFrame[],
  shots: Shot[],
  dominantHand: Map<number, "left" | "right">,
): PlayerStats[] {
  const byPlayer = new Map<number, { t: number; p: Point }[]>();
  const detected = new Map<number, number>();
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const dt = Math.min(1, Math.max(0, (frames[i + 1]?.t ?? f.t) - f.t));
    for (const pose of f.poses) {
      if (pose.playerId < 0) continue;
      const list = byPlayer.get(pose.playerId) ?? [];
      list.push({ t: f.t, p: pose.court });
      byPlayer.set(pose.playerId, list);
      if (!pose.interpolated) detected.set(pose.playerId, (detected.get(pose.playerId) ?? 0) + dt);
    }
  }

  const stats: PlayerStats[] = [];
  for (const [playerId, raw] of [...byPlayer.entries()].sort((a, b) => a[0] - b[0])) {
    const track = smooth(raw);
    let distance = 0;
    let movingTime = 0;
    let maxSpeed = 0;
    let trackedSeconds = 0;
    for (let i = 1; i < track.length; i++) {
      const dt = track[i].t - track[i - 1].t;
      if (dt <= 0 || dt > 1) continue;
      trackedSeconds += dt;
      const d = Math.hypot(track[i].p.x - track[i - 1].p.x, track[i].p.y - track[i - 1].p.y);
      const v = d / dt;
      if (v > MAX_REALISTIC_SPEED) continue;
      distance += d;
      movingTime += dt;
      maxSpeed = Math.max(maxSpeed, v);
    }

    const heatmap = Array.from({ length: COURT_LENGTH }, () => new Array<number>(COURT_WIDTH).fill(0));
    const zoneCounts: Record<CourtZone, number> = { net: 0, transition: 0, baseline: 0 };
    let netDistSum = 0;
    for (const { p } of track) {
      const row = Math.min(COURT_LENGTH - 1, Math.max(0, Math.floor(p.y)));
      const col = Math.min(COURT_WIDTH - 1, Math.max(0, Math.floor(p.x)));
      heatmap[row][col] += 1 / track.length;
      zoneCounts[zoneOf(p)] += 1;
      netDistSum += netDistance(p);
    }

    const playerShots = shots.filter((s) => s.playerId === playerId);
    const counts = emptyShotCounts();
    for (const s of playerShots) counts[s.type]++;
    const { team, label } = playerIdentity(playerId);

    stats.push({
      playerId,
      label,
      team,
      distanceMeters: distance,
      avgSpeed: movingTime > 0 ? distance / movingTime : 0,
      maxSpeed,
      trackedSeconds,
      detectedSeconds: detected.get(playerId) ?? 0,
      zoneShare: {
        net: zoneCounts.net / track.length,
        transition: zoneCounts.transition / track.length,
        baseline: zoneCounts.baseline / track.length,
      },
      shots: counts,
      totalShots: playerShots.length,
      avgSwingSpeed: playerShots.length
        ? playerShots.reduce((a, s) => a + s.swingSpeed, 0) / playerShots.length
        : 0,
      dominantHand: dominantHand.get(playerId) ?? "right",
      heatmap,
      avgNetDistance: netDistSum / track.length,
    });
  }
  return stats;
}

/** The sampled frame closest to time `t` (frames are sorted by time, not necessarily evenly spaced). */
export function frameAt<T extends { t: number }>(frames: T[], t: number): T | undefined {
  if (!frames.length) return undefined;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const prev = frames[lo - 1];
  return prev && t - prev.t < frames[lo].t - t ? prev : frames[lo];
}

/** Refresh shot counts after the user corrects shots (movement stats stay as they were). */
export function recountShots(players: PlayerStats[], shots: Shot[]): PlayerStats[] {
  return players.map((p) => {
    const mine = shots.filter((s) => s.playerId === p.playerId);
    const counts = emptyShotCounts();
    for (const s of mine) counts[s.type]++;
    return {
      ...p,
      shots: counts,
      totalShots: mine.length,
      avgSwingSpeed: mine.length ? mine.reduce((a, s) => a + s.swingSpeed, 0) / mine.length : 0,
    };
  });
}

/**
 * Fill short gaps in each player's track by interpolating their position:
 * players move smoothly, and a brief miss shouldn't break pair statistics.
 * Filled positions carry no body landmarks and are flagged.
 */
export function fillGaps(frames: SampledFrame[], maxGap = 1.0): SampledFrame[] {
  const out = frames.map((f) => ({ ...f, poses: [...f.poses] }));
  const ids = new Set(frames.flatMap((f) => f.poses.map((p) => p.playerId)));
  for (const id of ids) {
    let last = -1;
    for (let i = 0; i < frames.length; i++) {
      const p = frames[i].poses.find((q) => q.playerId === id && !q.interpolated);
      if (!p) continue;
      if (last >= 0 && i - last > 1 && frames[i].t - frames[last].t <= maxGap) {
        const a = frames[last].poses.find((q) => q.playerId === id)!.court;
        const b = p.court;
        for (let k = last + 1; k < i; k++) {
          const u = (frames[k].t - frames[last].t) / (frames[i].t - frames[last].t);
          out[k].poses.push({
            playerId: id,
            landmarks: [],
            court: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u },
            interpolated: true,
          });
        }
      }
      last = i;
    }
  }
  return out;
}
