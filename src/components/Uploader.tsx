import { useRef, useState } from "react";
import { fmtTime } from "../lib/format";
import type { MatchRecord } from "../lib/match";

interface Props {
  onFile: (file: File) => void;
  recent: MatchRecord[];
  onOpenRecent: (m: MatchRecord) => void;
  onShowHistory: () => void;
}

export function Uploader({ onFile, recent, onOpenRecent, onShowHistory }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("That doesn't look like a video file.");
      return;
    }
    onFile(file);
  };

  return (
    <section className="hero">
      <div className="hero-copy">
        <h1>
          Your padel match,
          <br />
          <span className="accent">read by AI.</span>
        </h1>
        <p>
          Drop in a match recording. PadelVision tracks all four players, detects every swing,
          maps court positioning and then asks an AI coach what to work on next.
        </p>
        <ul className="features">
          <li><b>Pose tracking</b> for up to 4 players, in your browser</li>
          <li><b>Shot detection</b> — forehand, backhand, volleys, overheads</li>
          <li><b>Court heatmaps</b>, distance covered and speed</li>
          <li><b>Pair tactics</b>: net together, split, spacing</li>
          <li><b>Highlights</b>: every smash or backhand, played back to back</li>
          <li><b>AI coach</b>: a report with drills, then ask it anything</li>
          <li><b>Progress</b> across matches, saved in your browser</li>
        </ul>
        {recent.length > 0 && (
          <div className="recent">
            <h2>Recent matches</h2>
            <ul>
              {recent.slice(0, 3).map((m) => (
                <li key={m.id}>
                  <button className="link" onClick={() => onOpenRecent(m)}>
                    {m.title}
                  </button>
                  <span className="muted small">
                    {new Date(m.createdAt).toLocaleDateString()} · {fmtTime(m.result.duration)}
                  </span>
                </li>
              ))}
            </ul>
            <button className="link" onClick={onShowHistory}>
              See all and your progress →
            </button>
          </div>
        )}
      </div>
      <div
        className={drag ? "dropzone drag" : "dropzone"}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          accept(e.dataTransfer.files[0]);
        }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
      >
        <div className="drop-icon" aria-hidden>▶</div>
        <p className="drop-title">Drop a match video here</p>
        <p className="muted">or click to browse · MP4, MOV, WebM</p>
        <p className="muted small">
          Best results: fixed camera behind a baseline, whole court in view. Your video never
          leaves your device unless you request an AI report (then only a few stills are sent).
        </p>
        {error && <p className="error">{error}</p>}
        <input
          ref={input}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => accept(e.target.files?.[0])}
        />
      </div>
    </section>
  );
}
