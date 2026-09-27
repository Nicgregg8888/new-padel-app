import { useEffect, useState } from "react";
import { compareWithUsual, formatDelta, formatValue, type Comparison } from "../analysis/compare";
import { listMatches } from "../lib/history";
import type { MatchRecord } from "../lib/match";

/** This match next to your recent average, so a good or bad day stands out. */
export function VsUsual({ match }: { match: MatchRecord }) {
  const [history, setHistory] = useState<MatchRecord[] | null>(null);
  useEffect(() => {
    let live = true;
    listMatches().then((all) => live && setHistory(all));
    return () => {
      live = false;
    };
  }, [match.id]);

  if (!history || match.demo || match.me === null) return null;
  const rows: Comparison[] = compareWithUsual(match, history);
  if (!rows.length) return null;
  const basis = Math.max(...rows.map((r) => r.basis));
  return (
    <section className="vs-usual" aria-label="Compared with your recent matches">
      <h2>
        Compared to your last {basis} match{basis === 1 ? "" : "es"}
      </h2>
      <ul>
        {rows.map((r) => (
          <li key={r.key}>
            <span className="vs-label">{r.label}</span>
            <b className="vs-value">{formatValue(r, r.current)}</b>
            <span className={`vs-delta ${r.better === null ? "same" : r.better ? "up" : "down"}`}>
              {r.better === null ? "about usual" : formatDelta(r)}
              <span className="sr-only">{r.better === null ? "" : r.better ? " (better)" : " (worse)"}</span>
            </span>
            <span className="muted small">usually {formatValue(r, r.usual)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
