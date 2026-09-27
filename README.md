# PadelVision — AI padel video analysis

Upload a padel match recording and get:

- **Player tracking** — MediaPipe pose estimation follows all four players, frame by frame, entirely in the browser.
- **Shot detection** — swings are found from wrist-speed peaks and classified as forehand, backhand, forehand/backhand volley or overhead.
- **Hears the ball** — the sharp "pop" of the ball on the racket is picked out of the soundtrack for precise shot timing; the video decides who hit it (the pair that didn't hit last). Turns itself off for music, silence or noise.
- **Broadcast-ready tracking** — tested on real match footage: the crowd is masked out, far players are re-searched with zoomed crops, and players never swap across the net.
- **Court analytics** — after you click the four court corners, positions are projected onto a real 10 × 20 m court: heatmaps, distance covered, top speed, net / transition / back-court split.
- **Automatic court detection** — finds the court surface and suggests the four corners; drag to adjust.
- **Ball tracking (beta)** — follows the ball frame by frame, draws its path, confirms real shots and spots lobs.
- **Serves** — the first back-court shot of each rally.
- **Demo match** — explore every screen with simulated data before uploading a video.
- **Match card** — a shareable image of your stats, pair play and heatmap.
- **Highlight videos** — export any highlight selection as a WebM with skeletons, names, shot labels and the ball trail drawn on.
- **Resume long analyses** — progress is saved as it goes; reopening the same video with the same settings picks up where it stopped.
- **Compared to your usual** — this match's key numbers against the average of your last five.
- **Key takeaways** — the few findings that matter most in a match, at the top of the results, with a section menu to jump around.
- **Rapid point review** — each point plays; press A/B for who won and 1–3 for how, and it moves to the next point.
- **Filming guide** — where to put the camera for the best analysis.
- **Point review** — tag who won each rally and how (winner, forced or unforced error); see win rate by positioning ("together at the net: 67% · split: 17%") and each player's winners and errors.
- **Real padel scoring** — tagged points replay into sets, games and 15-30-40 (advantage or golden point, tiebreak at 6-6), with break points and service holds from the detected serves.
- **Goals** — set targets (split under 15%, under 5 unforced errors, …); every match is checked and the coach is told.
- **Partners and rivals** — your record with each partner and against each rival across saved matches.
- **Correct the AI** — relabel or delete a shot, or swap two players the tracker mixed up; stats update straight away.
- **Reliability report** — how much of the time each player and the ball were tracked, with tips for filming the next match.
- **Analyse part of a video** — pick a start and end, e.g. one set of a long match.
- **Pair tactics** — how often each pair is together at the net, together at the back, or split (one up, one back), plus partner spacing and net takings.
- **Highlights** — filter shots by player and type ("all my backhand volleys") and play them back to back; longest rallies.
- **Your players** — name everyone and mark "this is me"; names show on the video, stats and coaching.
- **AI coach** — Claude reviews the stats plus stills from key shots and writes strengths, things to work on, drills, team tactics and key moments; then answers follow-up questions in a chat.
- **Match history & progress** — every analysis is saved in the browser, with trends across matches (net time, pair split, shots and meters per minute).

The video itself never leaves the device. Only when you ask for an AI report are a few JPEG stills and the numeric stats sent to the server.

## Open it

The quickest way is the hosted version on claude.ai: open the link, drop in a video. The AI coach runs on your own Claude account there, so no API key is needed.

## Run it yourself

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

Hosted (claude.ai Artifact) bundle:

```bash
npm run build:hosted   # writes dist-hosted/: page.html, assets/, mediapipe/, models/
```

The hosted build has no server: the pose models ship next to the page (as base64 text, since artifacts only serve web file types) and the coach asks Claude through the viewer's account instead of `/api/coach`.

## Filming tips

- A fixed camera behind one baseline, high up, with the whole court in view works best.
- 720p or 1080p is plenty. Shorter clips (a few games) analyse faster.
- Calibrate the court: without it, distances and zones are rough estimates.
- iPhone videos recorded as HEVC may not play in Chrome on Windows or Linux. Use Safari, or set the camera to "Most Compatible" (H.264).

## How it works

| Step | Where | Code |
| --- | --- | --- |
| Frame sampling: plays the video and grabs frames (pausing while each is analysed); falls back to seeking | browser | `src/analysis/analyzeVideo.ts` |
| Court detection: grow the carpet colour from the lower middle, bridge lines, fit the largest quadrilateral | browser | `src/analysis/courtDetect.ts` |
| Ball: moving blobs that are ball-coloured or brighter than their surroundings, away from players' bodies and inside the court area; several candidate paths, keep the ones that travel; hits, bounces, lobs | browser | `src/analysis/ball.ts` |
| Pose estimation on zoomed, overlapping tiles of the court (crowd masked out), plus focused crops around any player who has gone missing | browser | `src/analysis/tiles.ts`, `pose.ts` |
| Image → court projection (4-point homography) | browser | `src/analysis/court.ts` |
| Identity tracking, labelling A1/A2 (near team) and B1/B2 (far team) | browser | `src/analysis/tracker.ts` |
| Ball-hit sounds from the soundtrack (transient detection), fused with swings | browser | `src/analysis/audio.ts`, `shots.ts` |
| Swing detection + classification | browser | `src/analysis/shots.ts` |
| Player stats, heatmaps | browser | `src/analysis/stats.ts` |
| Pair positioning | browser | `src/analysis/tactics.ts` |
| Match history | browser (IndexedDB) | `src/lib/history.ts` |
| Coaching report (Claude, structured output) and follow-up chat | server (`/api/coach`, `/api/chat`), or the viewer's Claude account when hosted | `server/coach.ts`, `shared/`, `src/lib/coachClient.ts` |

Shot classification is heuristic: *overhead* when the racket wrist is above the head; *forehand/backhand* from which side of the shoulder line the racket wrist is on at peak speed (works whether the player faces the camera or not); *volley* when hit within 4 m of the net. Expect some mistakes, especially for the far team, which appears small in the frame. The swing-sensitivity setting trades missed shots against false positives.

The MediaPipe WASM runtime is copied into `public/mediapipe` on `npm install` and served by the app. The pose model (`.task` file) is downloaded from Google's model storage on first use.

## Configuration

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Enables the AI coaching report. |
| `PORT` | API / production server port (default `8787`). |
