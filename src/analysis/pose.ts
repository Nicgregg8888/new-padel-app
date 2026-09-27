import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

export type PoseModel = "lite" | "full" | "heavy";

/** Served from public/mediapipe (copied from node_modules on install). */
const WASM_URL = `${import.meta.env.BASE_URL}mediapipe`;
const modelUrl = (m: PoseModel) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${m}/float16/latest/pose_landmarker_${m}.task`;

export async function createPoseLandmarker(model: PoseModel): Promise<PoseLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: modelUrl(model), delegate },
    runningMode: "VIDEO" as const,
    // Four players on court, plus headroom for the odd spectator we filter out later.
    numPoses: 6,
    minPoseDetectionConfidence: 0.4,
    minPosePresenceConfidence: 0.4,
    minTrackingConfidence: 0.4,
  });
  try {
    return await PoseLandmarker.createFromOptions(fileset, options("GPU"));
  } catch {
    return await PoseLandmarker.createFromOptions(fileset, options("CPU"));
  }
}
