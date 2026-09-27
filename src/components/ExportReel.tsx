import { useEffect, useRef, useState } from "react";
import type { AnalysisResult } from "../analysis/types";
import { fmtTime } from "../lib/format";
import { HOSTED, type Downloads } from "../lib/hosted";
import { usePlayers } from "../lib/players";
import { MAX_REEL_SECONDS, limitClips, reelDuration, renderReel } from "../lib/reelExport";
import type { Playlist } from "./MatchPlayer";

interface Props {
  src: string;
  playlist: Playlist;
  result: AnalysisResult;
  downloads: Downloads | null;
  onClose: () => void;
}

type State = { kind: "ready" } | { kind: "rendering"; progress: number } | { kind: "done"; blob: Blob; url: string } | { kind: "error"; message: string };

export function ExportReel({ src, playlist, result, downloads, onClose }: Props) {
  const { name } = usePlayers();
  const [state, setState] = useState<State>({ kind: "ready" });
  const [saved, setSaved] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const clips = limitClips(playlist.clips);
  const trimmed = clips.length < playlist.clips.length;

  useEffect(() => () => ctl.current?.abort(), []);
  useEffect(() => () => {
    if (state.kind === "done") URL.revokeObjectURL(state.url);
  }, [state]);

  const start = async () => {
    ctl.current = new AbortController();
    setState({ kind: "rendering", progress: 0 });
    try {
      const blob = await renderReel({
        src,
        title: playlist.title,
        clips,
        frames: result.frames,
        ball: result.ball?.track ?? [],
        name,
        signal: ctl.current.signal,
        onProgress: (progress) => setState({ kind: "rendering", progress }),
      });
      setState({ kind: "done", blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") setState({ kind: "ready" });
      else setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const filename = `${playlist.title.replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "highlights"}.webm`;
  const save = async () => {
    if (state.kind !== "done") return;
    if (HOSTED) {
      try {
        await downloads?.save({ filename, data: state.blob });
        setSaved(true);
      } catch {
        // Declined or unavailable.
      }
      return;
    }
    const a = document.createElement("a");
    a.href = state.url;
    a.download = filename;
    a.click();
    setSaved(true);
  };

  return (
    <div className="modal-backdrop" onClick={state.kind === "rendering" ? undefined : onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Export highlight video" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>Export highlight video</h2>
          <button className="ghost small" onClick={onClose} disabled={state.kind === "rendering"}>
            Close
          </button>
        </div>
        <p className="small">
          <b>{playlist.title}</b> · {clips.length} clip{clips.length === 1 ? "" : "s"} · {fmtTime(reelDuration(clips))}
          {trimmed && <span className="muted"> (first {fmtTime(MAX_REEL_SECONDS)} of {playlist.clips.length} clips)</span>}
        </p>
        {state.kind === "ready" && (
          <>
            <p className="muted small">
              Plays the clips with skeletons, names, shot labels and the ball trail drawn on, and records them into a video.
              It records in real time, so keep this tab open and visible.
            </p>
            <button className="primary" onClick={start}>
              Record video
            </button>
          </>
        )}
        {state.kind === "rendering" && (
          <>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${state.progress * 100}%` }} />
            </div>
            <div className="row between">
              <span className="muted small">Recording… {Math.round(state.progress * 100)}%</span>
              <button className="ghost small" onClick={() => ctl.current?.abort()}>
                Cancel
              </button>
            </div>
          </>
        )}
        {state.kind === "done" && (
          <>
            <video className="card-preview" src={state.url} controls playsInline />
            <div className="row">
              {(!HOSTED || downloads) && (
                <button className="primary" onClick={save}>
                  Save video
                </button>
              )}
              {saved && <span className="ok-text small">Saved</span>}
              <span className="muted small">{(state.blob.size / 1e6).toFixed(1)} MB · WebM</span>
            </div>
          </>
        )}
        {state.kind === "error" && <p className="error">{state.message}</p>}
      </div>
    </div>
  );
}
