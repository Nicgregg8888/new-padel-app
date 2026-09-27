import { teamOf } from "./points";
import type { PointTag, Rally, Shot } from "./types";

type Team = "A" | "B";
const other = (t: Team): Team => (t === "A" ? "B" : "A");

export interface GameRecord {
  winner: Team;
  server: Team | null;
  tiebreak: boolean;
}

export interface SetScore {
  A: number;
  B: number;
  /** Tiebreak points, when the set went to one. */
  tiebreak?: { A: number; B: number };
}

export interface MatchScore {
  sets: SetScore[];
  /** The game in progress: points as shown on a scoreboard. */
  points: { A: string; B: string };
  inTiebreak: boolean;
  /** False when the last entry in `sets` is already finished. */
  setInProgress: boolean;
  server: Team | null;
  games: GameRecord[];
  /** Break points: chances each team had while receiving, and how many it won. */
  breakPoints: Record<Team, { won: number; chances: number }>;
  /** Games won while serving / receiving. */
  holds: Record<Team, { won: number; played: number }>;
  pointsCounted: number;
}

const LABELS = ["0", "15", "30", "40"];

function gameLabel(mine: number, theirs: number, golden: boolean): string {
  if (mine <= 3 && theirs <= 3) return LABELS[mine];
  if (golden) return "40";
  if (mine === theirs) return "40";
  return mine > theirs ? "Ad" : "40";
}

/** Has `w` just won the game with these points? */
function winsGame(pts: Record<Team, number>, w: Team, golden: boolean, tiebreak: boolean): boolean {
  const l = other(w);
  if (tiebreak) return pts[w] >= 7 && pts[w] - pts[l] >= 2;
  // Golden point: at 40-40 the next point decides the game.
  if (golden) return pts[w] >= 4 && pts[w] > pts[l];
  return pts[w] >= 4 && pts[w] - pts[l] >= 2;
}

/** Who served a rally, from the detected serve (first shot of the rally). */
export function rallyServer(rally: Rally, shots: Shot[]): Team | null {
  const serve = shots.find((s) => s.type === "serve" && s.t >= rally.start && s.t <= rally.end);
  return serve ? teamOf(serve.playerId) : null;
}

/**
 * Replay tagged points through padel scoring: games to 4 points (win by 2, or
 * sudden death at 40-40 with the golden point), sets to 6 (win by 2), a
 * tiebreak to 7 at 6-6. Serve alternates every game; a detected serve fixes it
 * whenever we have one. Scoring starts at 0-0 at the first tagged point.
 */
export function scoreMatch(rallies: Rally[], shots: Shot[], tags: PointTag[], golden = false): MatchScore {
  const sets: SetScore[] = [{ A: 0, B: 0 }];
  const games: GameRecord[] = [];
  const breakPoints = { A: { won: 0, chances: 0 }, B: { won: 0, chances: 0 } };
  const holds = { A: { won: 0, played: 0 }, B: { won: 0, played: 0 } };
  let pts = { A: 0, B: 0 };
  let tiebreak = false;
  let server: Team | null = null;
  let gameServer: Team | null = null;
  let firstPointOfGame = true;
  let counted = 0;

  for (const tag of [...tags].sort((a, b) => a.rally - b.rally)) {
    const rally = rallies[tag.rally];
    if (!rally) continue;
    counted++;
    const detected = rallyServer(rally, shots);
    if (firstPointOfGame) {
      gameServer = detected ?? (server ? server : null);
      firstPointOfGame = false;
    } else if (!gameServer && detected) {
      gameServer = detected;
    }

    // Break point: the receiver is one point from taking the server's game.
    if (!tiebreak && gameServer) {
      const recv = other(gameServer);
      if (winsGame({ ...pts, [recv]: pts[recv] + 1 }, recv, golden, false)) {
        breakPoints[recv].chances++;
        if (tag.winner === recv) breakPoints[recv].won++;
      }
    }

    pts = { ...pts, [tag.winner]: pts[tag.winner] + 1 };
    const w = tag.winner;
    const l = other(w);
    const set = sets[sets.length - 1];

    if (!winsGame(pts, w, golden, tiebreak)) continue;

    games.push({ winner: w, server: gameServer, tiebreak });
    if (gameServer && !tiebreak) {
      holds[gameServer].played++;
      if (w === gameServer) holds[gameServer].won++;
    }
    if (tiebreak) set.tiebreak = { A: pts.A, B: pts.B };
    set[w]++;
    server = gameServer ? other(gameServer) : null;
    gameServer = null;
    firstPointOfGame = true;
    pts = { A: 0, B: 0 };

    const setOver = tiebreak || (set[w] >= 6 && set[w] - set[l] >= 2);
    tiebreak = false;
    if (setOver) sets.push({ A: 0, B: 0 });
    else if (set.A === 6 && set.B === 6) tiebreak = true;
  }

  const golden40 = golden && !tiebreak;
  // Don't show an empty set that hasn't started after a finished one.
  const lastEmpty = sets.length > 1 && sets[sets.length - 1].A + sets[sets.length - 1].B === 0 && pts.A + pts.B === 0;
  return {
    sets: lastEmpty ? sets.slice(0, -1) : sets,
    setInProgress: !lastEmpty,
    points: tiebreak
      ? { A: String(pts.A), B: String(pts.B) }
      : { A: gameLabel(pts.A, pts.B, golden40), B: gameLabel(pts.B, pts.A, golden40) },
    inTiebreak: tiebreak,
    server: firstPointOfGame ? server : gameServer,
    games,
    breakPoints,
    holds,
    pointsCounted: counted,
  };
}
