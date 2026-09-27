import { useEffect, useRef, useState } from "react";
import { analyzeVideo } from "../analysis/analyzeVideo";
import type { AnalysisResult } from "../analysis/types";
import { drawPoses } from "../lib/draw";
import { fmtTime } from "../lib/format";
import { loadHiddenVideo } from "../lib/video";
import type { AnalysisSettings } from "./SetupView";

interface Props {
  src: string;
  settings: AnalysisSettings;
  onDone: (r: AnalysisResult) => void;
  onCancel: () => void;
}

export function AnalyzingView({ src, settings, onDone, onCancel }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Loading pose model…");
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState(0);
  const started = useRef(performance.now());
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const ctrl = new AbortController();
    let video: HTMLVideoElement | null = null;
    (async () => {
      try {
        const loaded = await loadHiddenVideo(src, { attach: true });
        // Cancelled (or StrictMode re-ran the effect) while loading: don't leak the element.
        if (ctrl.signal.aborted) {
          loaded.remove();
          return;
        }
        video = loaded;
        const c = canvas.current!;
        c.width = Math.min(960, video.videoWidth);
        c.height = Math.round((c.width * video.videoHeight) / video.videoWidth);
        const ctx = c.getContext("2d")!;
        started.current = performance.now();
        const result = await analyzeVideo(video, {
          ...settings,
          signal: ctrl.signal,
          onProgress: (f, frame) => {
            setProgress(f);
            setStatus(`Tracking players · ${fmtTime(frame.t)}`);
            setPlayers((n) => Math.max(n, frame.poses.length));
            ctx.drawImage(video!, 0, 0, c.width, c.height);
            drawPoses(ctx, frame.poses, c.width, c.height);
          },
        });
        video.remove();
        if (!ctrl.signal.aborted) onDoneRef.current(result);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        console.error(e);
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      ctrl.abort();
      video?.pause();
      video?.remove();
    };
  }, [src, settings]);

  const elapsed = (performance.now() - started.current) / 1000;
  const eta = progress > 0.02 ? (elapsed / progress) * (1 - progress) : null;

  return (
    <section className="analyzing panel">
      <div className="analyzing-head">
        <div>
          <h2>Analyzing match</h2>
          <p className="muted">{error ? "Analysis failed" : status}</p>
        </div>
        <button className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="progress">
        <div className="progress-bar" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="progress-meta">
        <span>{Math.round(progress * 100)}%</span>
        <span>{players} player{players === 1 ? "" : "s"} in view</span>
        <span>{eta !== null ? `~${fmtTime(eta)} left` : "estimating…"}</span>
      </div>
      {error && (
        <p className="error">
          {error}. The pose model loads from the internet on first use — check your connection and try again.
        </p>
      )}
      <canvas ref={canvas} className="live-canvas" />
    </section>
  );
}
