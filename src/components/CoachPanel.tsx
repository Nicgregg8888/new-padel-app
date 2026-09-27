import { useState } from "react";
import type { CoachReport } from "../../shared/coach";
import { buildCoachSummary, planKeyframes } from "../analysis/coachRequest";
import { captureFrames } from "../analysis/analyzeVideo";
import { PLAYER_COLORS, playerIdentity } from "../analysis/tracker";
import type { AnalysisResult } from "../analysis/types";
import { fmtTime } from "../lib/format";
import { loadHiddenVideo } from "../lib/video";

interface Props {
  src: string;
  result: AnalysisResult;
  onSeek: (t: number) => void;
}

type State =
  | { kind: "idle" }
  | { kind: "loading"; step: string }
  | { kind: "error"; message: string }
  | { kind: "done"; report: CoachReport };

export function CoachPanel({ src, result, onSeek }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [level, setLevel] = useState("Intermediate");
  const [focus, setFocus] = useState("");

  const generate = async () => {
    try {
      setState({ kind: "loading", step: "Capturing key moments…" });
      const plan = planKeyframes(result);
      const video = await loadHiddenVideo(src);
      const images = await captureFrames(video, plan.map((p) => p.t));
      setState({ kind: "loading", step: "Your AI coach is reviewing the match…" });
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: buildCoachSummary(result),
          keyframes: plan.map((p, i) => ({ ...p, image: images[i] })),
          context: { level, focus: focus || undefined },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setState({ kind: "done", report: body as CoachReport });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  if (state.kind === "done") return <Report report={state.report} onSeek={onSeek} onRedo={() => setState({ kind: "idle" })} />;

  return (
    <div className="coach-form">
      <p className="muted">
        Claude reviews your stats plus a few stills from key shots, then writes a personalised
        coaching report with drills. Only the stills and numbers are sent — not the video.
      </p>
      <div className="row wrap">
        <label>
          Level
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            {["Beginner", "Intermediate", "Advanced", "Competitive / pro"].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="grow">
          What do you want to work on? (optional)
          <input
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="e.g. I'm A1 — my bandeja and getting to the net"
            maxLength={500}
          />
        </label>
      </div>
      <button className="primary" onClick={generate} disabled={state.kind === "loading"}>
        {state.kind === "loading" ? state.step : "Generate AI coaching report"}
      </button>
      {state.kind === "error" && <p className="error">{state.message}</p>}
    </div>
  );
}

function Report({ report, onSeek, onRedo }: { report: CoachReport; onSeek: (t: number) => void; onRedo: () => void }) {
  return (
    <div className="report">
      <h3 className="report-headline">{report.headline}</h3>
      <p>{report.summary}</p>

      <div className="report-players">
        {report.players.map((p) => (
          <article key={p.playerId} className="report-player" style={{ borderLeftColor: PLAYER_COLORS[p.playerId] }}>
            <h4 style={{ color: PLAYER_COLORS[p.playerId] }}>{playerIdentity(p.playerId).label}</h4>
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
                <button className="time-link" onClick={() => onSeek(Math.max(0, m.t - 1))}>
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
        Generate a new report
      </button>
    </div>
  );
}
