import { useMemo } from "react";
import { ENDING_LABELS, PATTERN_LABELS, defaultBy, lastHitter, pointStats, teamOf, type WinRate } from "../analysis/points";
import { PLAYER_COLORS } from "../analysis/tracker";
import type { PairPattern, PointEnding, PointTag, Rally, Shot } from "../analysis/types";
import { fmtTime, pct } from "../lib/format";
import { usePlayers } from "../lib/players";
import type { Playlist } from "./MatchPlayer";

interface Props {
  rallies: Rally[];
  shots: Shot[];
  tags: PointTag[];
  onChange: (tags: PointTag[]) => void;
  onPlay: ((p: Playlist) => void) | null;
}

const PATTERN_ORDER: PairPattern[] = ["net", "mid", "staggered", "back", "split"];
const ENDINGS = Object.keys(ENDING_LABELS) as PointEnding[];

/** One sentence connecting positioning to results, for the team with the most data. */
export function positioningInsight(team: string, rates: Partial<Record<PairPattern, WinRate>>): string | null {
  const entries = PATTERN_ORDER.map((p) => [p, rates[p]] as const).filter(
    (e): e is readonly [PairPattern, WinRate] => !!e[1] && e[1].played >= 2,
  );
  if (entries.length < 2) return null;
  const rate = (w: WinRate) => w.won / w.played;
  const best = entries.reduce((a, b) => (rate(b[1]) > rate(a[1]) ? b : a));
  const worst = entries.reduce((a, b) => (rate(b[1]) < rate(a[1]) ? b : a));
  if (rate(best[1]) - rate(worst[1]) < 0.15) return null;
  return `${team} wins ${pct(rate(best[1]))} of points when ${PATTERN_LABELS[best[0]].toLowerCase()}, but ${pct(
    rate(worst[1]),
  )} when ${PATTERN_LABELS[worst[0]].toLowerCase()}.`;
}

