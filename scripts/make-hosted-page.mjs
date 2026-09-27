// Turns the `vite build --mode hosted` output into a claude.ai Artifact bundle:
// a skeleton-less page.html (the Artifact publisher adds <html>/<head>/<body>),
// plus the pose models, which must ship with the page because it can't fetch
// from other hosts. Artifacts only serve web file types, so each model goes out
// as base64 text (src/analysis/pose.ts decodes it).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const out = "dist-hosted";
const html = readFileSync(`${out}/index.html`, "utf8");
const script = html.match(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"/)?.[1];
const style = html.match(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"/)?.[1];
if (!script || !style) throw new Error("Could not find the built script/stylesheet in index.html");

writeFileSync(
  `${out}/page.html`,
  `<title>PadelVision</title>
<link rel="stylesheet" href="${style}">
<div id="root"></div>
<script type="module" src="${script}"></script>
`,
);

mkdirSync(".cache/models", { recursive: true });
mkdirSync(`${out}/models`, { recursive: true });
for (const m of ["lite", "full"]) {
  const file = `pose_landmarker_${m}.task`;
  const cached = `.cache/models/${file}`;
  if (!existsSync(cached)) {
    const url = `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${m}/float16/latest/${file}`;
    execFileSync("curl", ["-sSfL", "-o", cached, url], { stdio: "inherit" });
  }
  writeFileSync(`${out}/models/pose_landmarker_${m}.b64.txt`, readFileSync(cached).toString("base64"));
}

console.log(`Hosted bundle ready: ${out}/page.html (+ ${script}, ${style}, mediapipe/, models/)`);
