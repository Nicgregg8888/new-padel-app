import { COURT_LENGTH, COURT_WIDTH, NET_Y, SERVICE_LINE_OFFSET, applyHomography, type Homography } from "../analysis/court";
import { PLAYER_COLORS, playerIdentity } from "../analysis/tracker";
import type { FramePose, Point } from "../analysis/types";

/** Body connections worth drawing (MediaPipe indices); face detail is skipped. */
const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32],
];

export function drawPoses(
  ctx: CanvasRenderingContext2D,
  poses: FramePose[],
  w: number,
  h: number,
  label: (id: number) => string = (id) => playerIdentity(id).label.split(" ")[0],
) {
  const unit = Math.max(2, h / 300);
  for (const pose of poses) {
    const color = PLAYER_COLORS[pose.playerId] ?? "#e5e7eb";
    const lm = pose.landmarks;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = unit;
    ctx.lineCap = "round";
    for (const [a, b] of BONES) {
      if (lm[a].visibility < 0.3 || lm[b].visibility < 0.3) continue;
      ctx.beginPath();
      ctx.moveTo(lm[a].x * w, lm[a].y * h);
      ctx.lineTo(lm[b].x * w, lm[b].y * h);
      ctx.stroke();
    }
    for (const i of [15, 16]) {
      if (lm[i].visibility < 0.3) continue;
      ctx.beginPath();
      ctx.arc(lm[i].x * w, lm[i].y * h, unit * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (pose.playerId >= 0) {
      const head = lm[0];
      const text = label(pose.playerId);
      ctx.font = `600 ${unit * 7}px Inter, system-ui, sans-serif`;
      const tw = ctx.measureText(text).width;
      const x = head.x * w - tw / 2 - unit * 2;
      const y = head.y * h - unit * 16;
      ctx.fillStyle = "rgba(10,14,20,0.8)";
      ctx.fillRect(x, y, tw + unit * 4, unit * 9);
      ctx.fillStyle = color;
      ctx.fillText(text, x + unit * 2, y + unit * 7);
    }
  }
}

/** Court lines (in meters) as segments, for drawing over the video via a court->image homography. */
export function courtLines(): [Point, Point][] {
  const s1 = NET_Y - SERVICE_LINE_OFFSET;
  const s2 = NET_Y + SERVICE_LINE_OFFSET;
  const cx = COURT_WIDTH / 2;
  return [
    [{ x: 0, y: 0 }, { x: COURT_WIDTH, y: 0 }],
    [{ x: COURT_WIDTH, y: 0 }, { x: COURT_WIDTH, y: COURT_LENGTH }],
    [{ x: COURT_WIDTH, y: COURT_LENGTH }, { x: 0, y: COURT_LENGTH }],
    [{ x: 0, y: COURT_LENGTH }, { x: 0, y: 0 }],
    [{ x: 0, y: NET_Y }, { x: COURT_WIDTH, y: NET_Y }],
    [{ x: 0, y: s1 }, { x: COURT_WIDTH, y: s1 }],
    [{ x: 0, y: s2 }, { x: COURT_WIDTH, y: s2 }],
    [{ x: cx, y: s1 }, { x: cx, y: s2 }],
  ];
}

export function projectedCourtLines(h: Homography) {
  return courtLines().map(([a, b]) => [applyHomography(h, a), applyHomography(h, b)] as const);
}
