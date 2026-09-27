import { useRef, useState } from "react";
import { analysedSeconds } from "../analysis/reliability";
import { fmtTime } from "../lib/format";
import { canDecodeVideo } from "../lib/video";
import { FilmingGuide } from "./FilmingGuide";
import type { MatchRecord } from "../lib/match";

interface Props {
  onFile: (file: File) => void;
  recent: MatchRecord[];
  onOpenRecent: (m: MatchRecord) => void;
  onShowHistory: () => void;
  onDemo: () => void;
}

export function Uploader({ onFile, recent, onOpenRecent, onShowHistory, onDemo }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [checking, setChecking] = useState(false);
  const accept = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("video/") && !/\.(mov|mp4|m4v|webm|mkv|avi)$/i.test(file.name)) {
      setError("That doesn't look like a video file.");
      return;
    }
    setError(null);
    setChecking(true);
    const url = URL.createObjectURL(file);
    const ok = await canDecodeVideo(url);
    URL.revokeObjectURL(url);
    setChecking(false);
    if (!ok) {
      setError(
        "This browser can't show the picture in this video. iPhone videos are often HEVC (H.265), which Chrome and Firefox can't always play. Open this page in Safari, or re-save the video as H.264: on iPhone set Settings → Camera → Formats → Most Compatible, or export it from Photos/iMovie as MP4.",
      );
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
          Film a match, drop the video in, and see how you really play: every shot, where you stood, how you
          played as a pair, and what to work on next.
        </p>
        <ol className="how-steps">
          <li>
            <b>Add your video</b>
            <span>Any phone recording of a match works.</span>
          </li>
          <li>
            <b>Check the court</b>
            <span>We find it for you; just confirm.</span>
          </li>
          <li>
            <b>Get your stats and coaching</b>
            <span>Shots, positioning, highlights and an AI coach.</span>
          </li>
        </ol>
        <button className="ghost demo-btn" onClick={onDemo}>
          No video handy? Explore a demo match →
        </button>
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
                    {new Date(m.createdAt).toLocaleDateString()} · {fmtTime(analysedSeconds(m.result))}
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
      <div className="upload-col">
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
        <p className="drop-title">{checking ? "Checking the video…" : "Choose a match video"}</p>
        <p className="muted">or drag it here · MP4, MOV or WebM</p>
        <p className="muted small">
          🔒 Private: your video stays on this device. Only if you ask the AI coach are a few still images sent.
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
        <FilmingGuide />
      </div>
    </section>
  );
}
