import type { PairPattern, PointEnding, PointTag, Rally, Shot } from "./types";

export const PATTERN_LABELS: Record<PairPattern, string> = {
  net: "Together at net",
  mid: "Together mid-court",
  back: "Together at back",
  staggered: "Staggered",
  split: "Split",
};

export const ENDING_LABELS: Record<PointEnding, string> = {
  winner: "Winner",
  forced: "Forced error",
  unforced: "Unforced error",
};

export const teamOf = (id: number): "A" | "B" => (id < 2 ? "A" : "B");

/** Who most likely decided the point: the last shot's hitter. */
export function lastHitter(rally: Rally, shots: Shot[]): number | undefined {
  return shots.filter((s) => s.t >= rally.start && s.t <= rally.end).at(-1)?.playerId;
}

/**
 * Sensible default "by" for a tagged ending: a winner is hit by the winning
 * team, an error is made by the losing team. Prefer the last hitter when they
 * are on the right side.
 */
export function defaultBy(winner: "A" | "B", ending: PointEnding, last: number | undefined): number | undefined {
  const side = ending === "winner" ? winner : winner === "A" ? "B" : "A";
  return last !== undefined && teamOf(last) === side ? last : undefined;
}

export interface WinRate {
  won: number;
  played: number;
}

export interface PointStats {
  tagged: number;
  score: Record<"A" | "B", number>;
  /** Points won by each team, keyed by that team's own positioning in the rally. */
  byPattern: Record<"A" | "B", Partial<Record<PairPattern, WinRate>>>;
  perPlayer: Record<number, Record<PointEnding, number>>;
}

export function pointStats(rallies: Rally[], tags: PointTag[]): PointStats {
  const stats: PointStats = { tagged: 0, score: { A: 0, B: 0 }, byPattern: { A: {}, B: {} }, perPlayer: {} };
  for (const tag of tags) {
    const rally = rallies[tag.rally];
    if (!rally) continue;
    stats.tagged++;
    stats.score[tag.winner]++;
    for (const team of ["A", "B"] as const) {
      const pattern = rally.patterns?.[team];
      if (!pattern) continue;
      const rate = (stats.byPattern[team][pattern] ??= { won: 0, played: 0 });
      rate.played++;
      if (tag.winner === team) rate.won++;
    }
    if (tag.by !== undefined) {
      const p = (stats.perPlayer[tag.by] ??= { winner: 0, forced: 0, unforced: 0 });
      p[tag.ending]++;
    }
  }
  return stats;
}

/**
 * Set (or clear, with null) the tag for one rally. Changing who won or how it
 * ended re-picks the default "by" from the last hitter; an explicit `by` wins.
 */
export function applyTag(
  tags: PointTag[],
  rallies: Rally[],
  shots: Shot[],
  rally: number,
  patch: Partial<Omit<PointTag, "rally">> | null,
): PointTag[] {
  const rest = tags.filter((t) => t.rally !== rally);
  if (!patch) return rest;
  const prev = tags.find((t) => t.rally === rally);
  const winner = patch.winner ?? prev?.winner ?? "A";
  const ending = patch.ending ?? prev?.ending ?? "winner";
  const by =
    "by" in patch
      ? patch.by
      : prev && !patch.winner && !patch.ending
        ? prev.by
        : defaultBy(winner, ending, lastHitter(rallies[rally], shots));
  return [...rest, { rally, winner, ending, by }].sort((a, b) => a.rally - b.rally);
}

/**
 * Win rate for ranking, pulled toward 50% when there are few points behind it
 * (Laplace smoothing), so 0 of 2 doesn't outrank 2 of 12 as "the worst".
 */
export const rankRate = (w: WinRate) => (w.won + 1) / (w.played + 2);
