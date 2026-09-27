import { pointStats, teamOf } from "./points";
import { analysedSeconds } from "./reliability";
import type { AnalysisResult, PointTag } from "./types";

interface MatchLike {
  id: string;
  createdAt: number;
  result: AnalysisResult;
  me: number | null;
  points?: PointTag[];
  demo?: boolean;
}

interface MetricDef {
  key: string;
  label: string;
  /** Is a higher value better for you? */
  higherIsBetter: boolean;
  unit: "pts" | "" | "m/min";
  value: (m: MatchLike) => number | null;
}

const mins = (m: MatchLike) => analysedSeconds(m.result) / 60;
const mine = (m: MatchLike) => m.result.players.find((p) => p.playerId === m.me) ?? null;
const pair = (m: MatchLike) => (m.me === null ? null : (m.result.teams ?? []).find((t) => t.team === teamOf(m.me!)) ?? null);

const METRICS: MetricDef[] = [
  { key: "net", label: "Time at the net", higherIsBetter: true, unit: "pts", value: (m) => (mine(m) ? mine(m)!.zoneShare.net * 100 : null) },
  { key: "together", label: "Together at the net", higherIsBetter: true, unit: "pts", value: (m) => (pair(m) ? pair(m)!.togetherNet * 100 : null) },
  { key: "split", label: "Pair split", higherIsBetter: false, unit: "pts", value: (m) => (pair(m) ? pair(m)!.split * 100 : null) },
  { key: "pace", label: "Meters per minute", higherIsBetter: true, unit: "m/min", value: (m) => (mine(m) ? mine(m)!.distanceMeters / mins(m) : null) },
  {
    key: "won",
    label: "Points won",
    higherIsBetter: true,
    unit: "pts",
    value: (m) => {
      const tags = m.points ?? [];
      if (!tags.length || m.me === null) return null;
      return (pointStats(m.result.rallies, tags).score[teamOf(m.me)] / tags.length) * 100;
    },
  },
  {
    key: "unforced",
    label: "Unforced errors per 10 points",
    higherIsBetter: false,
    unit: "",
    value: (m) => {
      const tags = m.points ?? [];
      if (tags.length < 5 || m.me === null) return null;
      return ((pointStats(m.result.rallies, tags).perPlayer[m.me]?.unforced ?? 0) / tags.length) * 10;
    },
  },
];

export interface Comparison {
  key: string;
  label: string;
  current: number;
  usual: number;
  delta: number;
  /** Did this match go the good way for you? null when the change is negligible. */
  better: boolean | null;
  unit: MetricDef["unit"];
  /** How many earlier matches the "usual" value averages. */
  basis: number;
}

/** This match against the average of your last few matches (where you marked yourself). */
export function compareWithUsual(current: MatchLike, history: MatchLike[], window = 5): Comparison[] {
  if (current.me === null) return [];
  const earlier = history
    .filter((m) => m.id !== current.id && !m.demo && m.me !== null && m.createdAt <= current.createdAt)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, window);
  const out: Comparison[] = [];
  for (const def of METRICS) {
    const now = def.value(current);
    if (now === null) continue;
    const past = earlier.map(def.value).filter((v): v is number => v !== null);
    if (!past.length) continue;
    const usual = past.reduce((a, b) => a + b, 0) / past.length;
    const delta = now - usual;
    const threshold = def.unit === "m/min" ? 2 : def.unit === "pts" ? 2 : 0.3;
    out.push({
      key: def.key,
      label: def.label,
      current: now,
      usual,
      delta,
      better: Math.abs(delta) < threshold ? null : def.higherIsBetter ? delta > 0 : delta < 0,
      unit: def.unit,
      basis: past.length,
    });
  }
  return out;
}

export function formatDelta(c: Comparison): string {
  const sign = c.delta > 0 ? "+" : c.delta < 0 ? "−" : "±";
  const v = Math.abs(c.delta);
  const n = c.unit === "" ? v.toFixed(1) : Math.round(v).toString();
  return `${sign}${n}${c.unit === "pts" ? " pts" : c.unit === "m/min" ? " m/min" : ""}`;
}

export function formatValue(c: Comparison, v: number): string {
  if (c.unit === "pts") return `${Math.round(v)}%`;
  if (c.unit === "m/min") return `${Math.round(v)} m/min`;
  return v.toFixed(1);
}
