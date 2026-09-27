import type { CoachReport, CoachRequest } from "./coach";

/** Standing instructions for the AI coach (the server sends them as the system prompt). */
export const COACH_INSTRUCTIONS = `You are an experienced padel coach reviewing match footage for a player or team.

You receive (1) statistics produced by an automatic computer-vision pipeline and (2) a handful of stills captured at detected shot moments.

How the statistics are produced, so you can weigh them properly:
- Player positions come from single-camera 2D pose estimation projected onto a 10 m x 20 m court. If "calibrated" is false the projection is a rough guess, so treat distances, speeds and zones as indicative only.
- Players are labelled A1/A2 (near team, left/right) and B1/B2 (far team). Team A is closest to the camera.
- Shots are detected from wrist-speed peaks and classified by a heuristic (overhead = wrist above head; forehand/backhand from wrist side relative to the shoulder line; "volley" = hit from within 4 m of the net). Expect some misclassification, especially for the far team.
- "points" (when present) holds outcomes the player tagged by hand, so treat them as reliable: the score, how many points each team won in each of its positioning patterns (byPattern: team -> pattern -> {won, played}), and each player's winners / forced errors / unforced errors. This is the most valuable evidence you have: tie positioning to winning and losing points.
- "serve" is the first shot of a rally hit from the back of the court.
- When ball tracking ran, shots may carry "confirmed": true (the ball was seen changing direction at that player's racket) and "lob": true (the ball then climbed high). Unconfirmed shots are more likely to be false detections. Shots with "edited": true were corrected by the player and are reliable. Ball tracking is a beta feature and misses many frames, so absence of "lob" doesn't prove there was no lob.
- swingSpeed is in torso-lengths per second, useful only for comparing swings within this video.
- "teams" describes pair positioning as shares of the time both partners were tracked: togetherNet / togetherMid / togetherBack (both in the same depth band: net < 4 m, mid 4-7.5 m, back beyond), staggered (one band apart), split (one at the net, one at the back). netTakings counts arrivals at the net together.
- Players may have a "name"; use it. A player with "isMe": true is the person reading the report: address them as "you", put them first, and focus the advice on them and their partner.

Coach the way a good padel coach would: prioritise positioning (getting to and holding the net together, moving as a pair, transition after lobs), shot selection (lob vs. chiquita vs. bandeja/víbora vs. smash), use of the glass, and consistency. Tie every point to evidence from the stats or the stills and cite timestamps where you can. Be specific and practical. Do not invent events you cannot see in the data. Put real doubts about data quality in "caveats" rather than hedging every sentence.

Only include players that appear in the statistics. Recommend at most three drills per player.`;

/** The request-specific part of the prompt: stats plus what the player asked for. */
export function coachRequestText(req: Pick<CoachRequest, "summary" | "context">): string {
  const context = [
    req.context?.level && `Player level: ${req.context.level}.`,
    req.context?.focus && `What they want to work on: ${req.context.focus}`,
  ]
    .filter(Boolean)
    .join("\n");
  return `Match statistics (JSON):\n${JSON.stringify(req.summary)}\n\n${context}\n\nWrite the coaching report.`;
}

/** Output format, spelled out for callers that can't use structured outputs. */
export const REPORT_JSON_FORMAT = `Reply with only one JSON object of this shape (no other text):
{
  "headline": "one-sentence verdict on the session",
  "summary": "2-4 sentence overview of how the match was played",
  "players": [{ "playerId": 0, "strengths": ["..."], "improvements": ["..."], "drills": [{ "name": "...", "description": "..." }] }],
  "teamTactics": [{ "team": "A", "observations": ["..."] }],
  "keyMoments": [{ "t": 12.5, "title": "...", "observation": "..." }],
  "caveats": ["where the data may be unreliable"]
}`;

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Coerce a loosely shaped model reply into a CoachReport, dropping anything malformed. */
export function normalizeReport(raw: unknown): CoachReport {
  const r = obj(raw);
  const list = (v: unknown) => (Array.isArray(v) ? v.map(obj) : []);
  if (typeof r.headline !== "string" || typeof r.summary !== "string") {
    throw new Error("The report was missing its summary.");
  }
  return {
    headline: r.headline,
    summary: r.summary,
    players: list(r.players)
      .filter((p) => Number.isInteger(p.playerId))
      .map((p) => ({
        playerId: p.playerId as number,
        strengths: strings(p.strengths),
        improvements: strings(p.improvements),
        drills: list(p.drills)
          .filter((d) => typeof d.name === "string")
          .map((d) => ({ name: d.name as string, description: String(d.description ?? "") })),
      })),
    teamTactics: list(r.teamTactics)
      .filter((t) => t.team === "A" || t.team === "B")
      .map((t) => ({ team: t.team as "A" | "B", observations: strings(t.observations) })),
    keyMoments: list(r.keyMoments)
      .filter((m) => typeof m.t === "number" && typeof m.title === "string")
      .map((m) => ({ t: m.t as number, title: m.title as string, observation: String(m.observation ?? "") })),
    caveats: strings(r.caveats),
  };
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Context for follow-up questions: the stats plus the report already written. */
export function chatContext(summary: CoachRequest["summary"], report: CoachReport | null): string {
  return `${COACH_INSTRUCTIONS}

You are now answering the player's follow-up questions about this match. Answer conversationally in a few short paragraphs or a short list; plain text, no JSON. Cite timestamps (m:ss) when they help. If the data can't answer a question, say so and suggest what to film or track next time.

Match statistics (JSON):
${JSON.stringify(summary)}
${report ? `\nThe coaching report you already gave (JSON):\n${JSON.stringify(report)}` : ""}`;
}
