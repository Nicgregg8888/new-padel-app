import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { HOSTED } from "../lib/hosted";

export type PoseModel = "lite" | "full" | "heavy";

/** Served from public/mediapipe (copied from node_modules on install). */
const WASM_URL = `${import.meta.env.BASE_URL}mediapipe`;
const modelUrl = (m: PoseModel) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${m}/float16/latest/pose_landmarker_${m}.task`;

/**
 * Artifacts only serve web file types, so the hosted build ships each model
 * as base64 text next to the page and decodes it here.
 */
async function hostedModel(m: PoseModel): Promise<Uint8Array> {
  const res = await fetch(`${import.meta.env.BASE_URL}models/pose_landmarker_${m}.b64.txt`);
  if (!res.ok) throw new Error(`Could not load the ${m} pose model (${res.status})`);
  const bin = atob((await res.text()).trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function createPoseLandmarker(model: PoseModel): Promise<PoseLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const source = HOSTED ? { modelAssetBuffer: await hostedModel(model) } : { modelAssetPath: modelUrl(model) };
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { ...source, delegate },
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
