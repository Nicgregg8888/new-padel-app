# PadelVision — AI padel video analysis

Upload a padel match recording and get:

- **Player tracking** — MediaPipe pose estimation follows all four players, frame by frame, entirely in the browser.
- **Shot detection** — swings are found from wrist-speed peaks and classified as forehand, backhand, forehand/backhand volley or overhead.
- **Court analytics** — after you click the four court corners, positions are projected onto a real 10 × 20 m court: heatmaps, distance covered, top speed, net / transition / back-court split.
- **Rallies & timeline** — clickable shot markers and rally list that jump the video to the moment.
- **AI coaching report** — Claude reviews the stats plus stills from key shots and writes strengths, things to work on, drills, team tactics and key moments.

The video itself never leaves the device. Only when you ask for an AI report are a few JPEG stills and the numeric stats sent to the server.

## Quick start

```bash
npm install
cp .env.example .env        # add ANTHROPIC_API_KEY for the AI coach (optional)
npm run dev                 # web on http://localhost:5173, API on :8787
```

Production:

```bash
npm run build
ANTHROPIC_API_KEY=... npm start   # serves dist/ and /api on $PORT (default 8787)
```

Tests and type-checking:

```bash
npm test
npm run typecheck
```

## Filming tips

- A fixed camera behind one baseline, high up, with the whole court in view works best.
- 720p or 1080p is plenty. Shorter clips (a few games) analyse faster.
- Calibrate the court: without it, distances and zones are rough estimates.

## How it works

| Step | Where | Code |
| --- | --- | --- |
| Pose estimation (up to 6 bodies per frame, MediaPipe Pose Landmarker) | browser | `src/analysis/pose.ts`, `analyzeVideo.ts` |
| Image → court projection (4-point homography) | browser | `src/analysis/court.ts` |
| Identity tracking, labelling A1/A2 (near team) and B1/B2 (far team) | browser | `src/analysis/tracker.ts` |
| Swing detection + classification | browser | `src/analysis/shots.ts` |
| Player stats, heatmaps | browser | `src/analysis/stats.ts` |
| Coaching report (Claude, structured output) | server | `server/coach.ts`, `shared/coach.ts` |

Shot classification is heuristic: *overhead* when the racket wrist is above the head; *forehand/backhand* from which side of the shoulder line the racket wrist is on at peak speed (works whether the player faces the camera or not); *volley* when hit within 4 m of the net. Expect some mistakes, especially for the far team, which appears small in the frame. The swing-sensitivity setting trades missed shots against false positives.

The MediaPipe WASM runtime is copied into `public/mediapipe` on `npm install` and served by the app. The pose model (`.task` file) is downloaded from Google's model storage on first use.

## Configuration

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Enables the AI coaching report. |
| `PORT` | API / production server port (default `8787`). |
