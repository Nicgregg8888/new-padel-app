import { teamOf } from "./points";
import { scoreMatch } from "./scoring";
import type { AnalysisResult, PointTag } from "./types";

interface MatchLike {
  id: string;
  createdAt: number;
  result: AnalysisResult;
  names: Record<number, string>;
  me: number | null;
  points?: PointTag[];
  goldenPoint?: boolean;
  demo?: boolean;
}

/** Who won, judged from tagged points: sets, then games, then points. Null if nothing was tagged or it's level. */
export function matchWinner(m: MatchLike): "A" | "B" | null {
  const tags = m.points ?? [];
  if (!tags.length) return null;
  const s = scoreMatch(m.result.rallies, m.result.shots, tags, !!m.goldenPoint);
  const done = s.sets.filter((x) => (x.A >= 6 || x.B >= 6) && Math.abs(x.A - x.B) >= 1 && (Math.abs(x.A - x.B) >= 2 || x.tiebreak));
  const setsA = done.filter((x) => x.A > x.B).length;
  const setsB = done.length - setsA;
  if (setsA !== setsB) return setsA > setsB ? "A" : "B";
  const gamesA = s.games.filter((g) => g.winner === "A").length;
  const gamesB = s.games.length - gamesA;
  if (gamesA !== gamesB) return gamesA > gamesB ? "A" : "B";
  const ptsA = tags.filter((t) => t.winner === "A").length;
  const ptsB = tags.length - ptsA;
  if (ptsA !== ptsB) return ptsA > ptsB ? "A" : "B";
  return null;
}

export interface Record3 {
  matches: number;
  won: number;
  lost: number;
}

export interface PersonProfile extends Record3 {
  name: string;
}

export interface PeopleSummary {
  me: Record3;
  partners: PersonProfile[];
  rivals: PersonProfile[];
}

const key = (n: string) => n.trim().toLowerCase();

/** Partners and rivals across saved matches, matched by the names the user typed. */
export function summarizePeople(matches: MatchLike[]): PeopleSummary {
  const me: Record3 = { matches: 0, won: 0, lost: 0 };
  const partners = new Map<string, PersonProfile>();
  const rivals = new Map<string, PersonProfile>();
  for (const m of matches) {
    if (m.demo || m.me === null) continue;
    const myTeam = teamOf(m.me);
    const winner = matchWinner(m);
    const bump = (r: Record3) => {
      r.matches++;
      if (winner === myTeam) r.won++;
      else if (winner) r.lost++;
    };
    bump(me);
    for (const id of [0, 1, 2, 3]) {
      if (id === m.me) continue;
      const name = m.names[id]?.trim();
      if (!name) continue;
      const map = teamOf(id) === myTeam ? partners : rivals;
      const p = map.get(key(name)) ?? { name, matches: 0, won: 0, lost: 0 };
      bump(p);
      map.set(key(name), p);
    }
  }
  const sort = (xs: PersonProfile[]) => xs.sort((a, b) => b.matches - a.matches || b.won - a.won);
  return { me, partners: sort([...partners.values()]), rivals: sort([...rivals.values()]) };
}
