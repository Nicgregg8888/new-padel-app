import type { SampledFrame } from "./types";

export interface Snapshot {
  t: number;
  /** Crop in normalised frame coordinates, a little larger than the body. */
  box: { x: number; y: number; w: number; h: number };
}

const MIN_VISIBILITY = 0.5;

/**
 * The frame that shows a player best: the whole body clearly visible and as
 * large as possible, well away from the other players so the crop is theirs.
 */
export function bestSnapshot(frames: SampledFrame[], playerId: number): Snapshot | null {
  let best: { score: number; snap: Snapshot } | null = null;
  for (const f of frames) {
    const pose = f.poses.find((p) => p.playerId === playerId);
    if (!pose || pose.interpolated || pose.landmarks.length < 33) continue;
    const seen = pose.landmarks.filter((l) => (l.visibility ?? 1) >= MIN_VISIBILITY);
    if (seen.length < 20) continue;
    const xs = seen.map((l) => l.x);
    const ys = seen.map((l) => l.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const h = y1 - y0;
    if (h <= 0) continue;
    // Pad around the body and keep a portrait crop.
    const ch = h * 1.35;
    const cw = Math.max(x1 - x0 + h * 0.2, ch * 0.75);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const box = {
      x: Math.max(0, cx - cw / 2),
      y: Math.max(0, cy - ch / 2),
      w: Math.min(cw, 1),
      h: Math.min(ch, 1),
    };
    // Another player overlapping the crop makes it ambiguous.
    const crowded = f.poses.some(
      (o) =>
        o !== pose &&
        o.landmarks.length >= 33 &&
        Math.abs(o.landmarks[0].x - cx) < cw * 0.6 &&
        Math.abs(o.landmarks[0].y - cy) < ch * 0.6,
    );
    const score = h * (seen.length / 33) * (crowded ? 0.3 : 1);
    if (!best || score > best.score) best = { score, snap: { t: f.t, box } };
  }
  return best?.snap ?? null;
}
