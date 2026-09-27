import { useEffect, useRef, useState } from "react";
import { analyzeVideo } from "../analysis/analyzeVideo";
import { audioHitsFromFile } from "../analysis/audio";
import type { AnalysisResult } from "../analysis/types";
import { drawPoses } from "../lib/draw";
import { fmtTime } from "../lib/format";
import { checkpointKey, clearCheckpoint, loadCheckpoint, saveCheckpoint, type VideoFingerprint } from "../lib/checkpoint";
import { loadHiddenVideo } from "../lib/video";
import type { AnalysisSettings } from "./SetupView";

interface Props {
  src: string;
  /** Identifies the file, so a reload can resume a saved partial analysis. */
  fingerprint: VideoFingerprint | null;
  settings: AnalysisSettings;
  onDone: (r: AnalysisResult) => void;
  onCancel: () => void;
}

export function AnalyzingView({ src, fingerprint, settings, onDone, onCancel }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Loading pose model…");
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState(0);
  const started = useRef(performance.now());
  const [resumedAt, setResumedAt] = useState<number | null>(null);
  const [restart, setRestart] = useState(0);
  const progressAtStart = useRef(0);
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

        // Listen for ball hits in the soundtrack while the video loads.
        const audio = settings.useAudio === false ? undefined : await audioHitsFromFile(src, settings.range);
        if (ctrl.signal.aborted) return;
        const key = fingerprint ? checkpointKey(fingerprint, settings) : null;
        const saved = key ? await loadCheckpoint(key) : null;
        if (ctrl.signal.aborted) return;
        setResumedAt(saved ? saved.lastT : null);
        let chunk = saved?.chunks ?? 0;
        let saving = Promise.resolve();

        started.current = performance.now();
        progressAtStart.current = -1;
        const result = await analyzeVideo(video, {
          ...settings,
          resume: saved ?? undefined,
          audio,
          onCheckpoint: key
            ? (newFrames, lastT, ball) => {
                const index = chunk++;
                saving = saving.then(() => saveCheckpoint(key, index, newFrames, lastT, ball));
              }
            : undefined,
          signal: ctrl.signal,
          onProgress: (f, frame) => {
            if (progressAtStart.current < 0) progressAtStart.current = f;
            setProgress(f);
            setStatus(`Tracking players · ${fmtTime(frame.t)}`);
            setPlayers((n) => Math.max(n, frame.poses.length));
            ctx.drawImage(video!, 0, 0, c.width, c.height);
            drawPoses(ctx, frame.poses, c.width, c.height);
          },
        });
        video.remove();
        if (key) await saving.then(() => clearCheckpoint(key));
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
  }, [src, settings, fingerprint, restart]);

  const elapsed = (performance.now() - started.current) / 1000;
  const done = progress - Math.max(0, progressAtStart.current);
  const eta = done > 0.02 ? (elapsed / done) * (1 - progress) : null;

  return (
    <section className="analyzing panel">
      <div className="analyzing-head">
        <div>
          <h2>Analyzing match</h2>
          <p className="muted">{error ? "Analysis failed" : status}</p>
          {resumedAt !== null && !error && (
            <p className="small resumed">
              Picked up at {fmtTime(resumedAt)} from your saved progress.{" "}
              <button
                className="link small"
                onClick={async () => {
                  if (fingerprint) await clearCheckpoint(checkpointKey(fingerprint, settings));
                  setProgress(0);
                  setRestart((n) => n + 1);
                }}
              >
                Start over
              </button>
            </p>
          )}
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
