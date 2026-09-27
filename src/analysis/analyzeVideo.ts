import { applyHomography, imageToCourtHomography, isOnCourt } from "./court";
import { createPoseLandmarker, type PoseModel } from "./pose";
import { LM, detectShots, groupRallies } from "./shots";
import { computePlayerStats } from "./stats";
import { PlayerTracker, canonicalPlayerOrder, dedupeDetections } from "./tracker";
import type { AnalysisResult, CourtCorners, FramePose, Pose, SampledFrame } from "./types";

export interface AnalyzeOptions {
  corners: CourtCorners;
  calibrated: boolean;
  sampleFps: number;
  model: PoseModel;
  minSwingSpeed: number;
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

export async function analyzeVideo(
  video: HTMLVideoElement,
  opts: AnalyzeOptions,
): Promise<AnalysisResult> {
  const landmarker = await createPoseLandmarker(opts.model);
  const H = imageToCourtHomography(opts.corners);
  const tracker = new PlayerTracker();
  const duration = video.duration;
  const step = 1 / opts.sampleFps;
  const frames: SampledFrame[] = [];

  try {
    for (let i = 0; i * step < duration; i++) {
      if (opts.signal?.aborted) throw new DOMException("Analysis cancelled", "AbortError");
      const t = i * step;
      await seek(video, t);
      const result = landmarker.detectForVideo(video, Math.round(t * 1000));

      const candidates: FramePose[] = result.landmarks
        .map((lms) => {
          const landmarks: Pose = lms.map((l) => ({ x: l.x, y: l.y, visibility: l.visibility }));
          return { playerId: -1, landmarks, court: applyHomography(H, feet(landmarks)) };
        })
        .filter((p) => isOnCourt(p.court));
      const kept = dedupeDetections(candidates.map((c) => c.court)).map((k) => candidates[k]);
      const ids = tracker.assign(t, kept.map((k) => k.court));
      kept.forEach((k, j) => (k.playerId = ids[j]));

      const frame = { t, poses: kept.filter((k) => k.playerId >= 0) };
      frames.push(frame);
      opts.onProgress?.(Math.min(1, (t + step) / duration), frame);
    }
  } finally {
    landmarker.close();
  }

  const mapping = canonicalPlayerOrder(frames);
  for (const f of frames) {
    f.poses = f.poses
      .map((p) => ({ ...p, playerId: mapping.get(p.playerId) ?? -1 }))
      .filter((p) => p.playerId >= 0);
  }

  const aspect = video.videoWidth / video.videoHeight || 16 / 9;
  const { shots, dominantHand } = detectShots(frames, { aspect, minSwingSpeed: opts.minSwingSpeed });
  return {
    duration,
    sampleFps: opts.sampleFps,
    frames,
    shots,
    rallies: groupRallies(shots),
    players: computePlayerStats(frames, shots, dominantHand, opts.sampleFps),
    calibrated: opts.calibrated,
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
