import { bestSnapshot } from "../analysis/snapshot";
import type { SampledFrame } from "../analysis/types";
import { loadHiddenVideo, seekTo } from "./video";

const W = 120;
const H = 160;

/** A small photo of each player, cut from the frame that shows them best. */
export async function playerPhotos(src: string, frames: SampledFrame[], ids: number[]): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  let video: HTMLVideoElement | null = null;
  try {
    video = await loadHiddenVideo(src);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return out;
    for (const id of ids) {
      const snap = bestSnapshot(frames, id);
      if (!snap) continue;
      await seekTo(video, snap.t);
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const { x, y, w, h } = snap.box;
      // Widen or heighten the crop to the tile's 3:4 shape, keeping the body centred.
      let sw = w * vw;
      let sh = h * vh;
      if (sw / sh < W / H) sw = (sh * W) / H;
      else sh = (sw * H) / W;
      sw = Math.min(sw, vw);
      sh = Math.min(sh, vh);
      const sx = Math.min(Math.max(0, (x + w / 2) * vw - sw / 2), vw - sw);
      const sy = Math.min(Math.max(0, (y + h / 2) * vh - sh / 2), vh - sh);
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
      out[id] = canvas.toDataURL("image/jpeg", 0.8);
    }
  } catch {
    // No photos: names still work without them.
  } finally {
    video?.removeAttribute("src");
    video?.load();
  }
  return out;
}
