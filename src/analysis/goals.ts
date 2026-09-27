import { pointStats, teamOf } from "./points";
import { analysedSeconds } from "./reliability";
import { scoreMatch } from "./scoring";
import type { AnalysisResult, PointTag } from "./types";

export type GoalMetric = "split" | "netTogether" | "netTime" | "unforced" | "winners" | "breakPoints" | "distance";

export interface Goal {
  metric: GoalMetric;
  target: number;
}

interface GoalSpec {
  label: string;
  /** "max": stay at or below the target; "min": reach at least the target. */
  direction: "max" | "min";
  unit: "%" | "" | "m/min";
  defaultTarget: number;
  /** Target input step and range, in display units. */
  step: number;
  max: number;
  needsPoints?: boolean;
}

export const GOAL_SPECS: Record<GoalMetric, GoalSpec> = {
  split: { label: "Pair split (one up, one back)", direction: "max", unit: "%", defaultTarget: 15, step: 1, max: 100 },
  netTogether: { label: "Together at the net", direction: "min", unit: "%", defaultTarget: 30, step: 1, max: 100 },
  netTime: { label: "My time at the net", direction: "min", unit: "%", defaultTarget: 30, step: 1, max: 100 },
  unforced: { label: "My unforced errors", direction: "max", unit: "", defaultTarget: 5, step: 1, max: 100, needsPoints: true },
  winners: { label: "My winners", direction: "min", unit: "", defaultTarget: 3, step: 1, max: 100, needsPoints: true },
  breakPoints: {
    label: "Break points converted",
    direction: "min",
    unit: "%",
    defaultTarget: 40,
    step: 5,
    max: 100,
    needsPoints: true,
  },
  distance: { label: "Meters covered per minute", direction: "min", unit: "m/min", defaultTarget: 40, step: 5, max: 200 },
};

export const DEFAULT_GOALS: Goal[] = [
  { metric: "split", target: 15 },
  { metric: "netTogether", target: 30 },
  { metric: "unforced", target: 5 },
];

export interface GoalResult {
  goal: Goal;
  /** Measured value in display units, or null when this match can't tell. */
  value: number | null;
  met: boolean | null;
}

interface MatchLike {
  result: AnalysisResult;
  me: number | null;
  points?: PointTag[];
  goldenPoint?: boolean;
}

/** Measure one goal on one match. Needs "this is me"; point goals need tagged points. */
export function evaluateGoal(m: MatchLike, goal: Goal): GoalResult {
  const spec = GOAL_SPECS[goal.metric];
  const none = { goal, value: null, met: null };
  if (m.me === null) return none;
  const team = teamOf(m.me);
  const tactics = (m.result.teams ?? []).find((t) => t.team === team);
  const me = m.result.players.find((p) => p.playerId === m.me);
  const tags = m.points ?? [];
  if (spec.needsPoints && tags.length === 0) return none;

  let value: number | null = null;
  switch (goal.metric) {
    case "split":
      value = tactics ? tactics.split * 100 : null;
      break;
    case "netTogether":
      value = tactics ? tactics.togetherNet * 100 : null;
      break;
    case "netTime":
      value = me ? me.zoneShare.net * 100 : null;
      break;
    case "distance":
      value = me ? me.distanceMeters / (analysedSeconds(m.result) / 60) : null;
      break;
    case "unforced":
    case "winners": {
      const s = pointStats(m.result.rallies, tags).perPlayer[m.me];
      value = goal.metric === "unforced" ? s?.unforced ?? 0 : s?.winner ?? 0;
      break;
    }
    case "breakPoints": {
      const bp = scoreMatch(m.result.rallies, m.result.shots, tags, !!m.goldenPoint).breakPoints[team];
      value = bp.chances ? (bp.won / bp.chances) * 100 : null;
      break;
    }
  }
  if (value === null) return none;
  return { goal, value, met: spec.direction === "max" ? value <= goal.target : value >= goal.target };
}

export function formatGoalValue(metric: GoalMetric, v: number): string {
  const unit = GOAL_SPECS[metric].unit;
  const n = unit === "%" || unit === "m/min" ? Math.round(v) : Math.round(v * 10) / 10;
  return unit === "%" ? `${n}%` : unit ? `${n} ${unit}` : String(n);
}

export function describeGoal(goal: Goal): string {
  const spec = GOAL_SPECS[goal.metric];
  return `${spec.label} ${spec.direction === "max" ? "≤" : "≥"} ${formatGoalValue(goal.metric, goal.target)}`;
}
