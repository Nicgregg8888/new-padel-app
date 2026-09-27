import { useRef } from "react";
import type { AnalysisResult } from "../analysis/types";
import { fmtTime } from "../lib/format";
import { CoachPanel } from "./CoachPanel";
import { CourtMap } from "./CourtMap";
import { MatchPlayer } from "./MatchPlayer";
import { PlayerCards } from "./PlayerCards";
import { ShotChart } from "./ShotChart";

interface Props {
  src: string;
  name: string;
  result: AnalysisResult;
  onReanalyze: () => void;
}

export function ResultsView({ src, name, result, onReanalyze }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    v.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const exportJson = () => {
    const { frames: _frames, ...summary } = result;
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/\.[^.]+$/, "")}-analysis.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const avgRally = result.rallies.length
    ? result.rallies.reduce((a, r) => a + r.shots, 0) / result.rallies.length
    : 0;

  return (
    <div className="results">
      <section className="kpis">
        <Kpi label="Duration" value={fmtTime(result.duration)} />
        <Kpi label="Players tracked" value={String(result.players.length)} />
        <Kpi label="Shots detected" value={String(result.shots.length)} />
        <Kpi label="Rallies" value={String(result.rallies.length)} />
        <Kpi label="Avg. rally" value={avgRally ? `${avgRally.toFixed(1)} shots` : "—"} />
        <div className="kpi-actions">
          <button className="ghost" onClick={onReanalyze}>Re-analyze</button>
          <button className="ghost" onClick={exportJson}>Export JSON</button>
        </div>
      </section>
      {!result.calibrated && (
        <p className="notice">
          Court not calibrated — distances, speeds and positions are approximate. Re-analyze and mark the
          court corners for accurate numbers.
        </p>
      )}

      <div className="results-grid">
        <section className="panel span-2">
          <MatchPlayer src={src} result={result} videoRef={videoRef} />
        </section>

        <section className="panel">
          <h2>Court map</h2>
          <CourtMap players={result.players} shots={result.shots} onSeek={seek} />
        </section>

        <section className="panel span-3">
          <h2>Players</h2>
          <PlayerCards players={result.players} calibrated={result.calibrated} />
        </section>

        <section className="panel">
          <h2>Shot mix</h2>
          <ShotChart players={result.players} />
          <h2 className="mt">Rallies</h2>
          {result.rallies.length ? (
            <ul className="rally-list">
              {result.rallies.map((r, i) => (
                <li key={i}>
                  <button className="time-link" onClick={() => seek(r.start)}>
                    {fmtTime(r.start)}
                  </button>
                  <span>{r.shots} shots</span>
                  <span className="muted">{(r.end - r.start).toFixed(0)}s</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No rallies detected.</p>
          )}
        </section>

        <section className="panel span-2 coach">
          <h2>
            AI coach <span className="badge">Claude</span>
          </h2>
          <CoachPanel src={src} result={result} onSeek={seek} />
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
    </div>
  );
}
