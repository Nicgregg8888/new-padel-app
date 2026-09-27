import fixWebmDuration from "fix-webm-duration";
import { frameAt } from "../analysis/stats";
import type { BallObs, SampledFrame } from "../analysis/types";
import type { Clip } from "../components/MatchPlayer";
import { drawBallTrail, drawPoses } from "./draw";
import { loadHiddenVideo, seekTo } from "./video";

export interface ReelInput {
  src: string;
  title: string;
  clips: Clip[];
  frames: SampledFrame[];
  ball: BallObs[];
  name: (id: number) => string;
  width?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Keep exports shareable: at most this many seconds of footage. */
export const MAX_REEL_SECONDS = 180;

export function reelDuration(clips: Clip[]): number {
  return clips.reduce((a, c) => a + Math.max(0, c.end - c.start), 0);
}

/** Trim a playlist to the export limit, keeping whole clips. */
export function limitClips(clips: Clip[], maxSeconds = MAX_REEL_SECONDS): Clip[] {
  const out: Clip[] = [];
  let total = 0;
  for (const c of clips) {
    const d = c.end - c.start;
    if (total + d > maxSeconds && out.length) break;
    out.push(c);
    total += d;
  }
  return out;
}

function pickMime(): string {
  const options = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

export function canExportVideo(): boolean {
  return typeof MediaRecorder !== "undefined" && !!pickMime() && "captureStream" in HTMLCanvasElement.prototype;
}

/**
 * Plays each clip into a canvas with the skeletons, ball trail and a caption
 * drawn on top, and records the canvas. Runs in real time, so the tab must
 * stay visible while it records.
 */
export async function renderReel(input: ReelInput): Promise<Blob> {
  const { clips } = input;
  if (!clips.length) throw new Error("Nothing to export.");
  const video = await loadHiddenVideo(input.src, { attach: true });
  try {
    const W = Math.min(input.width ?? 1280, video.videoWidth || 1280);
    const H = Math.round((W * video.videoHeight) / Math.max(1, video.videoWidth));
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(30);
    const mimeType = pickMime();
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((r) => (recorder.onstop = () => r()));

    const total = reelDuration(clips);
    let doneSeconds = 0;
    const unit = Math.max(14, H / 28);

    const draw = (clip: Clip, index: number) => {
      ctx.drawImage(video, 0, 0, W, H);
      const f = frameAt(input.frames, video.currentTime);
      if (f && Math.abs(f.t - video.currentTime) < 0.5) drawPoses(ctx, f.poses, W, H, input.name);
      if (input.ball.length) drawBallTrail(ctx, input.ball, video.currentTime, W, H);
      // Caption bar.
      ctx.fillStyle = "rgba(10,14,20,0.78)";
      ctx.fillRect(0, H - unit * 2.4, W, unit * 2.4);
      ctx.fillStyle = "#e6edf6";
      ctx.font = `700 ${unit}px Inter, system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(clip.label, unit, H - unit * 1.2);
      ctx.fillStyle = "#8b9ab0";
      ctx.font = `500 ${unit * 0.8}px Inter, system-ui, sans-serif`;
      const count = `${index + 1}/${clips.length} · ${input.title}`;
      ctx.textAlign = "right";
      ctx.fillText(count.length > 60 ? `${count.slice(0, 59)}…` : count, W - unit, H - unit * 1.2);
      ctx.textAlign = "left";
      // Watermark.
      ctx.fillStyle = "#d4ff3a";
      ctx.font = `800 ${unit * 0.9}px Inter, system-ui, sans-serif`;
      ctx.fillText("PadelVision", unit, unit * 1.2);
    };

    recorder.start(250);
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      if (input.signal?.aborted) break;
      recorder.pause();
      await seekTo(video, clip.start);
      draw(clip, i);
      recorder.resume();
      await video.play();
      await new Promise<void>((resolve) => {
        const tick = () => {
          if (input.signal?.aborted || video.currentTime >= clip.end || video.ended) {
            video.pause();
            resolve();
            return;
          }
          draw(clip, i);
          input.onProgress?.(Math.min(1, (doneSeconds + video.currentTime - clip.start) / total));
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      doneSeconds += clip.end - clip.start;
    }
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    if (input.signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
    input.onProgress?.(1);
    // Recorded WebM has no duration in its header, which breaks seeking in
    // many players; write it in.
    const raw = new Blob(chunks, { type: "video/webm" });
    try {
      return await fixWebmDuration(raw, Math.round(reelDuration(clips) * 1000), { logger: false });
    } catch {
      return raw;
    }
  } finally {
    video.pause();
    video.remove();
  }
}
