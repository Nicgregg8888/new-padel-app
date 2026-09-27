import { describe, expect, it } from "vitest";
import { demoPointTags, demoResult } from "../src/analysis/demo";
import { evaluateGoal } from "../src/analysis/goals";
import { matchWinner, summarizePeople } from "../src/analysis/people";

const result = demoResult(2);
const points = demoPointTags(result);

describe("goals", () => {
  it("needs to know who you are", () => {
    expect(evaluateGoal({ result, me: null }, { metric: "split", target: 15 }).met).toBeNull();
  });

  it("checks positioning goals in both directions", () => {
    const split = result.teams.find((t) => t.team === "A")!.split * 100;
    expect(evaluateGoal({ result, me: 0 }, { metric: "split", target: split + 1 }).met).toBe(true);
    expect(evaluateGoal({ result, me: 0 }, { metric: "split", target: split - 1 }).met).toBe(false);
    expect(evaluateGoal({ result, me: 0 }, { metric: "netTogether", target: 0 }).met).toBe(true);
  });

  it("only checks point goals once points are tagged", () => {
    expect(evaluateGoal({ result, me: 0 }, { metric: "unforced", target: 5 }).value).toBeNull();
    const r = evaluateGoal({ result, me: 0, points }, { metric: "unforced", target: 100 });
    expect(r.met).toBe(true);
  });
});

describe("people", () => {
  const base = { result, createdAt: 0, points };
  const winner = matchWinner({ ...base, id: "x", names: {}, me: 0 });

  it("decides a winner from tagged points", () => {
    expect(winner === "A" || winner === "B").toBe(true);
    expect(matchWinner({ ...base, id: "x", names: {}, me: 0, points: [] })).toBeNull();
  });

  it("builds partner and rival records from names", () => {
    const s = summarizePeople([
      { ...base, id: "1", names: { 0: "Nic", 1: "Sam", 2: "Ana", 3: "Leo" }, me: 0 },
      { ...base, id: "2", names: { 0: "Nic", 1: " sam ", 2: "Ana" }, me: 0 },
      { ...base, id: "3", names: { 2: "Nic", 3: "Sam", 0: "Ana" }, me: 2 },
      { ...base, id: "4", names: { 0: "Nic", 1: "Sam" }, me: 0, demo: true },
    ]);
    expect(s.me.matches).toBe(3);
    expect(s.partners[0]).toMatchObject({ name: "Sam", matches: 3 });
    expect(s.rivals.find((r) => r.name === "Ana")?.matches).toBe(3);
    expect(s.rivals.find((r) => r.name === "Leo")?.matches).toBe(1);
    expect(s.me.won + s.me.lost).toBe(3);
  });
});
