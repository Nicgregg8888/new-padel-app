import { useCallback, useEffect, useState } from "react";
import type { AnalysisResult } from "./analysis/types";
import { AnalyzingView } from "./components/AnalyzingView";
import { HistoryView } from "./components/HistoryView";
import { ResultsView } from "./components/ResultsView";
import { SetupView, type AnalysisSettings } from "./components/SetupView";
import { Uploader } from "./components/Uploader";
import { listMatches, loadPlayerPrefs, saveMatch, savePlayerPrefs } from "./lib/history";
import { newMatch, type MatchRecord } from "./lib/match";

type Stage =
  | { kind: "upload" }
  | { kind: "setup" }
  | { kind: "analyzing"; settings: AnalysisSettings }
  | { kind: "results"; match: MatchRecord; withVideo: boolean }
  | { kind: "history" };

const STEPS = [
  ["upload", "Upload"],
  ["setup", "Court"],
  ["analyzing", "Analyze"],
  ["results", "Results"],
] as const;

export default function App() {
  const [video, setVideo] = useState<{ url: string; name: string } | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "upload" });
  const [recent, setRecent] = useState<MatchRecord[]>([]);

  useEffect(() => () => {
    if (video) URL.revokeObjectURL(video.url);
  }, [video]);

  useEffect(() => {
    if (stage.kind === "upload") listMatches().then(setRecent);
  }, [stage.kind]);

  const reset = () => {
    setVideo(null);
    setStage({ kind: "upload" });
  };

  const onAnalysed = useCallback(
    (result: AnalysisResult) => {
      const match = newMatch(video?.name ?? "Match", result, loadPlayerPrefs());
      saveMatch(match);
      setStage({ kind: "results", match, withVideo: true });
    },
    [video],
  );

  const updateMatch = (match: MatchRecord) => {
    setStage((s) => (s.kind === "results" ? { ...s, match } : s));
    saveMatch(match);
    savePlayerPrefs({ names: match.names, me: match.me });
  };

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={reset} title="Start over">
          <span className="brand-ball" aria-hidden />
          Padel<b>Vision</b>
        </button>
        {video && stage.kind !== "history" && <span className="file-name">{video.name}</span>}
        <nav className="steps" aria-label="Progress">
          {stage.kind !== "history" &&
            STEPS.map(([s, label], i) => (
              <span key={s} className={stage.kind === s ? "step active" : "step"}>
                {i + 1}. {label}
              </span>
            ))}
        </nav>
        <button
          className={stage.kind === "history" ? "ghost nav-btn on" : "ghost nav-btn"}
          onClick={() => setStage({ kind: "history" })}
        >
          My matches
        </button>
      </header>

      <main>
        {stage.kind === "upload" && (
          <Uploader
            recent={recent}
            onOpenRecent={(match) => setStage({ kind: "results", match, withVideo: false })}
            onShowHistory={() => setStage({ kind: "history" })}
            onFile={(file) => {
              setVideo({ url: URL.createObjectURL(file), name: file.name });
              setStage({ kind: "setup" });
            }}
          />
        )}
        {stage.kind === "setup" && video && (
          <SetupView
            src={video.url}
            onBack={reset}
            onStart={(settings) => setStage({ kind: "analyzing", settings })}
          />
        )}
        {stage.kind === "analyzing" && video && (
          <AnalyzingView
            src={video.url}
            settings={stage.settings}
            onCancel={() => setStage({ kind: "setup" })}
            onDone={onAnalysed}
          />
        )}
        {stage.kind === "results" && (
          <ResultsView
            key={stage.match.id}
            match={stage.match}
            src={stage.withVideo && video ? video.url : null}
            onChange={updateMatch}
            onReanalyze={stage.withVideo && video ? () => setStage({ kind: "setup" }) : null}
          />
        )}
        {stage.kind === "history" && (
          <HistoryView
            onOpen={(match) => setStage({ kind: "results", match, withVideo: false })}
            onNew={reset}
          />
        )}
      </main>
    </div>
  );
}
