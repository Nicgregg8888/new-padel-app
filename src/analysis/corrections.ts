import { recountShots, computePlayerStats } from "./stats";
import { computeTeamTactics, rallyPatterns } from "./tactics";
import type { AnalysisResult, Shot } from "./types";

export type ShotPatch = Partial<Pick<Shot, "type" | "playerId">>;

const sameShot = (a: Shot, b: Shot) => a.t === b.t && a.playerId === b.playerId && a.type === b.type;

/** Relabel (patch) or delete (null) one shot. Rallies stay as detected so point tags keep their meaning. */
export function editShot(result: AnalysisResult, target: Shot, patch: ShotPatch | null): AnalysisResult {
  const shots = result.shots.flatMap((s) => {
    if (!sameShot(s, target)) return [s];
    if (!patch) return [];
    return [{ ...s, ...patch, edited: true }];
  });
  return { ...result, shots, players: recountShots(result.players, shots) };
}

/**
 * Tracking sometimes swaps two players (they cross, or one is hidden). Swap
 * their identities from `fromT` onward and recompute everything that depends
 * on who is who. Needs the per-frame data, so only while the video is loaded.
 */
export function swapPlayers(result: AnalysisResult, a: number, b: number, fromT: number): AnalysisResult {
  const swap = (id: number) => (id === a ? b : id === b ? a : id);
  const frames = result.frames.map((f) =>
    f.t < fromT ? f : { ...f, poses: f.poses.map((p) => ({ ...p, playerId: swap(p.playerId) })) },
  );
  const shots = result.shots.map((s) => (s.t < fromT ? s : { ...s, playerId: swap(s.playerId) }));
  const hands = new Map(result.players.map((p) => [p.playerId, p.dominantHand] as const));
  return {
    ...result,
    frames,
    shots,
    players: computePlayerStats(frames, shots, hands),
    teams: computeTeamTactics(frames),
    rallies: rallyPatterns(frames, result.rallies),
  };
}
