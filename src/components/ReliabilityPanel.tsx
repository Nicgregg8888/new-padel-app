import { useMemo } from "react";
import { assessReliability, type Grade } from "../analysis/reliability";
import { PLAYER_COLORS } from "../analysis/tracker";
import type { AnalysisResult } from "../analysis/types";
import { pct } from "../lib/format";
import { usePlayers } from "../lib/players";
import { FilmingGuide } from "./FilmingGuide";

const GRADE_TEXT: Record<Grade, string> = {
  good: "Reliable",
  fair: "Partly reliable",
  poor: "Low reliability",
};

/** How much to trust these numbers, with concrete tips for the next recording. */
export function ReliabilityPanel({ result }: { result: AnalysisResult }) {
  const { name } = usePlayers();
  const rel = useMemo(() => assessReliability(result), [result]);
  return (
    <details id="sec-reliability" className={`reliability ${rel.grade}`}>
      <summary>
        <span className="grade-dot" aria-hidden />
        <b>{GRADE_TEXT[rel.grade]}</b>
        <span className="muted small">
          Players tracked {rel.coverage.map((c) => `${name(c.playerId)} ${pct(c.share)}`).join(" · ")}
          {rel.ballCoverage !== null && ` · ball followed ${pct(rel.ballCoverage)} of the time`}
        </span>
      </summary>
      <div className="reliability-body">
        <ul className="coverage">
          {rel.coverage.map((c) => (
            <li key={c.playerId}>
              <span style={{ color: PLAYER_COLORS[c.playerId] }}>{name(c.playerId)}</span>
              <span className="cov-bar" aria-hidden>
                <span style={{ width: `${c.share * 100}%`, background: PLAYER_COLORS[c.playerId] }} />
              </span>
              <span className="cov-val">{pct(c.share)}</span>
            </li>
          ))}
        </ul>
        {rel.confirmedShare !== null && (
          <p className="small muted">{pct(rel.confirmedShare)} of detected swings were confirmed by the ball.</p>
        )}
        {rel.tips.length ? (
          <>
            <h3>To get better results next time</h3>
            <ul className="tips">
              {rel.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <FilmingGuide />
          </>
        ) : (
          <p className="small">No problems spotted with this recording.</p>
        )}
      </div>
    </details>
  );
}
