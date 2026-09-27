import { LM } from "../src/analysis/shots";
import type { FramePose, Point, Pose } from "../src/analysis/types";

/**
 * A synthetic standing player seen from behind (near team): their right side is
 * on the image right. Coordinates are normalized image units.
 */
export function makePose(center: Point, opts: { rightWrist?: Point; leftWrist?: Point } = {}): Pose {
  const pose: Pose = Array.from({ length: 33 }, () => ({ x: center.x, y: center.y, visibility: 1 }));
  const set = (i: number, dx: number, dy: number) => (pose[i] = { x: center.x + dx, y: center.y + dy, visibility: 1 });
  set(LM.nose, 0, -0.1);
  set(LM.leftShoulder, -0.02, -0.07);
  set(LM.rightShoulder, 0.02, -0.07);
  set(LM.leftHip, -0.015, 0);
  set(LM.rightHip, 0.015, 0);
  set(LM.leftAnkle, -0.01, 0.08);
  set(LM.rightAnkle, 0.01, 0.08);
  const lw = opts.leftWrist ?? { x: -0.025, y: -0.01 };
  const rw = opts.rightWrist ?? { x: 0.025, y: -0.01 };
  set(LM.leftWrist, lw.x, lw.y);
  set(LM.rightWrist, rw.x, rw.y);
  return pose;
}

export function framePose(playerId: number, center: Point, court: Point, wrists = {}): FramePose {
  return { playerId, landmarks: makePose(center, wrists), court };
}
