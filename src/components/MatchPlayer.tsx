import { useEffect, useRef, useState } from "react";
import { PLAYER_COLORS } from "../analysis/tracker";
import type { AnalysisResult } from "../analysis/types";
import { drawPoses } from "../lib/draw";
import { SHOT_COLORS, SHOT_LABELS, fmtTime } from "../lib/format";

interface Props {
  src: string;
  result: AnalysisResult;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export function MatchPlayer({ src, result, videoRef }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [overlay, setOverlay] = useState(true);
  const [time, setTime] = useState(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      const c = canvas.current;
      if (v && c) {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(v.clientWidth * dpr);
        const h = Math.round(v.clientHeight * dpr);
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
        const ctx = c.getContext("2d")!;
        ctx.clearRect(0, 0, w, h);
        if (overlay) {
          const i = Math.round(v.currentTime * result.sampleFps);
          const frame = result.frames[Math.min(result.frames.length - 1, Math.max(0, i))];
          if (frame) drawPoses(ctx, frame.poses, w, h);
        }
        setTime((prev) => (Math.abs(prev - v.currentTime) > 0.05 ? v.currentTime : prev));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [overlay, result, videoRef]);

  const seek = (t: number) => {
    if (videoRef.current) videoRef.current.currentTime = t;
  };

  const recent = result.shots.filter((s) => s.t <= time && time - s.t < 1.2).at(-1);

  return (
    <div className="match-player">
      <div className="video-wrap">
        <video ref={videoRef} src={src} controls playsInline />
        <canvas ref={canvas} className="video-overlay" />
        {overlay && recent && (
          <div className="shot-flash" style={{ borderColor: SHOT_COLORS[recent.type] }}>
            <span style={{ color: PLAYER_COLORS[recent.playerId] }}>●</span> {SHOT_LABELS[recent.type]}
          </div>
        )}
      </div>
      <div className="timeline" aria-label="Shot timeline">
        {result.rallies.map((r, i) => (
          <div
            key={i}
            className="rally-band"
            style={{
              left: `${(r.start / result.duration) * 100}%`,
              width: `${((r.end - r.start) / result.duration) * 100}%`,
            }}
          />
        ))}
        {result.shots.map((s, i) => (
          <button
            key={i}
            className="shot-marker"
            title={`${fmtTime(s.t)} · ${SHOT_LABELS[s.type]}`}
            style={{
              left: `${(s.t / result.duration) * 100}%`,
              background: SHOT_COLORS[s.type],
              top: `${4 + s.playerId * 7}px`,
            }}
            onClick={() => seek(Math.max(0, s.t - 1))}
          />
        ))}
        <div className="playhead" style={{ left: `${(time / result.duration) * 100}%` }} />
      </div>
      <div className="row between">
        <label className="toggle">
          <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} />
          Show skeleton overlay
        </label>
        <div className="legend">
          {Object.entries(SHOT_LABELS).map(([k, label]) => (
            <span key={k}>
              <i style={{ background: SHOT_COLORS[k as keyof typeof SHOT_COLORS] }} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
