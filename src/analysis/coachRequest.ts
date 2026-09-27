import type { CoachRequest } from "../../shared/coach";
import { SHOT_LABELS } from "../lib/format";
import { playerIdentity } from "./tracker";
import { describeGoal, evaluateGoal, formatGoalValue, type Goal } from "./goals";
import { pointStats } from "./points";
import { analysedSeconds } from "./reliability";
import { scoreMatch } from "./scoring";
import type { AnalysisResult, PointTag, Shot } from "./types";

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
  const start = result.range?.start ?? 0;
  const end = result.range?.end ?? result.duration;
  return Array.from({ length: 4 }, (_, i) => ({
    t: start + ((i + 0.5) / 4) * (end - start),
    caption: "General play (no shots detected nearby)",
  }));
}

export function buildCoachSummary(
  result: AnalysisResult,
  people: {
    names?: Record<number, string>;
    me?: number | null;
    points?: PointTag[];
    goldenPoint?: boolean;
    goals?: Goal[];
  } = {},
): CoachRequest["summary"] {
  const { rallies } = result;
  return {
    durationSeconds: round(analysedSeconds(result), 1),
    calibrated: result.calibrated,
    rallies: rallies.length,
    avgRallyShots: rallies.length ? round(rallies.reduce((a, r) => a + r.shots, 0) / rallies.length, 1) : 0,
    players: result.players.map(({ heatmap: _heatmap, ...p }) => ({
      ...p,
      ...(people.names?.[p.playerId]?.trim() ? { name: people.names[p.playerId].trim().slice(0, 60) } : {}),
      ...(people.me === p.playerId ? { isMe: true } : {}),
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
    ...(people.points?.length ? { points: pointStats(result.rallies, people.points) } : {}),
    ...(people.goals?.length && people.me != null
      ? {
          goals: people.goals.map((g) => {
            const r = evaluateGoal({ result, me: people.me ?? null, points: people.points, goldenPoint: people.goldenPoint }, g);
            return {
              goal: describeGoal(g),
              ...(r.value !== null ? { value: formatGoalValue(g.metric, r.value) } : {}),
              ...(r.met !== null ? { met: r.met } : {}),
            };
          }),
        }
      : {}),
    ...(people.points?.length ? { score: scoreSummary(result, people.points, !!people.goldenPoint) } : {}),
    teams: (result.teams ?? []).map((t) => ({
      team: t.team,
      pairedSeconds: round(t.pairedSeconds, 0),
      togetherNet: round(t.togetherNet),
      togetherMid: round(t.togetherMid),
      togetherBack: round(t.togetherBack),
      staggered: round(t.staggered),
      split: round(t.split),
      avgSpacing: round(t.avgSpacing, 1),
      avgDepthGap: round(t.avgDepthGap, 1),
      avgLateralGap: round(t.avgLateralGap, 1),
      netTakings: t.netTakings,
    })),
    shots: result.shots.slice(0, 2000).map((s) => ({
      t: round(s.t, 1),
      playerId: s.playerId,
      type: s.type,
      zone: s.zone,
      swingSpeed: round(s.swingSpeed, 1),
      ...(s.confirmed ? { confirmed: true } : {}),
      ...(s.lob ? { lob: true } : {}),
      ...(s.edited ? { edited: true } : {}),
    })),
  };
}

function scoreSummary(result: AnalysisResult, points: PointTag[], golden: boolean) {
  const s = scoreMatch(result.rallies, result.shots, points, golden);
  return {
    // The server accepts up to 10 sets; a very long session keeps the latest.
    sets: s.sets.slice(-10).map((set) => ({ A: set.A, B: set.B })),
    currentGame: s.points,
    goldenPoint: golden,
    breakPoints: s.breakPoints,
    serviceGamesHeld: s.holds,
  };
}
