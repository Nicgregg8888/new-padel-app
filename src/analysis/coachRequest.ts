import type { CoachRequest } from "../../shared/coach";
import { SHOT_LABELS } from "../lib/format";
import { playerIdentity } from "./tracker";
import type { AnalysisResult, Shot } from "./types";

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/** Pick up to `n` shots spread across the match, favouring variety of players and shot types. */
export function pickKeyShots(shots: Shot[], n: number): Shot[] {
  if (shots.length <= n) return shots;
  const picked: Shot[] = [];
  const seen = new Set<string>();
  const bucket = shots.length / n;
  for (let i = 0; i < n; i++) {
    const slice = shots.slice(Math.floor(i * bucket), Math.floor((i + 1) * bucket));
    const fresh = slice.find((s) => !seen.has(`${s.playerId}:${s.type}`));
    const best = fresh ?? slice.reduce((a, b) => (b.swingSpeed > a.swingSpeed ? b : a));
    seen.add(`${best.playerId}:${best.type}`);
    picked.push(best);
  }
  return picked;
}

export interface KeyframePlan {
  t: number;
  caption: string;
}

export function planKeyframes(result: AnalysisResult, n = 6): KeyframePlan[] {
  const key = pickKeyShots(result.shots, n);
  if (key.length) {
    return key.map((s) => ({
      t: s.t,
      caption: `${playerIdentity(s.playerId).label} — detected ${SHOT_LABELS[s.type].toLowerCase()} from the ${s.zone}`,
    }));
  }
  return Array.from({ length: 4 }, (_, i) => ({
    t: ((i + 0.5) / 4) * result.duration,
    caption: "General play (no shots detected nearby)",
  }));
}

export function buildCoachSummary(result: AnalysisResult): CoachRequest["summary"] {
  const { rallies } = result;
  return {
    durationSeconds: round(result.duration, 1),
    calibrated: result.calibrated,
    rallies: rallies.length,
    avgRallyShots: rallies.length ? round(rallies.reduce((a, r) => a + r.shots, 0) / rallies.length, 1) : 0,
    players: result.players.map(({ heatmap: _heatmap, ...p }) => ({
      ...p,
      distanceMeters: round(p.distanceMeters, 0),
      avgSpeed: round(p.avgSpeed),
      maxSpeed: round(p.maxSpeed),
      trackedSeconds: round(p.trackedSeconds, 0),
      zoneShare: {
        net: round(p.zoneShare.net),
        transition: round(p.zoneShare.transition),
        baseline: round(p.zoneShare.baseline),
      },
      avgSwingSpeed: round(p.avgSwingSpeed, 1),
      avgNetDistance: round(p.avgNetDistance, 1),
    })),
    shots: result.shots.slice(0, 2000).map((s) => ({
      t: round(s.t, 1),
      playerId: s.playerId,
      type: s.type,
      zone: s.zone,
      swingSpeed: round(s.swingSpeed, 1),
    })),
  };
}
