import { netDistance } from "./court";
import type { SampledFrame, TeamTactics } from "./types";

/** Depth bands used for pair positioning, meters from the net. */
const NET_BAND = 4;
const BACK_BAND = 7.5;

type Depth = "net" | "mid" | "back";
const depthOf = (d: number): Depth => (d < NET_BAND ? "net" : d < BACK_BAND ? "mid" : "back");

/**
 * How each pair positions itself: padel is won by moving as a unit, taking
 * the net together and never leaving one player up and one back ("split").
 */
export function computeTeamTactics(frames: SampledFrame[]): TeamTactics[] {
  const teams: TeamTactics[] = [];
  for (const [team, a, b] of [
    ["A", 0, 1],
    ["B", 2, 3],
  ] as const) {
    let seconds = 0;
    const time = { net: 0, mid: 0, back: 0, split: 0, staggered: 0 };
    let spacing = 0;
    let depthGap = 0;
    let lateralGap = 0;
    let netRushes = 0;
    let wasBothNet = false;

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const pa = f.poses.find((p) => p.playerId === a);
      const pb = f.poses.find((p) => p.playerId === b);
      if (!pa || !pb) continue;
      const nextT = frames[i + 1]?.t ?? f.t;
      const dt = Math.min(Math.max(nextT - f.t, 0), 1) || 0.1;
      seconds += dt;

      const da = netDistance(pa.court);
      const db = netDistance(pb.court);
      const za = depthOf(da);
      const zb = depthOf(db);
      if (za === zb) time[za] += dt;
      else if ((za === "net" && zb === "back") || (za === "back" && zb === "net")) time.split += dt;
      else time.staggered += dt;

      spacing += Math.hypot(pa.court.x - pb.court.x, pa.court.y - pb.court.y) * dt;
      depthGap += Math.abs(da - db) * dt;
      lateralGap += Math.abs(pa.court.x - pb.court.x) * dt;

      const bothNet = za === "net" && zb === "net";
      if (bothNet && !wasBothNet) netRushes++;
      wasBothNet = bothNet;
    }

    const share = (x: number) => (seconds ? x / seconds : 0);
    teams.push({
      team,
      pairedSeconds: seconds,
      togetherNet: share(time.net),
      togetherMid: share(time.mid),
      togetherBack: share(time.back),
      staggered: share(time.staggered),
      split: share(time.split),
      avgSpacing: share(spacing),
      avgDepthGap: share(depthGap),
      avgLateralGap: share(lateralGap),
      netTakings: netRushes,
    });
  }
  return teams.filter((t) => t.pairedSeconds > 0);
}
