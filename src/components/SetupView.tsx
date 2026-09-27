import { useMemo, useRef, useState } from "react";
import { DEFAULT_CORNERS, courtToImageHomography } from "../analysis/court";
import { detectCourt, framePixels } from "../analysis/courtDetect";
import type { PoseModel } from "../analysis/pose";
import type { CourtCorners, Point } from "../analysis/types";
import { projectedCourtLines } from "../lib/draw";
import { HOSTED } from "../lib/hosted";
import { fmtTime } from "../lib/format";
import { knownDuration } from "../lib/video";

export interface AnalysisSettings {
  corners: CourtCorners;
  calibrated: boolean;
  sampleFps: number;
  model: PoseModel;
  minSwingSpeed: number;
  trackBall: boolean;
  /** Use ball-hit sounds from the soundtrack to find shots. */
  useAudio: boolean;
  range?: { start: number; end: number };
}

const CORNER_NAMES = ["far-left", "far-right", "near-right", "near-left"];

/** Lower sensitivity = higher speed threshold. */
const SENSITIVITY_TO_SPEED = { low: 12, medium: 9, high: 6.5 } as const;
type Sensitivity = keyof typeof SENSITIVITY_TO_SPEED;

type Preset = "quick" | "standard" | "best";
const PRESETS: Record<Preset, { label: string; hint: string; model: PoseModel; fps: number }> = {
  quick: { label: "Quick", hint: "A fast first look", model: "lite", fps: 5 },
  standard: { label: "Standard", hint: "Recommended for most videos", model: "full", fps: 10 },
  best: {
    label: "Most accurate",
    hint: "Catches more shots, takes longer",
    model: HOSTED ? "full" : "heavy",
    fps: 15,
  },
};

interface Props {
  src: string;
  onStart: (s: AnalysisSettings) => void;
  onBack: () => void;
}

