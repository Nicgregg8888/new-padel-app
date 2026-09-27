// Copies the MediaPipe WASM runtime into public/ so the app serves it itself
// instead of depending on a CDN at runtime.
import { cpSync, existsSync } from "node:fs";

const src = "node_modules/@mediapipe/tasks-vision/wasm";
if (existsSync(src)) {
  cpSync(src, "public/mediapipe", { recursive: true });
}
