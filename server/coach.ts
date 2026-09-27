import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { CoachReportSchema, type CoachReport, type CoachRequest } from "../shared/coach";

const MODEL = "claude-opus-5";

const SYSTEM_PROMPT = `You are an experienced padel coach reviewing match footage for a player or team.

You receive (1) statistics produced by an automatic computer-vision pipeline and (2) a handful of stills captured at detected shot moments.

How the statistics are produced, so you can weigh them properly:
- Player positions come from single-camera 2D pose estimation projected onto a 10 m x 20 m court. If "calibrated" is false the projection is a rough guess, so treat distances, speeds and zones as indicative only.
- Players are labelled A1/A2 (near team, left/right) and B1/B2 (far team). Team A is closest to the camera.
- Shots are detected from wrist-speed peaks and classified by a heuristic (overhead = wrist above head; forehand/backhand from wrist side relative to the shoulder line; "volley" = hit from within 4 m of the net). Expect some misclassification, especially for the far team.
- swingSpeed is in torso-lengths per second, useful only for comparing swings within this video.

Coach the way a good padel coach would: prioritise positioning (getting to and holding the net together, moving as a pair, transition after lobs), shot selection (lob vs. chiquita vs. bandeja/víbora vs. smash), use of the glass, and consistency. Tie every point to evidence from the stats or the stills and cite timestamps where you can. Be specific and practical. Do not invent events you cannot see in the data. Put real doubts about data quality in "caveats" rather than hedging every sentence.

Only include players that appear in the statistics. Recommend at most three drills per player.`;

export class CoachError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let client: Anthropic | null = null;
function getClient() {
  client ??= new Anthropic();
  return client;
}

export async function generateCoachReport(req: CoachRequest): Promise<CoachReport> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const kf of req.keyframes) {
    content.push({ type: "text", text: `Still at ${kf.t.toFixed(1)}s — ${kf.caption}` });
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: kf.image.replace(/^data:image\/jpeg;base64,/, ""),
      },
    });
  }
  const context = [
    req.context?.level && `Player level: ${req.context.level}.`,
    req.context?.focus && `What they want to work on: ${req.context.focus}`,
  ]
    .filter(Boolean)
    .join("\n");
  content.push({
    type: "text",
    text: `Match statistics (JSON):\n${JSON.stringify(req.summary)}\n\n${context}\n\nWrite the coaching report.`,
  });

  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
    output_config: { format: betaZodOutputFormat(CoachReportSchema) },
  });

  if (response.stop_reason === "refusal") {
    throw new CoachError("The AI coach declined to analyse this video.", 422);
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new CoachError("The AI coach returned an incomplete report. Please try again.", 502);
  }
  return response.parsed_output;
}
