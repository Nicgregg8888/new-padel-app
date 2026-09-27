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
        <h2>Mark the court</h2>
        {detect === "found" && points.length === 4 ? (
          <p className="muted">
            <b className="ok-text">Court found automatically.</b> Check the yellow lines sit on the court lines;
            drag any numbered corner to adjust.
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
            Find court on this frame
          </button>
          <button className="ghost" onClick={() => setPoints(points.slice(0, -1))} disabled={!points.length}>
            Undo point
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
        <label className="toggle">
          <input id="use-audio" type="checkbox" checked={useAudio} onChange={(e) => setUseAudio(e.target.checked)} />
          Use the sound to find shots
        </label>
        <p className="muted small">The pop of the ball on the racket pinpoints each shot. Turn off if the video has music over it.</p>
        <label className="toggle">
          <input id="track-ball" type="checkbox" checked={trackBall} onChange={(e) => setTrackBall(e.target.checked)} />
          Track the ball (beta)
        </label>
        <p className="muted small">Ball tracking reads every frame, so analysis takes about as long as the video.</p>
        <p className="muted small">
          Estimated time: ~{Math.max(1, Math.round(trackBall ? Math.max(estMinutes, span / 60) : estMinutes))} min for{" "}
          {fmtTime(span)} of video
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
