import { useMemo } from "react";
import type { Goal } from "../analysis/goals";
import { takeaways, type Takeaway } from "../analysis/takeaways";
import type { MatchRecord } from "../lib/match";
import { usePlayers } from "../lib/players";

export function Takeaways({ match, goals, onGo }: { match: MatchRecord; goals: Goal[]; onGo: (section: Takeaway["section"]) => void }) {
  const { name } = usePlayers();
  const items = useMemo(
    () =>
      takeaways({
        result: match.result,
        me: match.me,
        name,
        points: match.points,
        goldenPoint: match.goldenPoint,
        goals,
        demo: match.demo,
      }),
    [match, goals, name],
  );
  if (!items.length) return null;
  return (
    <section className="takeaways" aria-label="Key takeaways">
      <h2>What stood out</h2>
      <ol>
        {items.map((t: Takeaway) => (
          <li key={t.title} className={`takeaway ${t.tone}`}>
            <button className="takeaway-btn" onClick={() => onGo(t.section)}>
              <b>{t.title}</b>
              <span>{t.detail}</span>
              <span className="takeaway-link" aria-hidden>
                See details →
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
