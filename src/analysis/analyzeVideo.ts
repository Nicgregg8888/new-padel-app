import { BallDetector, BallTracker, annotateShots, ballEvents, cleanTrack, torsoBoxes } from "./ball";
import { NET_Y, COURT_WIDTH, applyHomography, courtToImageHomography, imageToCourtHomography, isOnCourt } from "./court";
import { createPoseLandmarkers, type PoseModel } from "./pose";
import { LM, detectShots, groupRallies, markServes } from "./shots";
import { computePlayerStats, frameAt } from "./stats";
import { computeTeamTactics } from "./tactics";
import { computeTiles, poseQuality, tileToFrame } from "./tiles";
import { PlayerTracker, canonicalPlayerOrder, dedupeDetections } from "./tracker";
import type { AnalysisResult, CourtCorners, FramePose, Pose, SampledFrame } from "./types";

export interface AnalyzeOptions {
  corners: CourtCorners;
  calibrated: boolean;
  sampleFps: number;
  model: PoseModel;
  minSwingSpeed: number;
  /** Also look for the ball on every presented frame (beta). */
  trackBall?: boolean;
  onProgress?: (fraction: number, frame: SampledFrame) => void;
  signal?: AbortSignal;
}

export function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - t) < 1e-3 && video.readyState >= 2) return resolve();
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener("seeked", done);
      resolve();
    };
    const timer = setTimeout(done, 3000);
    video.addEventListener("seeked", done);
    video.currentTime = t;
  });
}

function feet(pose: Pose) {
  const l = pose[LM.leftAnkle];
  const r = pose[LM.rightAnkle];
  return { x: (l.x + r.x) / 2, y: Math.max(l.y, r.y) };
}

const hasFrameCallback = () =>
  typeof HTMLVideoElement !== "undefined" && "requestVideoFrameCallback" in HTMLVideoElement.prototype;

class StallError extends Error {}

/**
 * Fast path: play the video and grab samples as frames are presented,
 * pausing while each one is analysed so nothing is skipped however slow the
 * device is. Much faster than seeking, which re-decodes from the previous
 * keyframe for every sample.
 */
function samplePlayback(
  video: HTMLVideoElement,
  playbackRate: number,
  sampleFps: number,
  startAt: number,
  onSample: (t: number) => void,
  onPresented: (t: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const step = 1 / sampleFps;
    let next = startAt;
    let lastProgress = performance.now();
    let done = false;
    const finish = (err?: unknown) => {
      if (done) return;
      done = true;
      clearInterval(watchdog);
      video.pause();
      video.removeEventListener("ended", onEnded);
      if (err) reject(err);
      else resolve();
    };
    const onEnded = () => finish();
    // Some browsers stop presenting frames for a video that isn't visible.
    const watchdog = setInterval(() => {
      if (signal?.aborted) finish(new DOMException("Analysis cancelled", "AbortError"));
      else if (performance.now() - lastProgress > 5000) finish(new StallError("Playback stalled"));
    }, 500);

    const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (done) return;
      if (signal?.aborted) {
        finish(new DOMException("Analysis cancelled", "AbortError"));
        return;
      }
      lastProgress = performance.now();
      const t = meta.mediaTime;
      try {
        onPresented(t);
      } catch (e) {
        finish(e);
        return;
      }
      if (t >= next - 1e-3) {
        video.pause();
        try {
          onSample(t);
        } catch (e) {
          finish(e);
          return;
        }
        lastProgress = performance.now();
        next = t + step;
        video.requestVideoFrameCallback(onFrame);
        video.play().catch((e) => finish(new StallError(String(e))));
        return;
      }
      video.requestVideoFrameCallback(onFrame);
    };

    video.addEventListener("ended", onEnded);
    video.muted = true;
    video.playbackRate = playbackRate;
    video.requestVideoFrameCallback(onFrame);
    video.play().catch((e) => finish(new StallError(String(e))));
  });
}

