import { useEffect, useState } from "react";
import type { AnalysisResult } from "./analysis/types";
import { AnalyzingView } from "./components/AnalyzingView";
import { ResultsView } from "./components/ResultsView";
import { SetupView, type AnalysisSettings } from "./components/SetupView";
import { Uploader } from "./components/Uploader";

type Stage =
  | { kind: "upload" }
  | { kind: "setup" }
  | { kind: "analyzing"; settings: AnalysisSettings }
  | { kind: "results"; result: AnalysisResult };

export default function App() {
  const [video, setVideo] = useState<{ url: string; name: string } | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "upload" });

  useEffect(() => () => {
    if (video) URL.revokeObjectURL(video.url);
  }, [video]);

  const reset = () => {
    setVideo(null);
    setStage({ kind: "upload" });
  };

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={reset} title="Start over">
          <span className="brand-ball" aria-hidden />
          Padel<b>Vision</b>
        </button>
        {video && <span className="file-name">{video.name}</span>}
        <nav className="steps">
          {(["upload", "setup", "analyzing", "results"] as const).map((s, i) => (
            <span key={s} className={stage.kind === s ? "step active" : "step"}>
              {i + 1}. {s === "setup" ? "court" : s}
            </span>
          ))}
        </nav>
      </header>

      <main>
        {stage.kind === "upload" && (
          <Uploader
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
            onDone={(result) => setStage({ kind: "results", result })}
          />
        )}
        {stage.kind === "results" && video && (
          <ResultsView
            src={video.url}
            name={video.name}
            result={stage.result}
            onReanalyze={() => setStage({ kind: "setup" })}
          />
        )}
      </main>
    </div>
  );
}
