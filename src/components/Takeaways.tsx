import { useMemo } from "react";
import type { Goal } from "../analysis/goals";
import { takeaways, type Takeaway } from "../analysis/takeaways";
import type { MatchRecord } from "../lib/match";
import { usePlayers } from "../lib/players";

/** Jump to a results section; opens the reliability details if that's the target. */
export function goTo(section: string) {
  const el = document.getElementById(`sec-${section}`);
  if (!el) return;
  if (el instanceof HTMLDetailsElement) el.open = true;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function Takeaways({ match, goals }: { match: MatchRecord; goals: Goal[] }) {
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
      <h2>Key takeaways</h2>
      <ol>
        {items.map((t: Takeaway) => (
          <li key={t.title} className={`takeaway ${t.tone}`}>
            <button className="takeaway-btn" onClick={() => goTo(t.section)}>
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

const SECTIONS: [string, string, boolean][] = [
  ["video", "Video", true],
  ["court", "Court", false],
  ["players", "Players", false],
  ["pair", "Pair play", false],
  ["points", "Points", false],
  ["goals", "Goals", false],
  ["highlights", "Highlights", false],
  ["coach", "AI coach", false],
];

export function SectionNav({ hasVideo }: { hasVideo: boolean }) {
  return (
    <nav className="section-nav" aria-label="Results sections">
      {SECTIONS.filter(([, , needsVideo]) => hasVideo || !needsVideo).map(([id, label]) => (
        <button key={id} className="chip" onClick={() => goTo(id)}>
          {label}
        </button>
      ))}
    </nav>
  );
}
