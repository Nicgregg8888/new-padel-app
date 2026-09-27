import { useEffect, useRef, useState } from "react";
import { frameAt } from "../analysis/stats";
import { PLAYER_COLORS } from "../analysis/tracker";
import type { AnalysisResult } from "../analysis/types";
import { drawBallTrail, drawPoses } from "../lib/draw";
import { SHOT_COLORS, SHOT_LABELS, fmtTime } from "../lib/format";
import { usePlayers } from "../lib/players";

export interface Clip {
  start: number;
  end: number;
  label: string;
}

export interface Playlist {
  title: string;
  clips: Clip[];
}

interface Props {
  src: string;
  result: AnalysisResult;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playlist: Playlist | null;
  onPlaylistEnd: () => void;
}

export function MatchPlayer({ src, result, videoRef, playlist, onPlaylistEnd }: Props) {
  const { name } = usePlayers();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [overlay, setOverlay] = useState(true);
  const [showBall, setShowBall] = useState(true);
  const ballTrack = result.ball?.track ?? [];
  const [time, setTime] = useState(0);
  const [clipIndex, setClipIndex] = useState(0);
  const clipRef = useRef(0);
  const nameRef = useRef(name);
  nameRef.current = name;

  // Start a new playlist from its first clip.
  useEffect(() => {
    clipRef.current = 0;
    setClipIndex(0);
    const v = videoRef.current;
    if (!v || !playlist?.clips.length) return;
    v.currentTime = playlist.clips[0].start;
    v.play().catch(() => {});
  }, [playlist, videoRef]);

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
          const frame = frameAt(result.frames, v.currentTime);
          if (frame && Math.abs(frame.t - v.currentTime) < 0.5) drawPoses(ctx, frame.poses, w, h, nameRef.current);
        }
        if (showBall && ballTrack.length) drawBallTrail(ctx, ballTrack, v.currentTime, w, h);
        setTime((prev) => (Math.abs(prev - v.currentTime) > 0.05 ? v.currentTime : prev));

        // Advance through the highlight playlist.
        const clip = playlist?.clips[clipRef.current];
        if (playlist && clip && !v.paused && v.currentTime >= clip.end) {
          const next = clipRef.current + 1;
          if (next < playlist.clips.length) {
            clipRef.current = next;
            setClipIndex(next);
            v.currentTime = playlist.clips[next].start;
          } else {
            v.pause();
            onPlaylistEnd();
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [overlay, showBall, ballTrack, result, videoRef, playlist, onPlaylistEnd]);

  const seek = (t: number) => {
    if (videoRef.current) videoRef.current.currentTime = t;
  };

  const recent = result.shots.filter((s) => s.t <= time && time - s.t < 1.2).at(-1);
  const clip = playlist?.clips[clipIndex];

  return (
    <div className="match-player">
      <div className="video-wrap">
        <video ref={videoRef} src={src} controls playsInline />
        <canvas ref={canvas} className="video-overlay" />
        {overlay && recent && (
          <div className="shot-flash" style={{ borderColor: SHOT_COLORS[recent.type] }}>
            <span style={{ color: PLAYER_COLORS[recent.playerId] }}>●</span> {name(recent.playerId)} ·{" "}
            {SHOT_LABELS[recent.type]}
            {recent.lob && " · lob"}
          </div>
        )}
      </div>
      {playlist && clip && (
        <div className="playlist-bar" role="status">
          <span className="playlist-count">
            {clipIndex + 1} / {playlist.clips.length}
          </span>
          <span className="playlist-title">
            {playlist.title} · <b>{clip.label}</b>
          </span>
          <button
            className="ghost small"
            onClick={() => {
              videoRef.current?.pause();
              onPlaylistEnd();
            }}
          >
            Stop
          </button>
        </div>
      )}
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
            title={`${fmtTime(s.t)} · ${name(s.playerId)} · ${SHOT_LABELS[s.type]}`}
            aria-label={`${fmtTime(s.t)} ${name(s.playerId)} ${SHOT_LABELS[s.type]}`}
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
          <input id="overlay-toggle" type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} />
          Show skeleton overlay
        </label>
        {ballTrack.length > 0 && (
          <label className="toggle">
            <input id="ball-toggle" type="checkbox" checked={showBall} onChange={(e) => setShowBall(e.target.checked)} />
            Show ball
          </label>
        )}
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
