import { useEffect, useState } from "react";
import { describeGoal, evaluateGoal, formatGoalValue, type Goal } from "../analysis/goals";
import { matchWinner, summarizePeople, type PersonProfile } from "../analysis/people";
import { teamOf } from "../analysis/points";
import { analysedSeconds } from "../analysis/reliability";
import { fmtTime, pct } from "../lib/format";
import { deleteMatch, listMatches } from "../lib/history";
import { playerName, type MatchRecord } from "../lib/match";

interface Props {
  goals: Goal[];
  onOpen: (m: MatchRecord) => void;
  onNew: () => void;
}

interface Metric {
  key: string;
  label: string;
  format: (v: number) => string;
  value: (m: MatchRecord) => number | null;
}

const minutes = (m: MatchRecord) => analysedSeconds(m.result) / 60;
const meStats = (m: MatchRecord) => m.result.players.find((p) => p.playerId === m.me) ?? null;
const myTeam = (m: MatchRecord) =>
  m.me === null ? null : (m.result.teams ?? []).find((t) => t.team === (m.me! < 2 ? "A" : "B")) ?? null;

const METRICS: Metric[] = [
  { key: "net", label: "Time at the net", format: pct, value: (m) => meStats(m)?.zoneShare.net ?? null },
  {
    key: "together",
    label: "Pair together at net",
    format: pct,
    value: (m) => myTeam(m)?.togetherNet ?? null,
  },
  { key: "split", label: "Pair split (lower is better)", format: pct, value: (m) => myTeam(m)?.split ?? null },
  {
    key: "shots",
    label: "Shots per minute",
    format: (v) => v.toFixed(1),
    value: (m) => {
      const s = meStats(m);
      return s ? s.totalShots / minutes(m) : null;
    },
  },
  {
    key: "distance",
    label: "Meters per minute",
    format: (v) => v.toFixed(0),
    value: (m) => {
      const s = meStats(m);
      return s ? s.distanceMeters / minutes(m) : null;
    },
  },
];

