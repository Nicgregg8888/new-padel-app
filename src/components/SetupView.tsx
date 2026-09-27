import { useMemo, useRef, useState } from "react";
import { DEFAULT_CORNERS, courtToImageHomography } from "../analysis/court";
import type { PoseModel } from "../analysis/pose";
import type { CourtCorners, Point } from "../analysis/types";
import { projectedCourtLines } from "../lib/draw";
import { HOSTED } from "../lib/hosted";
import { fmtTime } from "../lib/format";

export interface AnalysisSettings {
  corners: CourtCorners;
  calibrated: boolean;
  sampleFps: number;
  model: PoseModel;
  minSwingSpeed: number;
}

const CORNER_NAMES = ["far-left", "far-right", "near-right", "near-left"];

/** Lower sensitivity = higher speed threshold. */
const SENSITIVITY_TO_SPEED = { low: 12, medium: 9, high: 6.5 } as const;
type Sensitivity = keyof typeof SENSITIVITY_TO_SPEED;

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
  const [model, setModel] = useState<PoseModel>("full");
  const [fps, setFps] = useState(10);
  const [sensitivity, setSensitivity] = useState<Sensitivity>("medium");

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
    });

  const estMinutes = (duration * fps) / (model === "heavy" ? 300 : model === "full" ? 600 : 1200);

  return (
    <section className="setup">
      <div className="panel">
        <h2>Mark the court</h2>
        <p className="muted">
          Click the four corners of the court <b>on the floor</b>, in this order:{" "}
          {CORNER_NAMES.map((n, i) => (
            <span key={n} className={points.length === i ? "corner-tag next" : "corner-tag"}>
              {i + 1}. {n}
            </span>
          ))}
          . This lets us measure real distances in meters.
        </p>
        <div className="calib-stage">
          <video
            ref={video}
            src={src}
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration);
              e.currentTarget.currentTime = Math.min(1, e.currentTarget.duration / 2);
            }}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
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
            <div key={i} className="corner-dot" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
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
        <div className="row">
          <button className="ghost" onClick={() => setPoints(points.slice(0, -1))} disabled={!points.length}>
            Undo point
          </button>
          <button className="ghost" onClick={() => setPoints([])} disabled={!points.length}>
            Clear
          </button>
        </div>
      </div>

      <aside className="panel settings">
        <h2>Analysis settings</h2>
        <label>
          Pose model
          <select value={model} onChange={(e) => setModel(e.target.value as PoseModel)}>
            <option value="lite">Lite — fastest</option>
            <option value="full">Full — balanced</option>
            {!HOSTED && <option value="heavy">Heavy — most accurate</option>}
          </select>
        </label>
        <label>
          Frames analysed per second
          <select value={fps} onChange={(e) => setFps(Number(e.target.value))}>
            <option value={5}>5 — quick scan</option>
            <option value={10}>10 — recommended</option>
            <option value={15}>15 — best shot detection</option>
          </select>
        </label>
        <label>
          Swing detection sensitivity
          <select value={sensitivity} onChange={(e) => setSensitivity(e.target.value as Sensitivity)}>
            <option value="low">Low — only clear swings</option>
            <option value="medium">Medium</option>
            <option value="high">High — catch soft touches</option>
          </select>
        </label>
        <p className="muted small">
          Estimated time: ~{Math.max(1, Math.round(estMinutes))} min for a {fmtTime(duration)} clip
          (depends on your device).
        </p>
        <button className="primary" disabled={points.length !== 4} onClick={() => start(true)}>
          Analyze match
        </button>
        <button className="ghost" onClick={() => start(false)}>
          Skip calibration (approximate)
        </button>
        <button className="link" onClick={onBack}>
          ← Choose another video
        </button>
      </aside>
    </section>
  );
}
