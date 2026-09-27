import { useRef, useState } from "react";
import type { CoachReport } from "../../shared/coach";
import type { ChatTurn } from "../../shared/coachPrompt";
import { PLAYER_COLORS } from "../analysis/tracker";
import type { AnalysisResult } from "../analysis/types";
import { askFollowUp, generateReport } from "../lib/coachClient";
import { fmtTime } from "../lib/format";
import { HOSTED, isSampleError } from "../lib/hosted";
import { usePlayers } from "../lib/players";

interface Props {
  result: AnalysisResult;
  /** Video to take stills from; null for a saved match. */
  src: string | null;
  names: Record<number, string>;
  me: number | null;
  report: CoachReport | null;
  onReport: (r: CoachReport | null) => void;
  onSeek: (t: number) => void;
}

type Status = { kind: "idle" } | { kind: "loading"; step: string } | { kind: "error"; message: string };

const SUGGESTIONS = [
  "What's the one thing I should work on first?",
  "How can we get to the net together more often?",
  "Which shots am I avoiding, and why might that be?",
  "Plan my next practice session (60 minutes).",
];

export function CoachPanel({ result, src, names, me, report, onReport, onSeek }: Props) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [level, setLevel] = useState("Intermediate");
  const [focus, setFocus] = useState("");

  const generate = async () => {
    try {
      setStatus({ kind: "loading", step: "Starting…" });
      const r = await generateReport({
        result,
        src,
        names,
        me,
        level,
        focus,
        onStep: (step) => setStatus({ kind: "loading", step }),
      });
      onReport(r);
      setStatus({ kind: "idle" });
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="coach-body">
      {report ? (
        <Report report={report} onSeek={onSeek} canSeek={!!src} onRedo={() => onReport(null)} />
      ) : (
        <div className="coach-form">
          <p className="muted">
            Claude reviews your stats{src ? " plus a few stills from key shots" : ""}, then writes a personalised
            coaching report with drills. Only the stills and numbers are sent, never the video.
            {HOSTED && " It runs on your own Claude account; you'll be asked to allow it the first time."}
          </p>
          {me === null && (
            <p className="hint">Tip: mark yourself with “This is me” on your player card and the report will speak to you.</p>
          )}
          <div className="row wrap">
            <label>
              Level
              <select id="coach-level" value={level} onChange={(e) => setLevel(e.target.value)}>
                {["Beginner", "Intermediate", "Advanced", "Competitive / pro"].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <label className="grow">
              What do you want to work on? (optional)
              <input
                id="coach-focus"
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="e.g. my bandeja and getting to the net"
                maxLength={500}
              />
            </label>
          </div>
          <button className="primary" onClick={generate} disabled={status.kind === "loading"}>
            {status.kind === "loading" ? status.step : "Write my coaching report"}
          </button>
          {status.kind === "error" && <p className="error">{status.message}</p>}
        </div>
      )}
      <Chat result={result} names={names} me={me} report={report} />
    </div>
  );
}

function Chat({ result, names, me, report }: Pick<Props, "result" | "names" | "me" | "report">) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || pending !== null) return;
    const next: ChatTurn[] = [...turns, { role: "user", content: q }];
    setTurns(next);
    setDraft("");
    setError(null);
    setPending("");
    ctl.current = new AbortController();
    try {
      const answer = await askFollowUp({
        result,
        names,
        me,
        report,
        turns: next,
        signal: ctl.current.signal,
        onText: (t) => setPending(t),
      });
      setTurns([...next, { role: "assistant", content: answer }]);
    } catch (e) {
      const partial = isSampleError(e) ? (e as { text?: string }).text : undefined;
      if (partial) setTurns([...next, { role: "assistant", content: partial }]);
      const cancelled = (isSampleError(e) && e.code === "cancelled") || (e instanceof DOMException && e.name === "AbortError");
      if (!cancelled) setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="chat" aria-label="Ask the coach">
      <h3>Ask the coach</h3>
      {turns.length === 0 && (
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => send(s)} disabled={pending !== null}>
              {s}
            </button>
          ))}
        </div>
      )}
      <ol className="chat-log">
        {turns.map((t, i) => (
          <li key={i} className={`bubble ${t.role}`}>
            {t.content}
          </li>
        ))}
        {pending !== null && <li className="bubble assistant pending">{pending || "Thinking…"}</li>}
      </ol>
      {error && <p className="error">{error}</p>}
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          id="chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask anything about this match…"
          maxLength={2000}
          aria-label="Your question"
        />
        {pending !== null ? (
          <button type="button" className="ghost" onClick={() => ctl.current?.abort()}>
            Stop
          </button>
        ) : (
          <button type="submit" className="primary" disabled={!draft.trim()}>
            Ask
          </button>
        )}
      </form>
    </section>
  );
}

interface ReportProps {
  report: CoachReport;
  onSeek: (t: number) => void;
  canSeek: boolean;
  onRedo: () => void;
}

function Report({ report, onSeek, canSeek, onRedo }: ReportProps) {
  const { name, me } = usePlayers();
  const players = [...report.players].sort((a, b) => Number(b.playerId === me) - Number(a.playerId === me));
  return (
    <div className="report">
      <h3 className="report-headline">{report.headline}</h3>
      <p>{report.summary}</p>

      <div className="report-players">
        {players.map((p) => (
          <article key={p.playerId} className="report-player" style={{ borderLeftColor: PLAYER_COLORS[p.playerId] }}>
            <h4 style={{ color: PLAYER_COLORS[p.playerId] }}>
              {name(p.playerId)}
              {p.playerId === me && " (you)"}
            </h4>
            {p.strengths.length > 0 && (
              <>
                <h5>Strengths</h5>
                <ul>{p.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </>
            )}
            {p.improvements.length > 0 && (
              <>
                <h5>Work on</h5>
                <ul>{p.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </>
            )}
            {p.drills.length > 0 && (
              <>
                <h5>Drills</h5>
                <ul className="drills">
                  {p.drills.map((d, i) => (
                    <li key={i}>
                      <b>{d.name}</b> — {d.description}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </article>
        ))}
      </div>

      {report.teamTactics.length > 0 && (
        <>
          <h4>Team tactics</h4>
          <div className="report-teams">
            {report.teamTactics.map((t) => (
              <div key={t.team}>
                <h5>Team {t.team}</h5>
                <ul>{t.observations.map((o, i) => <li key={i}>{o}</li>)}</ul>
              </div>
            ))}
          </div>
        </>
      )}

      {report.keyMoments.length > 0 && (
        <>
          <h4>Key moments</h4>
          <ol className="moments">
            {report.keyMoments.map((m, i) => (
              <li key={i}>
                <button className="time-link" disabled={!canSeek} onClick={() => onSeek(Math.max(0, m.t - 1))}>
                  {fmtTime(m.t)}
                </button>
                <div>
                  <b>{m.title}</b>
                  <p>{m.observation}</p>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {report.caveats.length > 0 && (
        <details className="caveats">
          <summary>Data caveats</summary>
          <ul>{report.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </details>
      )}
      <button className="ghost" onClick={onRedo}>
        Write a new report
      </button>
    </div>
  );
}
