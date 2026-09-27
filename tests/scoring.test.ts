import { describe, expect, it } from "vitest";
import { scoreMatch } from "../src/analysis/scoring";
import type { PointTag, Rally, Shot } from "../src/analysis/types";

/** n rallies, 10 s apart; the first rally of each listed game carries a serve by `servers[game]`. */
function build(winners: ("A" | "B")[], serveEvery?: number[]) {
  const rallies: Rally[] = winners.map((_, i) => ({ start: i * 10, end: i * 10 + 5, shots: 3 }));
  const shots: Shot[] = [];
  (serveEvery ?? []).forEach((id, i) => {
    shots.push({ t: i * 10 + 0.5, playerId: id, type: "serve", swingSpeed: 9, court: { x: 5, y: 19 }, zone: "baseline" });
  });
  const tags: PointTag[] = winners.map((w, i) => ({ rally: i, winner: w, ending: "winner" }));
  return { rallies, shots, tags };
}

const rep = (t: "A" | "B", n: number) => Array<"A" | "B">(n).fill(t);

describe("scoreMatch", () => {
  it("counts a love game and shows points mid-game", () => {
    const { rallies, shots, tags } = build([...rep("A", 4), "B", "B", "A"]);
    const s = scoreMatch(rallies, shots, tags);
    expect(s.sets[0]).toEqual({ A: 1, B: 0 });
    expect(s.points).toEqual({ A: "15", B: "30" });
  });

  it("plays advantage at deuce, or sudden death with the golden point", () => {
    const deuce = [...rep("A", 3), ...rep("B", 3), "A"] as ("A" | "B")[];
    const adv = build(deuce);
    const s1 = scoreMatch(adv.rallies, adv.shots, adv.tags, false);
    expect(s1.sets[0]).toEqual({ A: 0, B: 0 });
    expect(s1.points).toEqual({ A: "Ad", B: "40" });
    const s2 = scoreMatch(adv.rallies, adv.shots, adv.tags, true);
    expect(s2.sets[0]).toEqual({ A: 1, B: 0 });
  });

  it("goes to a tiebreak at 6-6 and starts a new set after it", () => {
    const winners: ("A" | "B")[] = [];
    for (let g = 0; g < 12; g++) winners.push(...rep(g % 2 === 0 ? "A" : "B", 4));
    winners.push(...rep("A", 7));
    winners.push(...rep("B", 4));
    const { rallies, shots, tags } = build(winners);
    const s = scoreMatch(rallies, shots, tags);
    expect(s.sets[0]).toEqual({ A: 7, B: 6, tiebreak: { A: 7, B: 0 } });
    expect(s.sets[1]).toEqual({ A: 0, B: 1 });
    expect(s.setInProgress).toBe(true);
  });

  it("marks the last set finished when no new set has started", () => {
    const { rallies, shots, tags } = build(rep("A", 24));
    const s = scoreMatch(rallies, shots, tags);
    expect(s.sets).toEqual([{ A: 6, B: 0 }]);
    expect(s.setInProgress).toBe(false);
  });

  it("uses detected serves to count break points and holds", () => {
    // Game 1: B serves (player 2), A breaks to love. Game 2: A serves and holds.
    const serves = [2, 2, 2, 2, 0, 0, 0, 0];
    const { rallies, shots, tags } = build([...rep("A", 4), ...rep("A", 4)], serves);
    const s = scoreMatch(rallies, shots, tags);
    expect(s.breakPoints.A).toEqual({ won: 1, chances: 1 });
    expect(s.holds.B).toEqual({ won: 0, played: 1 });
    expect(s.holds.A).toEqual({ won: 1, played: 1 });
  });

  it("infers the next server by alternation when no serve is detected", () => {
    const serves = [2, 2, 2, 2];
    const { rallies, shots, tags } = build([...rep("B", 4), ...rep("B", 4)], serves);
    const s = scoreMatch(rallies, shots, tags);
    expect(s.games.map((g) => g.server)).toEqual(["B", "A"]);
    expect(s.breakPoints.B).toEqual({ won: 1, chances: 1 });
  });
});