export function SetupView({ src, onStart, onBack }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [preset, setPreset] = useState<Preset>("standard");
  const { model, fps } = PRESETS[preset];
  const [sensitivity, setSensitivity] = useState<Sensitivity>("medium");
  const [trackBall, setTrackBall] = useState(true);
  const [useAudio, setUseAudio] = useState(true);
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [detect, setDetect] = useState<"pending" | "found" | "missed" | "manual">("pending");
  const stage = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);

  const autoDetect = () => {
    const v = video.current;
    if (!v || v.readyState < 2) return;
    try {
      const found = detectCourt(framePixels(v));
      if (found) {
        setPoints(found);
        setDetect("found");
      } else {
        setDetect("missed");
      }
    } catch {
      setDetect("missed");
    }
  };

  const toStage = (e: React.PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  const lines = useMemo(() => {
    if (points.length !== 4) return [];
    try {
      return projectedCourtLines(courtToImageHomography(points as CourtCorners));
    } catch {
      return [];
    }
  }, [points]);

  const click = (e: React.MouseEvent<SVGSVGElement>) => {
    if (points.length >= 4) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPoints([...points, { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }]);
  };

  const start = (calibrated: boolean) =>
    onStart({
      corners: calibrated ? (points as CourtCorners) : DEFAULT_CORNERS,
      calibrated,
      sampleFps: fps,
      model,
      minSwingSpeed: SENSITIVITY_TO_SPEED[sensitivity],
      trackBall,
      useAudio,
      ...(range ? { range } : {}),
    });

  const span = range ? range.end - range.start : duration;
  const estMinutes = (span * fps) / (model === "heavy" ? 300 : model === "full" ? 600 : 1200);

  return (
    <section className="setup">
      <div className="panel">
        <h2>{detect === "found" && points.length === 4 ? "Is this the court?" : "Mark the court"}</h2>
        {detect === "found" && points.length === 4 ? (
          <p className="muted">
            <b className="ok-text">We found it.</b> If the yellow lines sit on the court lines, you're ready. If
            not, drag a numbered corner into place.
          </p>
        ) : (
          <p className="muted">
            {detect === "missed" && <b>Couldn't find the court automatically. </b>}
            Click the four corners of the court <b>on the floor</b>, in this order:{" "}
            {CORNER_NAMES.map((n, i) => (
              <span key={n} className={points.length === i ? "corner-tag next" : "corner-tag"}>
                {i + 1}. {n}
              </span>
            ))}
            . This lets us measure real distances in meters.
          </p>
        )}
        <div className="calib-stage" ref={stage}>
          <video
            ref={video}
            src={src}
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              knownDuration(v).then((d) => {
                setDuration(d);
                v.currentTime = Math.min(1, d / 2);
              });
            }}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onSeeked={() => {
              if (detect === "pending") autoDetect();
            }}
          />
          <svg
            className={points.length < 4 ? "calib-overlay picking" : "calib-overlay"}
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            onClick={click}
          >
            {lines.map(([a, b], i) => (
              <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={i === 4 ? "net-line" : "court-line"} />
            ))}
            {points.length > 1 && points.length < 4 && (
              <polyline points={points.map((p) => `${p.x},${p.y}`).join(" ")} className="court-line" />
            )}
          </svg>
          {points.map((p, i) => (
            <div
              key={i}
              className="corner-dot"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              role="slider"
              aria-label={`Corner ${i + 1}: ${CORNER_NAMES[i]}`}
              aria-valuetext={`${Math.round(p.x * 100)}% across, ${Math.round(p.y * 100)}% down`}
              tabIndex={0}
              onPointerDown={(e) => {
                dragging.current = i;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (dragging.current !== i) return;
                const next = [...points];
                next[i] = toStage(e);
                setPoints(next);
              }}
              onPointerUp={() => (dragging.current = null)}
              onKeyDown={(e) => {
                const d = e.shiftKey ? 0.01 : 0.002;
                const delta = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
                if (!delta) return;
                e.preventDefault();
                const next = [...points];
                next[i] = { x: p.x + delta[0], y: p.y + delta[1] };
                setPoints(next);
              }}
            >
              {i + 1}
            </div>
          ))}
        </div>
        <div className="scrub">
          <span>{fmtTime(time)}</span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.04}
            value={time}
            onChange={(e) => {
              if (video.current) video.current.currentTime = Number(e.target.value);
            }}
            aria-label="Choose a frame"
          />
          <span>{fmtTime(duration)}</span>
        </div>
        <div className="segment" role="group" aria-label="Part of the video to analyse">
          <span className="small">
            {range ? (
              <>
                Analysing <b>{fmtTime(range.start)}–{fmtTime(range.end)}</b> ({fmtTime(range.end - range.start)})
              </>
            ) : (
              <>
                Analysing the <b>whole video</b> ({fmtTime(duration)}). Long match? Pick one set:
              </>
            )}
          </span>
          <button
            className="ghost small"
            onClick={() => setRange({ start: time, end: Math.max(time + 1, range?.end ?? duration) })}
          >
            Start here ({fmtTime(time)})
          </button>
          <button
            className="ghost small"
            disabled={time <= (range?.start ?? 0) + 1}
            onClick={() => setRange({ start: range?.start ?? 0, end: time })}
          >
            End here
          </button>
          {range && (
            <button className="link small" onClick={() => setRange(null)}>
              Whole video
            </button>
          )}
        </div>
        <div className="row">
          <button className="ghost" onClick={autoDetect}>
            Find the court again
          </button>
          <button className="ghost" onClick={() => setPoints(points.slice(0, -1))} disabled={!points.length}>
            Undo last corner
          </button>
          <button
            className="ghost"
            onClick={() => {
              setPoints([]);
              setDetect("manual");
            }}
            disabled={!points.length}
          >
            Clear
          </button>
        </div>
      </div>

      <aside className="panel settings">
        <h2>How thorough?</h2>
        <div className="choice-list" role="radiogroup" aria-label="Speed or accuracy">
          {(Object.keys(PRESETS) as Preset[]).map((k) => (
            <label key={k} className={preset === k ? "choice on" : "choice"}>
              <input type="radio" name="preset" checked={preset === k} onChange={() => setPreset(k)} />
              <span>
                <b>{PRESETS[k].label}</b>
                <span className="muted small">{PRESETS[k].hint}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="muted small">
          About <b>{Math.max(1, Math.round(trackBall ? Math.max(estMinutes, span / 60) : estMinutes))} min</b> for{" "}
          {fmtTime(span)} of video. Skipping the court makes distances and positions rough.
        </p>
        <details className="more-options">
          <summary>More options</summary>
          <label className="toggle">
            <input id="use-audio" type="checkbox" checked={useAudio} onChange={(e) => setUseAudio(e.target.checked)} />
            Listen for the ball
          </label>
          <p className="muted small">The pop of the ball on the racket pinpoints each shot. Turn off if there's music over the video.</p>
          <label className="toggle">
            <input id="track-ball" type="checkbox" checked={trackBall} onChange={(e) => setTrackBall(e.target.checked)} />
            Follow the ball (beta)
          </label>
          <p className="muted small">Finds lobs and confirms shots, but analysis takes about as long as the video.</p>
          <label>
            Count a swing as a shot when it's
            <select value={sensitivity} onChange={(e) => setSensitivity(e.target.value as Sensitivity)}>
              <option value="low">Clear and fast only</option>
              <option value="medium">Normal</option>
              <option value="high">Even soft touches</option>
            </select>
          </label>
        </details>
        <button className="primary big" disabled={points.length !== 4} onClick={() => start(true)}>
          {points.length === 4 ? "Analyse match" : `Mark ${4 - points.length} more corner${points.length === 3 ? "" : "s"} to start`}
        </button>
        <button className="ghost" onClick={() => start(false)}>
          Skip this step
        </button>
        <button className="link" onClick={onBack}>
          ← Choose another video
        </button>
      </aside>
    </section>
  );
}