export async function analyzeVideo(
  video: HTMLVideoElement,
  opts: AnalyzeOptions,
): Promise<AnalysisResult> {
  const aspect = video.videoWidth / video.videoHeight || 16 / 9;
  const tiles = computeTiles(opts.corners, aspect);
  // Two players per half of the court, per tile; overlaps are deduplicated below.
  const landmarkers = await createPoseLandmarkers(opts.model, tiles.length, 2);
  const MAX_TILE_SIDE = 640;
  const canvases = tiles.map((t) => {
    const w = t.w * video.videoWidth;
    const h = t.h * video.videoHeight;
    const scale = Math.min(1, MAX_TILE_SIDE / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.max(32, Math.round(w * scale));
    c.height = Math.max(32, Math.round(h * scale));
    return { canvas: c, ctx: c.getContext("2d", { willReadFrequently: false })! };
  });
  const H = imageToCourtHomography(opts.corners);

  // Ball tracking works on a small copy of every presented frame.
  const ballCanvas = document.createElement("canvas");
  ballCanvas.width = 384;
  ballCanvas.height = Math.round((384 * video.videoHeight) / Math.max(1, video.videoWidth));
  const ballCtx = ballCanvas.getContext("2d", { willReadFrequently: true })!;
  const ballDetector = new BallDetector();
  let ballTracker = new BallTracker();
  const findBall = (t: number) => {
    if (!opts.trackBall) return;
    ballCtx.drawImage(video, 0, 0, ballCanvas.width, ballCanvas.height);
    const img = ballCtx.getImageData(0, 0, ballCanvas.width, ballCanvas.height);
    const last = frames[frames.length - 1];
    const cands = ballDetector.detect(img, last ? torsoBoxes(last.poses) : []);
    ballTracker.push(t, cands);
  };

  const duration = video.duration;
  const step = 1 / opts.sampleFps;
  let tracker = new PlayerTracker();
  let frames: SampledFrame[] = [];
  let lastTs = -1;

  const processFrame = (t: number) => {
    // MediaPipe requires strictly increasing timestamps.
    const ts = Math.max(lastTs + 1, Math.round(t * 1000));
    lastTs = ts;
    const candidates: (FramePose & { quality: number })[] = [];
    tiles.forEach((tile, i) => {
      const { canvas, ctx } = canvases[i];
      ctx.drawImage(
        video,
        tile.x * video.videoWidth,
        tile.y * video.videoHeight,
        tile.w * video.videoWidth,
        tile.h * video.videoHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const result = landmarkers[i].detectForVideo(canvas, ts);
      for (const lms of result.landmarks) {
        const local: Pose = lms.map((l) => ({ x: l.x, y: l.y, visibility: l.visibility }));
        const landmarks = tileToFrame(local, tile);
        const court = applyHomography(H, feet(landmarks));
        if (isOnCourt(court)) candidates.push({ playerId: -1, landmarks, court, quality: poseQuality(local) });
      }
    });
    // The same player can show up in two overlapping tiles: keep the better view.
    candidates.sort((a, b) => b.quality - a.quality);
    const kept: FramePose[] = dedupeDetections(candidates.map((c) => c.court)).map((k) => {
      const { quality: _q, ...pose } = candidates[k];
      return pose;
    });
    const ids = tracker.assign(t, kept.map((k) => k.court));
    kept.forEach((k, j) => (k.playerId = ids[j]));
    const frame = { t, poses: kept.filter((k) => k.playerId >= 0) };
    frames.push(frame);
    opts.onProgress?.(Math.min(1, (t + step) / duration), frame);
  };

  try {
    // The first inference is slow (model and GPU warm-up): do it on a paused
    // frame so playback doesn't run ahead of us.
    await seek(video, 0);
    findBall(0);
    processFrame(0);
    let fast = hasFrameCallback();
    if (fast) {
      try {
        // Faster than real time when only poses are needed; real time when
        // following the ball, which needs every frame.
        await samplePlayback(video, opts.trackBall ? 1 : 2, opts.sampleFps, step, processFrame, findBall, opts.signal);
      } catch (e) {
        if (!(e instanceof StallError)) throw e;
        fast = false;
      }
    }
    if (!fast) {
      // Slow but dependable: seek to every sample.
      tracker = new PlayerTracker();
      ballTracker = new BallTracker();
      frames = [];
      for (let i = 0; i * step < duration; i++) {
        if (opts.signal?.aborted) throw new DOMException("Analysis cancelled", "AbortError");
        await seek(video, i * step);
        findBall(i * step);
        processFrame(i * step);
      }
    }
  } finally {
    for (const l of landmarkers) l.close();
  }

  const mapping = canonicalPlayerOrder(frames);
  for (const f of frames) {
    f.poses = f.poses
      .map((p) => ({ ...p, playerId: mapping.get(p.playerId) ?? -1 }))
      .filter((p) => p.playerId >= 0);
  }

  const detected = detectShots(frames, { aspect, minSwingSpeed: opts.minSwingSpeed });
  const { dominantHand } = detected;
  let shots = detected.shots;

  let ball: AnalysisResult["ball"];
  if (opts.trackBall) {
    const track = cleanTrack(ballTracker.result());
    const wristsAt = (t: number) =>
      (frameAt(frames, t)?.poses ?? []).flatMap((p) =>
        [LM.leftWrist, LM.rightWrist]
          .filter((i) => p.landmarks[i].visibility > 0.3)
          .map((i) => ({ playerId: p.playerId, p: p.landmarks[i] })),
      );
    const events = ballEvents(track, wristsAt);
    const toImage = courtToImageHomography(opts.corners);
    const farY = (applyHomography(toImage, { x: 0, y: 0 }).y + applyHomography(toImage, { x: COURT_WIDTH, y: 0 }).y) / 2;
    const netY = (applyHomography(toImage, { x: 0, y: NET_Y }).y + applyHomography(toImage, { x: COURT_WIDTH, y: NET_Y }).y) / 2;
    shots = annotateShots(shots, track, events, farY, Math.max(netY - farY, 0.02));
    ball = { track, events };
  }
  const rallies = groupRallies(shots);
  shots = markServes(shots, rallies);

  return {
    duration,
    sampleFps: frames.length / Math.max(duration, 1e-3),
    frames,
    shots,
    rallies,
    players: computePlayerStats(frames, shots, dominantHand),
    teams: computeTeamTactics(frames),
    calibrated: opts.calibrated,
    ball,
  };
}

/** Grab JPEG stills at the given times (for the AI coach). */
export async function captureFrames(
  video: HTMLVideoElement,
  times: number[],
  maxWidth = 768,
): Promise<Blob[]> {
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d")!;
  const out: Blob[] = [];
  for (const t of times) {
    await seek(video, t);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    out.push(
      await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not capture a frame"))), "image/jpeg", 0.75),
      ),
    );
  }
  return out;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
