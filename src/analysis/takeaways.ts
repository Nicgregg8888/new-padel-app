import { GOAL_SPECS, evaluateGoal, formatGoalValue, type Goal } from "./goals";
import { PATTERN_LABELS, pointStats, rankRate, teamOf } from "./points";
import { assessReliability } from "./reliability";
import { scoreMatch } from "./scoring";
import type { AnalysisResult, PairPattern, PointTag } from "./types";

export interface Takeaway {
  tone: "good" | "warn" | "info";
  title: string;
  detail: string;
  /** Section of the results page that explains it. */
  section: "points" | "pair" | "goals" | "players" | "reliability" | "highlights";
  /** Higher shows first. */
  priority: number;
}

interface Input {
  result: AnalysisResult;
  me: number | null;
  name: (id: number) => string;
  points?: PointTag[];
  goldenPoint?: boolean;
  goals: Goal[];
  demo?: boolean;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The few things worth knowing about this match, most important first. */
export function takeaways(m: Input, limit = 4): Takeaway[] {
  const out: Takeaway[] = [];
  const { result } = m;
  const myTeam = m.me === null ? "A" : teamOf(m.me);
  const pair = myTeam === "A" ? `${m.name(0)} & ${m.name(1)}` : `${m.name(2)} & ${m.name(3)}`;
  const who = m.me === null ? `Team ${myTeam}` : "Your pair";
  const tags = m.points ?? [];

  // Positioning vs. outcome: the most actionable thing we can say.
  if (tags.length >= 4) {
    const rates = pointStats(result.rallies, tags).byPattern[myTeam];
    const rows = (Object.entries(rates) as [PairPattern, { won: number; played: number }][]).filter(([, r]) => r.played >= 2);
    if (rows.length >= 2) {
      const rate = (r: { won: number; played: number }) => r.won / r.played;
      const best = rows.reduce((a, b) => (rankRate(b[1]) > rankRate(a[1]) ? b : a));
      const worst = rows.reduce((a, b) => (rankRate(b[1]) < rankRate(a[1]) ? b : a));
      if (rate(best[1]) - rate(worst[1]) >= 0.2) {
        out.push({
          tone: "warn",
          title: `${who} wins ${pct(rate(best[1]))} ${PATTERN_LABELS[best[0]].toLowerCase()}, ${pct(rate(worst[1]))} ${PATTERN_LABELS[worst[0]].toLowerCase()}`,
          detail: `${worst[1].played} points were played ${PATTERN_LABELS[worst[0]].toLowerCase()}. Turning those into ${PATTERN_LABELS[best[0]].toLowerCase()} is the biggest lever in this match.`,
          section: "points",
          priority: 100,
        });
      }
    }
  }

  const tactics = (result.teams ?? []).find((t) => t.team === myTeam);
  if (tactics && tactics.pairedSeconds >= 20) {
    if (tactics.split >= 0.15) {
      out.push({
        tone: "warn",
        title: `${pair} were split ${pct(tactics.split)} of the time`,
        detail: "One at the net and one at the back leaves the middle open. Move up and back together.",
        section: "pair",
        priority: 80 + tactics.split * 40,
      });
    } else if (tactics.togetherNet >= 0.35) {
      out.push({
        tone: "good",
        title: `Strong net control: together at the net ${pct(tactics.togetherNet)} of the time`,
        detail: "That's where padel points are won. Keep taking the net as a pair.",
        section: "pair",
        priority: 60,
      });
    }
  }

  if (m.goals.length && m.me !== null) {
    const results = m.goals.map((g) => evaluateGoal(m, g)).filter((r) => r.met !== null);
    const missed = results.filter((r) => r.met === false);
    if (results.length && missed.length === 0) {
      out.push({
        tone: "good",
        title: `All ${results.length} goals met`,
        detail: "Time to raise a target or add a new one.",
        section: "goals",
        priority: 70,
      });
    } else if (missed.length) {
      out.push({
        tone: "warn",
        title: `Missed ${missed.length} of ${results.length} goals`,
        detail: missed
          .map((r) => `${GOAL_SPECS[r.goal.metric].label.toLowerCase()} ${formatGoalValue(r.goal.metric, r.value!)} (target ${formatGoalValue(r.goal.metric, r.goal.target)})`)
          .join("; "),
        section: "goals",
        priority: 75,
      });
    }
  }

  if (tags.length) {
    const bp = scoreMatch(result.rallies, result.shots, tags, !!m.goldenPoint).breakPoints[myTeam];
    if (bp.chances >= 3 && bp.won / bp.chances < 0.3) {
      out.push({
        tone: "warn",
        title: `${who} converted ${bp.won} of ${bp.chances} break points`,
        detail: "The chances were there. Look at how those points were played.",
        section: "points",
        priority: 65,
      });
    }
    if (m.me !== null) {
      const mine = pointStats(result.rallies, tags).perPlayer[m.me];
      if (mine && mine.unforced >= 3 && mine.unforced > mine.winner) {
        out.push({
          tone: "warn",
          title: `${mine.unforced} unforced errors vs ${mine.winner} winners`,
          detail: "Cutting a few free points is often quicker than finding more winners.",
          section: "points",
          priority: 62,
        });
      }
    }
  }

  if (!m.demo) {
    const rel = assessReliability(result);
    if (rel.grade !== "good") {
      const weakest = rel.coverage.reduce((a, b) => (b.share < a.share ? b : a));
      out.push({
        tone: "info",
        title: rel.grade === "poor" ? "Treat these numbers with care" : "Some numbers are approximate",
        detail: `${m.name(weakest.playerId)} was tracked only ${pct(weakest.share)} of the time. ${rel.tips[0] ?? ""}`.trim(),
        section: "reliability",
        priority: rel.grade === "poor" ? 110 : 50,
      });
    }
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, limit);
}