export function PointsPanel({ rallies, shots, tags, onChange, onPlay }: Props) {
  const { name, me } = usePlayers();
  const stats = useMemo(() => pointStats(rallies, tags), [rallies, tags]);
  const byRally = useMemo(() => new Map(tags.map((t) => [t.rally, t])), [tags]);
  const teamName = (t: "A" | "B") => (t === "A" ? `${name(0)} & ${name(1)}` : `${name(2)} & ${name(3)}`);
  const myTeam = me === null ? "A" : teamOf(me);
  const teams: ("A" | "B")[] = myTeam === "A" ? ["A", "B"] : ["B", "A"];

  const setTag = (rally: number, patch: Partial<PointTag> | null) => {
    const rest = tags.filter((t) => t.rally !== rally);
    if (!patch) return onChange(rest);
    const prev = byRally.get(rally);
    const winner = patch.winner ?? prev?.winner ?? "A";
    const ending = patch.ending ?? prev?.ending ?? "winner";
    const last = lastHitter(rallies[rally], shots);
    const by = "by" in patch ? patch.by : prev && !patch.winner && !patch.ending ? prev.by : defaultBy(winner, ending, last);
    onChange([...rest, { rally, winner, ending, by }].sort((a, b) => a.rally - b.rally));
  };

  if (!rallies.length) {
    return <p className="muted">No rallies were detected, so there are no points to review.</p>;
  }

  return (
    <div className="points">
      <div className="score-line">
        {teams.map((t, i) => (
          <span key={t} className="score-team">
            {i === 1 && <span className="score-sep">–</span>}
            <span className="muted small">{teamName(t)}</span>
            <b>{stats.score[t]}</b>
          </span>
        ))}
        <span className="muted small score-progress">
          {stats.tagged} of {rallies.length} points tagged
        </span>
      </div>

      {stats.tagged === 0 ? (
        <p className="hint">
          Tag who won each rally below. After a few points you'll see which positions win you points and which lose them.
        </p>
      ) : (
        <div className="winrates">
          {teams.map((t) => {
            const insight = positioningInsight(t === myTeam && me !== null ? "Your pair" : `Team ${t}`, stats.byPattern[t]);
            const rows = PATTERN_ORDER.filter((p) => stats.byPattern[t][p]);
            return (
              <section key={t}>
                <h3>
                  Points won by positioning · <span className="muted">{teamName(t)}</span>
                </h3>
                {insight && <p className="insight-line">{insight}</p>}
                {rows.length === 0 ? (
                  <p className="muted small">No positioning data for tagged points.</p>
                ) : (
                  <ul className="winrate-list">
                    {rows.map((p) => {
                      const w = stats.byPattern[t][p]!;
                      return (
                        <li key={p}>
                          <span className="wr-label">{PATTERN_LABELS[p]}</span>
                          <span className="wr-bar" aria-hidden>
                            <span style={{ width: `${(w.won / w.played) * 100}%` }} />
                          </span>
                          <span className="wr-value">
                            {pct(w.won / w.played)} <span className="muted small">({w.won}/{w.played})</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
          <section>
            <h3>How points ended</h3>
            <table className="endings">
              <thead>
                <tr>
                  <th scope="col">Player</th>
                  {ENDINGS.map((e) => (
                    <th key={e} scope="col">
                      {ENDING_LABELS[e]}s
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3].map((id) => {
                  const p = stats.perPlayer[id];
                  return (
                    <tr key={id}>
                      <th scope="row" style={{ color: PLAYER_COLORS[id] }}>
                        {name(id)}
                      </th>
                      {ENDINGS.map((e) => (
                        <td key={e}>{p?.[e] ?? 0}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>
      )}

      <ol className="rally-review">
        {rallies.map((r, i) => {
          const tag = byRally.get(i);
          return (
            <li key={i} className={tag ? "tagged" : ""}>
              <div className="rr-head">
                <button
                  className="time-link"
                  disabled={!onPlay}
                  onClick={() => onPlay?.({ title: `Point ${i + 1}`, clips: [{ start: r.start, end: r.end + 1, label: `${r.shots} shots` }] })}
                >
                  ▶ {fmtTime(r.start)}
                </button>
                <span className="small">
                  Point {i + 1} · {r.shots} shots
                </span>
                {r.patterns?.A && <span className="tag">A: {PATTERN_LABELS[r.patterns.A].toLowerCase()}</span>}
                {r.patterns?.B && <span className="tag">B: {PATTERN_LABELS[r.patterns.B].toLowerCase()}</span>}
              </div>
              <div className="rr-controls" role="group" aria-label={`Who won point ${i + 1}`}>
                {(["A", "B"] as const).map((t) => (
                  <button
                    key={t}
                    className={tag?.winner === t ? "chip on" : "chip"}
                    aria-pressed={tag?.winner === t}
                    onClick={() => setTag(i, { winner: t })}
                  >
                    {teamName(t)} won
                  </button>
                ))}
                {tag && (
                  <>
                    <select
                      id={`ending-${i}`}
                      aria-label="How it ended"
                      value={tag.ending}
                      onChange={(e) => setTag(i, { ending: e.target.value as PointEnding })}
                    >
                      {ENDINGS.map((e) => (
                        <option key={e} value={e}>
                          {ENDING_LABELS[e]}
                        </option>
                      ))}
                    </select>
                    <select
                      id={`by-${i}`}
                      aria-label="By whom"
                      value={tag.by ?? ""}
                      onChange={(e) => setTag(i, { by: e.target.value === "" ? undefined : Number(e.target.value) })}
                    >
                      <option value="">by…</option>
                      {[0, 1, 2, 3].map((id) => (
                        <option key={id} value={id}>
                          by {name(id)}
                        </option>
                      ))}
                    </select>
                    <button className="link small" onClick={() => setTag(i, null)}>
                      Clear
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
