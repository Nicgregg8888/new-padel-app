import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisResult } from "./analysis/types";
import { AnalyzingView } from "./components/AnalyzingView";
import { HistoryView } from "./components/HistoryView";
import { ResultsView } from "./components/ResultsView";
import { SetupView, type AnalysisSettings } from "./components/SetupView";
import { Uploader } from "./components/Uploader";
import type { Goal } from "./analysis/goals";
import { listMatches, loadGoals, loadPlayerPrefs, saveGoals, saveMatch, savePlayerPrefs } from "./lib/history";
import { demoResult } from "./analysis/demo";
import { demoMatch, newMatch, type MatchRecord } from "./lib/match";

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
  const [stage, setStageState] = useState<Stage>({ kind: "upload" });
  // Always the latest stage, for updates that land after async work.
  const stageRef = useRef<Stage>(stage);
  const setStage = useCallback((next: Stage) => {
    stageRef.current = next;
    setStageState(next);
  }, []);
  const [recent, setRecent] = useState<MatchRecord[]>([]);
  const [goals, setGoalsState] = useState<Goal[]>(loadGoals);
  const setGoals = (g: Goal[]) => {
    setGoalsState(g);
    saveGoals(g);
  };

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

  const persist = (match: MatchRecord) => {
    if (match.demo) return;
    saveMatch(match);
    savePlayerPrefs({ names: match.names, me: match.me });
  };

  /**
   * Update a match from its latest state, never a stale copy: a coach report
   * can arrive a minute after it was requested, after other edits, or after
   * the user opened a different match.
   */
  const updateMatch = (id: string) => (update: (m: MatchRecord) => MatchRecord) => {
    const current = stageRef.current;
    if (current.kind === "results" && current.match.id === id) {
      const match = update(current.match);
      stageRef.current = { ...current, match };
      setStage(stageRef.current);
      persist(match);
      return;
    }
    // Not on screen any more: apply it to the saved copy instead.
    listMatches().then((all) => {
      const saved = all.find((m) => m.id === id);
      if (saved) persist(update(saved));
    });
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
            onDemo={() => setStage({ kind: "results", match: demoMatch(demoResult()), withVideo: false })}
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
            onChange={updateMatch(stage.match.id)}
            goals={goals}
            onGoalsChange={setGoals}
            onReanalyze={stage.withVideo && video ? () => setStage({ kind: "setup" }) : null}
          />
        )}
        {stage.kind === "history" && (
          <HistoryView
            goals={goals}
            onOpen={(match) => setStage({ kind: "results", match, withVideo: false })}
            onNew={reset}
          />
        )}
      </main>
    </div>
  );
}
