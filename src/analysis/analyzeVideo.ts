import type { AudioHits } from "./audio";
import { BallDetector, BallTracker, annotateShots, ballEvents, cleanTrack, torsoBoxes } from "./ball";
import { NET_Y, COURT_WIDTH, applyHomography, courtToImageHomography, imageToCourtHomography, isOnCourt } from "./court";
import { createPoseLandmarkers, type PoseModel } from "./pose";
import { LM, detectShots, groupRallies, markServes } from "./shots";
import { computePlayerStats, fillGaps, frameAt } from "./stats";
import { computeTeamTactics, rallyPatterns } from "./tactics";
import { computeTiles, focusTile, playArea, poseQuality, samePerson, tileToFrame, type Tile } from "./tiles";
import { PlayerTracker, canonicalPlayerOrder } from "./tracker";
import { knownDuration, seekTo } from "../lib/video";
import type { AnalysisResult, BallObs, CourtCorners, FramePose, Pose, SampledFrame } from "./types";

export interface AnalyzeOptions {
  corners: CourtCorners;
  calibrated: boolean;
  sampleFps: number;
  model: PoseModel;
  minSwingSpeed: number;
  /** Analyse only this part of the video (seconds). */
  range?: { start: number; end: number };
  /** Continue a saved partial analysis of the same video and settings. */
  resume?: { frames: SampledFrame[]; ball: BallObs[]; lastT: number };
  /** Called every ~15 s of video (or 20 s of work) with the frames sampled since the last call. */
  onCheckpoint?: (newFrames: SampledFrame[], lastT: number, ball: BallObs[]) => void;
  /** Ball hits heard in the soundtrack (used when they look like play). */
  audio?: AudioHits;
  /** Also look for the ball on every presented frame (beta). */
  trackBall?: boolean;
  onProgress?: (fraction: number, frame: SampledFrame) => void;
  signal?: AbortSignal;
}

/** Seek and wait for the frame (kept here for existing callers). */
export const seek = seekTo;

function feet(pose: Pose) {
  const l = pose[LM.leftAnkle];
  const r = pose[LM.rightAnkle];
  return { x: (l.x + r.x) / 2, y: Math.max(l.y, r.y) };
}

const hasFrameCallback = () =>
  typeof HTMLVideoElement !== "undefined" && "requestVideoFrameCallback" in HTMLVideoElement.prototype;

class StallError extends Error {}

