import { COURT_LENGTH, COURT_WIDTH, NET_Y, zoneOf } from "./court";
import { groupRallies, markServes } from "./shots";
import { computePlayerStats } from "./stats";
import { computeTeamTactics } from "./tactics";
import type { AnalysisResult, Point, SampledFrame, Shot, ShotType } from "./types";

/** Small deterministic PRNG so the demo looks the same every time. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FPS = 10;

/**
 * A simulated doubles match (sample data, no video). Team A (near) is the
 * user's pair and has a realistic habit to fix: the partner often stays back
 * while the user goes to the net, leaving the pair split.
 */
export function demoResult(minutes = 4, seed = 7): AnalysisResult {
  const rnd = mulberry32(seed);
  const duration = minutes * 60;
  // Near team: y > NET_Y. Depth = meters from the net.
  const side = (id: number) => (id < 2 ? 1 : -1);
  const laneX = (id: number) => (id % 2 === 0 ? COURT_WIDTH * 0.28 : COURT_WIDTH * 0.72);
  const pos: Point[] = [0, 1, 2, 3].map((id) => ({ x: laneX(id), y: NET_Y + side(id) * 9 }));
  const depthTarget = [9, 9, 9, 9];
  const frames: SampledFrame[] = [];
  const shots: Shot[] = [];

  let t = 0;
  let nextShot = 3;
  let rallyLeft = 0;
  let hitterTeam = 0;
  let pointBreakUntil = 0;

  const courtY = (id: number, depth: number) => NET_Y + side(id) * depth;

  while (t < duration) {
    // Rally flow: serve, then alternate sides until the point ends.
    if (t >= nextShot && t >= pointBreakUntil) {
      if (rallyLeft === 0) {
        rallyLeft = 3 + Math.floor(rnd() * 10);
        hitterTeam = rnd() < 0.5 ? 0 : 1;
      }
      const team = [hitterTeam * 2, hitterTeam * 2 + 1];
      const hitter = team[rnd() < 0.5 ? 0 : 1];
      const zone = zoneOf(pos[hitter]);
      const lobbedLast = shots.length > 0 && shots[shots.length - 1].lob;
      let type: ShotType;
      if (lobbedLast && rnd() < 0.6) type = "overhead";
      else if (zone === "net") type = rnd() < 0.6 ? "forehand-volley" : "backhand-volley";
      else type = rnd() < 0.62 ? "forehand" : "backhand";
      const lob = type !== "overhead" && zone !== "net" && rnd() < 0.18;
      shots.push({
        t,
        playerId: hitter,
        type,
        swingSpeed: 8 + rnd() * 10 + (type === "overhead" ? 4 : 0),
        court: { ...pos[hitter] },
        zone,
        confirmed: rnd() < 0.7,
        ...(lob ? { lob: true } : {}),
      });

      // Positioning response, the padel way: a lob lets the lobbing pair
      // take the net and pushes the other pair back; otherwise pairs creep
      // forward when they can. Team A's partner (id 1) has a habit of
      // staying back while the user goes up, which leaves the pair split.
      for (const id of team) {
        const goesUp = lob || zone === "net" || rnd() < (id === 0 ? 0.7 : 0.45);
        const hangsBack = id === 1 && rnd() < 0.6;
        if (goesUp && !hangsBack) depthTarget[id] = 2.5 + rnd() * 1.5;
        else if (hangsBack) depthTarget[id] = 8.5 + rnd();
      }
      if (lob) for (const id of [0, 1, 2, 3].filter((x) => !team.includes(x))) depthTarget[id] = 9 + rnd() * 0.5;

      rallyLeft--;
      hitterTeam = 1 - hitterTeam;
      nextShot = t + 1.1 + rnd() * 0.8;
      if (rallyLeft === 0) {
        pointBreakUntil = t + 6 + rnd() * 6;
        nextShot = pointBreakUntil;
        depthTarget.fill(9);
      }
    }

    // Move everyone toward their target at up to 4 m/s, with a little drift.
    frames.push({
      t,
      poses: [0, 1, 2, 3].map((id) => {
        const target = { x: laneX(id) + Math.sin(t * 0.7 + id) * 1.2, y: courtY(id, depthTarget[id]) };
        const dx = target.x - pos[id].x;
        const dy = target.y - pos[id].y;
        const dist = Math.hypot(dx, dy);
        const step = Math.min(dist, 4 / FPS);
        if (dist > 1e-6) {
          pos[id] = { x: pos[id].x + (dx / dist) * step, y: pos[id].y + (dy / dist) * step };
        }
        pos[id] = {
          x: Math.min(COURT_WIDTH, Math.max(0, pos[id].x)),
          y: Math.min(COURT_LENGTH, Math.max(0, pos[id].y)),
        };
        return { playerId: id, landmarks: [], court: { ...pos[id] } };
      }),
    });
    t += 1 / FPS;
  }

  const rallies = groupRallies(shots);
  const finalShots = markServes(shots, rallies);
  const hands = new Map<number, "left" | "right">([
    [0, "right"],
    [1, "right"],
    [2, "left"],
    [3, "right"],
  ]);
  return {
    duration,
    sampleFps: FPS,
    frames,
    shots: finalShots,
    rallies,
    players: computePlayerStats(frames, finalShots, hands),
    teams: computeTeamTactics(frames),
    calibrated: true,
    ball: { track: [], events: [] },
  };
}
