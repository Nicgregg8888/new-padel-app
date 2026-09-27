import type { BallObs, CourtCorners, SampledFrame } from "../analysis/types";
import { CHECKPOINTS, idbTx } from "./history";

/** Identifies a video file without reading it. */
export interface VideoFingerprint {
  name: string;
  size: number;
  lastModified: number;
}

export interface CheckpointSettings {
  corners: CourtCorners;
  sampleFps: number;
  model: string;
  minSwingSpeed: number;
  trackBall?: boolean;
  range?: { start: number; end: number };
}

export interface Resume {
  frames: SampledFrame[];
  ball: BallObs[];
  lastT: number;
  chunks: number;
}

interface Meta {
  id: string;
  savedAt: number;
  lastT: number;
  chunks: number;
  ball: BallObs[];
}

interface Packed {
  id: string;
  t: Float32Array;
  counts: Uint8Array;
  ids: Int8Array;
  courts: Float32Array;
  lms: Float32Array;
}

const LANDMARKS = 33;

/** Same file + same settings = same analysis, so it's safe to resume. */
export function checkpointKey(fp: VideoFingerprint, s: CheckpointSettings): string {
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return JSON.stringify([
    fp.name,
    fp.size,
    fp.lastModified,
    s.corners.map((c) => [r3(c.x), r3(c.y)]),
    s.sampleFps,
    s.model,
    s.minSwingSpeed,
    !!s.trackBall,
    s.range ? [r3(s.range.start), r3(s.range.end)] : null,
  ]);
}

/** Frames as flat typed arrays: ~6x smaller than objects and fast to store. */
export function packFrames(id: string, frames: SampledFrame[]): Packed {
  const total = frames.reduce((a, f) => a + f.poses.length, 0);
  const p: Packed = {
    id,
    t: new Float32Array(frames.length),
    counts: new Uint8Array(frames.length),
    ids: new Int8Array(total),
    courts: new Float32Array(total * 2),
    lms: new Float32Array(total * LANDMARKS * 3),
  };
  let k = 0;
  frames.forEach((f, i) => {
    p.t[i] = f.t;
    p.counts[i] = f.poses.length;
    for (const pose of f.poses) {
      p.ids[k] = pose.playerId;
      p.courts[k * 2] = pose.court.x;
      p.courts[k * 2 + 1] = pose.court.y;
      for (let j = 0; j < LANDMARKS; j++) {
        const l = pose.landmarks[j];
        const o = (k * LANDMARKS + j) * 3;
        p.lms[o] = l?.x ?? 0;
        p.lms[o + 1] = l?.y ?? 0;
        p.lms[o + 2] = l?.visibility ?? 0;
      }
      k++;
    }
  });
  return p;
}

export function unpackFrames(p: Omit<Packed, "id">): SampledFrame[] {
  const frames: SampledFrame[] = [];
  let k = 0;
  for (let i = 0; i < p.t.length; i++) {
    const poses = [];
    for (let n = 0; n < p.counts[i]; n++, k++) {
      const landmarks = [];
      for (let j = 0; j < LANDMARKS; j++) {
        const o = (k * LANDMARKS + j) * 3;
        landmarks.push({ x: p.lms[o], y: p.lms[o + 1], visibility: p.lms[o + 2] });
      }
      poses.push({ playerId: p.ids[k], landmarks, court: { x: p.courts[k * 2], y: p.courts[k * 2 + 1] } });
    }
    frames.push({ t: p.t[i], poses });
  }
  return frames;
}

const chunkId = (key: string, i: number) => `${key}#${i}`;

/** Append one chunk of new frames and update the progress marker. */
export async function saveCheckpoint(key: string, index: number, frames: SampledFrame[], lastT: number, ball: BallObs[]) {
  try {
    await idbTx(CHECKPOINTS, "readwrite", (s) => s.put(packFrames(chunkId(key, index), frames)));
    const meta: Meta = { id: key, savedAt: Date.now(), lastT, chunks: index + 1, ball };
    await idbTx(CHECKPOINTS, "readwrite", (s) => s.put(meta));
  } catch {
    // Storage full or unavailable: analysis carries on without checkpoints.
  }
}

export async function loadCheckpoint(key: string): Promise<Resume | null> {
  try {
    const meta = await idbTx<Meta | undefined>(CHECKPOINTS, "readonly", (s) => s.get(key));
    if (!meta) return null;
    const frames: SampledFrame[] = [];
    for (let i = 0; i < meta.chunks; i++) {
      const chunk = await idbTx<Packed | undefined>(CHECKPOINTS, "readonly", (s) => s.get(chunkId(key, i)));
      if (!chunk) return null;
      frames.push(...unpackFrames(chunk));
    }
    return { frames, ball: meta.ball, lastT: meta.lastT, chunks: meta.chunks };
  } catch {
    return null;
  }
}

export async function clearCheckpoint(key: string) {
  try {
    const meta = await idbTx<Meta | undefined>(CHECKPOINTS, "readonly", (s) => s.get(key));
    const n = meta?.chunks ?? 0;
    for (let i = 0; i < n; i++) await idbTx(CHECKPOINTS, "readwrite", (s) => s.delete(chunkId(key, i)));
    await idbTx(CHECKPOINTS, "readwrite", (s) => s.delete(key));
  } catch {
    // Nothing to clean up.
  }
}