/** Mean per-pixel change (0-255) between samples that means the picture cut to another shot (normal play stays under ~3). */
const SCENE_CUT_DIFF = 12;

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
  endAt: number,
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
      document.removeEventListener("visibilitychange", onVisible);
      video.pause();
      video.removeEventListener("ended", onEnded);
      if (err) reject(err);
      else resolve();
    };
    const onEnded = () => finish();
    // A background tab stops presenting frames: wait, then pick up again when
    // the tab is visible rather than treating it as a stall.
    const onVisible = () => {
      if (document.hidden || done) return;
      lastProgress = performance.now();
      if (video.paused) video.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    // Some browsers stop presenting frames for a video that isn't visible.
    const watchdog = setInterval(() => {
      if (signal?.aborted) finish(new DOMException("Analysis cancelled", "AbortError"));
      else if (document.hidden) lastProgress = performance.now();
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
      if (t > endAt) {
        finish();
        return;
      }
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
  const area = playArea(opts.corners, aspect);
  // The ball flies higher than players reach: allow more room above the court.
  const ballArea = playArea(opts.corners, aspect, 6);
  // Up to three people per tile (two players plus slack); overlaps are deduplicated below.
  const landmarkers = await createPoseLandmarkers(opts.model, tiles.length, 3);
  if (opts.signal?.aborted) {
    for (const l of landmarkers) l.close();
    throw new DOMException("Analysis cancelled", "AbortError");
  }
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
  const toImage = courtToImageHomography(opts.corners);

  // One landmarker per player for targeted "focus" crops.
  const focusLandmarkers = await createPoseLandmarkers(opts.model, 4, 1).catch((e) => {
    for (const l of landmarkers) l.close();
    throw e;
  });
  if (opts.signal?.aborted) {
    for (const l of [...landmarkers, ...focusLandmarkers]) l.close();
    throw new DOMException("Analysis cancelled", "AbortError");
  }
  const focusCanvas = (() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    return { canvas: c, ctx: c.getContext("2d")! };
  })();

  /** Run pose detection on one crop, with everything outside the playing area blanked. */
  const detectIn = (
    landmarker: (typeof landmarkers)[number],
    { canvas, ctx }: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D },
    tile: Tile,
    ts: number,
  ): (FramePose & { quality: number })[] => {
    // Blank everything outside the playing area (crowd, screens) so the
    // detector spends its attention on the players.
    ctx.fillStyle = "#7f7f7f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath();
    area.forEach((p, k) => {
      const x = ((p.x - tile.x) / tile.w) * canvas.width;
      const y = ((p.y - tile.y) / tile.h) * canvas.height;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.clip();
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
    ctx.restore();
    const out: (FramePose & { quality: number })[] = [];
    for (const lms of landmarker.detectForVideo(canvas, ts).landmarks) {
      const local: Pose = lms.map((l) => ({ x: l.x, y: l.y, visibility: l.visibility }));
      const landmarks = tileToFrame(local, tile);
      const court = applyHomography(H, feet(landmarks));
      if (isOnCourt(court)) out.push({ playerId: -1, landmarks, court, quality: poseQuality(local) });
    }
    return out;
  };

  // Ball tracking works on a small copy of every presented frame.
  const ballCanvas = document.createElement("canvas");
  ballCanvas.width = 384;
  ballCanvas.height = Math.round((384 * video.videoHeight) / Math.max(1, video.videoWidth));
  const ballCtx = ballCanvas.getContext("2d", { willReadFrequently: true })!;
  const ballDetector = new BallDetector();
  const ballTracker = new BallTracker();
  const findBall = (t: number) => {
    if (!opts.trackBall) return;
    ballCtx.drawImage(video, 0, 0, ballCanvas.width, ballCanvas.height);
    const img = ballCtx.getImageData(0, 0, ballCanvas.width, ballCanvas.height);
    const last = frames[frames.length - 1];
    ballTracker.push(t, ballDetector.detect(img, last ? torsoBoxes(last.poses) : [], ballArea));
  };

  const duration = await knownDuration(video);
  if (!(duration > 0)) throw new Error("Couldn't work out how long this video is. Try re-saving it as MP4");
  const start = Math.max(0, Math.min(opts.range?.start ?? 0, duration));
  const end = Math.max(start + 0.5, Math.min(opts.range?.end ?? duration, duration));
  const step = 1 / opts.sampleFps;
  const tracker = new PlayerTracker();
  const frames: SampledFrame[] = opts.resume ? [...opts.resume.frames] : [];
  const priorBall = opts.resume?.ball ?? [];
  if (opts.resume && frames.length) {
    const last = frames[frames.length - 1];
    tracker.seed(last.t, last.poses.map((p) => ({ id: p.playerId, pos: p.court })));
  }
  let checkpointed = frames.length;
  let lastCheckpointAt = performance.now();
  // Save every ~15 s of video, or every 20 s of work on slow devices.
  const CHECKPOINT_FRAMES = 150;
  const CHECKPOINT_MS = 20_000;
  let lastTs = -1;

  // Cut detection: a sudden change of the whole picture between samples.
  const cutCanvas = document.createElement("canvas");
  cutCanvas.width = 64;
  cutCanvas.height = 36;
  const cutCtx = cutCanvas.getContext("2d", { willReadFrequently: true })!;
  let prevThumb: Uint8ClampedArray | null = null;
  const isCut = () => {
    cutCtx.drawImage(video, 0, 0, 64, 36);
    const thumb = cutCtx.getImageData(0, 0, 64, 36).data;
    const prev = prevThumb;
    prevThumb = thumb;
    if (!prev) return false;
    let diff = 0;
    for (let i = 0; i < thumb.length; i += 4) diff += Math.abs(thumb[i] - prev[i]) + Math.abs(thumb[i + 1] - prev[i + 1]);
    return diff / (64 * 36 * 2) > SCENE_CUT_DIFF;
  };

  const processFrame = (t: number) => {
    if (isCut()) tracker.cut();
    // MediaPipe requires strictly increasing timestamps.
    const ts = Math.max(lastTs + 1, Math.round(t * 1000));
    lastTs = ts;
    const candidates: (FramePose & { quality: number })[] = [];
    tiles.forEach((tile, i) => candidates.push(...detectIn(landmarkers[i], canvases[i], tile, ts)));
    // The same player can show up in two overlapping tiles: keep the better view.
    candidates.sort((a, b) => b.quality - a.quality);
    // Best first; drop anything that is the same body as one already kept.
    const kept: FramePose[] = [];
    for (const c of candidates) {
      if (kept.some((k) => samePerson(k.landmarks, c.landmarks))) continue;
      const { quality: _q, ...pose } = c;
      kept.push(pose);
    }
    const ids = tracker.assign(t, kept.map((k) => k.court));
    kept.forEach((k, j) => (k.playerId = ids[j]));
    const found = kept.filter((k) => k.playerId >= 0);

    // Players we knew about but missed this time: look again, zoomed in on
    // where they were. Small far-side players are often found this way.
    for (const { id, pos } of tracker.missing(t)) {
      if (id >= focusLandmarkers.length) continue;
      const tile = focusTile(applyHomography(toImage, pos), opts.corners, pos, aspect);
      const best = detectIn(focusLandmarkers[id], focusCanvas, tile, ts)
        .filter((c) => Math.hypot(c.court.x - pos.x, c.court.y - pos.y) < 4)
        // Not someone we already have (the crop can include a nearby partner).
        .filter((c) => !found.some((f) => samePerson(f.landmarks, c.landmarks)))
        .sort((a, b) => b.quality - a.quality)[0];
      if (best && tracker.confirm(id, t, best.court)) {
        const { quality: _q, ...pose } = best;
        found.push({ ...pose, playerId: id });
      }
    }
    const frame = { t, poses: found };
    frames.push(frame);
    const fresh = frames.length - checkpointed;
    if (
      opts.onCheckpoint &&
      (fresh >= CHECKPOINT_FRAMES || (fresh >= 10 && performance.now() - lastCheckpointAt > CHECKPOINT_MS))
    ) {
      lastCheckpointAt = performance.now();
      opts.onCheckpoint(frames.slice(checkpointed), t, cleanTrack([...priorBall, ...ballTracker.result()]));
      checkpointed = frames.length;
    }
    opts.onProgress?.(Math.min(1, Math.max(0, (t + step - start) / (end - start))), frame);
  };

  try {
    // The first inference is slow (model and GPU warm-up): do it on a paused
    // frame so playback doesn't run ahead of us.
    const from = opts.resume ? Math.min(end - step, opts.resume.lastT + step) : start;
    await seek(video, from);
    findBall(from);
    processFrame(from);
    let fast = hasFrameCallback();
    if (fast) {
      try {
        // Faster than real time when only poses are needed; real time when
        // following the ball, which needs every frame.
        await samplePlayback(video, opts.trackBall ? 1 : 2, opts.sampleFps, from + step, end, processFrame, findBall, opts.signal);
      } catch (e) {
        if (!(e instanceof StallError)) throw e;
        fast = false;
      }
    }
    if (!fast) {
      // Slow but dependable: seek to every sample.
      // Pick up where fast playback stopped instead of starting over.
      const resumeAt = frames.length ? frames[frames.length - 1].t + step : start;
      for (let t = resumeAt; t < end; t += step) {
        if (opts.signal?.aborted) throw new DOMException("Analysis cancelled", "AbortError");
        await seek(video, t);
        findBall(t);
        processFrame(t);
      }
    }
  } finally {
    for (const l of [...landmarkers, ...focusLandmarkers]) l.close();
  }

  const mapping = canonicalPlayerOrder(frames);
  for (const f of frames) {
    f.poses = f.poses
      .map((p) => ({ ...p, playerId: mapping.get(p.playerId) ?? -1 }))
      .filter((p) => p.playerId >= 0);
  }

  const useAudio = !!opts.audio?.usable;
  const filled = fillGaps(frames);
  frames.splice(0, frames.length, ...filled);
  const detected = detectShots(frames, {
    aspect,
    minSwingSpeed: opts.minSwingSpeed,
    ...(useAudio ? { hits: opts.audio!.times.filter((t) => t >= start && t <= end) } : {}),
  });
  const { dominantHand } = detected;
  let shots = detected.shots;

  let ball: AnalysisResult["ball"];
  if (opts.trackBall) {
    const track = cleanTrack([...priorBall, ...ballTracker.result()].sort((a, b) => a.t - b.t));
    const wristsAt = (t: number) =>
      (frameAt(frames, t)?.poses ?? []).flatMap((p) =>
        [LM.leftWrist, LM.rightWrist]
          .filter((i) => p.landmarks[i] && p.landmarks[i].visibility > 0.3)
          .map((i) => ({ playerId: p.playerId, p: p.landmarks[i] })),
      );
    const events = ballEvents(track, wristsAt);
    const toImage = courtToImageHomography(opts.corners);
    const farY = (applyHomography(toImage, { x: 0, y: 0 }).y + applyHomography(toImage, { x: COURT_WIDTH, y: 0 }).y) / 2;
    const netY = (applyHomography(toImage, { x: 0, y: NET_Y }).y + applyHomography(toImage, { x: COURT_WIDTH, y: NET_Y }).y) / 2;
    shots = annotateShots(shots, track, events, farY, Math.max(netY - farY, 0.02));
    ball = { track, events };
  }
  const rallies = rallyPatterns(frames, groupRallies(shots));
  shots = markServes(shots, rallies);

  return {
    duration,
    sampleFps: frames.length / Math.max(end - start, 1e-3),
    frames,
    shots,
    rallies,
    players: computePlayerStats(frames, shots, dominantHand),
    teams: computeTeamTactics(frames),
    calibrated: opts.calibrated,
    ball,
    ...(opts.audio ? { audio: { used: useAudio, pops: opts.audio.times.length } } : {}),
    ...(start > 0.05 || end < duration - 0.05 ? { range: { start, end } } : {}),
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