export function HistoryView({ goals, onOpen, onNew }: Props) {
  const [matches, setMatches] = useState<MatchRecord[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    listMatches().then(setMatches);
  }, []);

  if (!matches) return <p className="muted">Loading your matches…</p>;

  const withMe = [...matches].filter((m) => m.me !== null).reverse(); // oldest first for trends

  return (
    <div className="history">
      <div className="results-head">
        <div>
          <h1 className="match-title">Your matches</h1>
          <p className="muted small">Saved in this browser only. Videos aren't stored, just the analysis.</p>
        </div>
        <button className="primary" onClick={onNew}>
          Analyze a new match
        </button>
      </div>

      {matches.length === 0 ? (
        <section className="panel">
          <p className="muted">No saved matches yet. Every match you analyze is saved here automatically.</p>
        </section>
      ) : (
        <>
          <section className="panel">
            <h2>Your progress</h2>
            {withMe.length < 2 ? (
              <p className="muted">
                Mark yourself with “This is me” in at least two matches to see your trends here.
                {withMe.length === 1 && " One down, one to go."}
              </p>
            ) : (
              <div className="trend-grid">
                {METRICS.map((metric) => (
                  <Trend key={metric.key} metric={metric} matches={withMe} />
                ))}
              </div>
            )}
          </section>

          {goals.length > 0 && withMe.length > 0 && (
            <section className="panel">
              <h2>Goals, match by match</h2>
              <div className="table-scroll">
                <table className="goal-table">
                  <thead>
                    <tr>
                      <th scope="col">Goal</th>
                      {withMe.slice(-8).map((m) => (
                        <th key={m.id} scope="col" title={m.title}>
                          {new Date(m.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </th>
                      ))}
                      <th scope="col">Met</th>
                    </tr>
                  </thead>
                  <tbody>
                    {goals.map((g) => {
                      const rs = withMe.slice(-8).map((m) => evaluateGoal(m, g));
                      const checked = rs.filter((r) => r.met !== null);
                      return (
                        <tr key={g.metric}>
                          <th scope="row">{describeGoal(g)}</th>
                          {rs.map((r, i) => (
                            <td
                              key={i}
                              className={r.met === null ? "na" : r.met ? "met" : "missed"}
                              title={r.value === null ? "No data" : formatGoalValue(g.metric, r.value)}
                            >
                              {r.met === null ? "–" : r.met ? "✓" : "✗"}
                              <span className="sr-only">{r.met === null ? "no data" : r.met ? "met" : "missed"}</span>
                            </td>
                          ))}
                          <td className="goal-total">
                            {checked.filter((r) => r.met).length}/{checked.length}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <People matches={matches} />

          <section className="panel">
            <h2>All matches</h2>
            <ul className="match-list">
              {matches.map((m) => (
                <li key={m.id}>
                  <button className="match-item" onClick={() => onOpen(m)}>
                    <span className="match-name">{m.title}</span>
                    <span className="muted small">
                      {new Date(m.createdAt).toLocaleDateString()} · {fmtTime(analysedSeconds(m.result))} ·{" "}
                      {m.result.shots.length} shots
                      {m.me !== null && ` · you: ${playerName(m, m.me)}`}
                      {m.me !== null && resultLabel(m)}
                      {m.report && " · coached"}
                    </span>
                  </button>
                  {confirming === m.id ? (
                    <span className="confirm">
                      Delete?{" "}
                      <button
                        className="link danger"
                        onClick={async () => {
                          await deleteMatch(m.id);
                          setMatches(matches.filter((x) => x.id !== m.id));
                          setConfirming(null);
                        }}
                      >
                        Yes, delete
                      </button>{" "}
                      <button className="link" onClick={() => setConfirming(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button className="link" onClick={() => setConfirming(m.id)} aria-label={`Delete ${m.title}`}>
                      Delete
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

/** One metric across matches: a small single-series line chart. */
function Trend({ metric, matches }: { metric: Metric; matches: MatchRecord[] }) {
  const points = matches
    .map((m) => ({ m, v: metric.value(m) }))
    .filter((p): p is { m: MatchRecord; v: number } => p.v !== null);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) {
    return (
      <figure className="trend">
        <figcaption>{metric.label}</figcaption>
        <p className="muted small">Not enough data yet.</p>
      </figure>
    );
  }
  const W = 280;
  const H = 110;
  const pad = { l: 8, r: 8, t: 12, b: 20 };
  const vals = points.map((p) => p.v);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const shown = hover ?? points.length - 1;

  return (
    <figure className="trend">
      <figcaption>
        {metric.label}
        <b>{metric.format(points[shown].v)}</b>
        <span className="muted small">
          {hover === null
            ? `latest · ${last.v >= first.v ? "▲" : "▼"} from ${metric.format(first.v)}`
            : new Date(points[shown].m.createdAt).toLocaleDateString()}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="trend-svg" role="img" aria-label={`${metric.label} over ${points.length} matches`} onMouseLeave={() => setHover(null)}>
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} className="trend-axis" />
        <path d={path} className="trend-line" />
        {points.map((p, i) => (
          <g key={p.m.id} onMouseEnter={() => setHover(i)}>
            <rect x={x(i) - 14} y={0} width={28} height={H} fill="transparent" />
            {hover === i && <line x1={x(i)} x2={x(i)} y1={pad.t} y2={H - pad.b} className="trend-cross" />}
            <circle cx={x(i)} cy={y(p.v)} r={hover === i || i === points.length - 1 ? 5 : 4} className="trend-dot" />
          </g>
        ))}
        <text x={pad.l} y={H - 5} className="trend-label">
          {new Date(first.m.createdAt).toLocaleDateString()}
        </text>
        <text x={W - pad.r} y={H - 5} className="trend-label end">
          {new Date(last.m.createdAt).toLocaleDateString()}
        </text>
      </svg>
    </figure>
  );
}

function resultLabel(m: MatchRecord): string {
  const w = matchWinner(m);
  if (!w || m.me === null) return "";
  return w === teamOf(m.me) ? " · won" : " · lost";
}

function People({ matches }: { matches: MatchRecord[] }) {
  const s = summarizePeople(matches);
  if (!s.partners.length && !s.rivals.length) {
    return (
      <section className="panel">
        <h2>Partners and rivals</h2>
        <p className="muted">
          Name the players in your matches (and mark yourself) to build records with each partner and against each rival.
          Tag points so each match has a result.
        </p>
      </section>
    );
  }
  const table = (title: string, rows: PersonProfile[], note: string) => (
    <div>
      <h3>{title}</h3>
      <p className="muted small">{note}</p>
      <table className="people-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Matches</th>
            <th scope="col">Won–lost</th>
            <th scope="col">Win rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.name}>
              <th scope="row">{p.name}</th>
              <td>{p.matches}</td>
              <td>
                {p.won}–{p.lost}
              </td>
              <td>{p.won + p.lost ? pct(p.won / (p.won + p.lost)) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <section className="panel">
      <h2>Partners and rivals</h2>
      <p className="small">
        Your record: <b>{s.me.won}–{s.me.lost}</b> in {s.me.matches} {s.me.matches === 1 ? "match" : "matches"}
        {s.me.matches - s.me.won - s.me.lost > 0 && ` (${s.me.matches - s.me.won - s.me.lost} without a result yet)`}
      </p>
      <div className="people-grid">
        {s.partners.length > 0 && table("Partners", s.partners, "Your results playing with them.")}
        {s.rivals.length > 0 && table("Rivals", s.rivals, "Your results playing against them.")}
      </div>
    </section>
  );
}
