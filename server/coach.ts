import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { CoachReportSchema, type CoachReport, type CoachRequest } from "../shared/coach";
import type { ChatRequest } from "../shared/coach";
import { COACH_INSTRUCTIONS, chatContext, coachRequestText } from "../shared/coachPrompt";

const MODEL = "claude-opus-5";

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
  content.push({ type: "text", text: coachRequestText(req) });

  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: COACH_INSTRUCTIONS,
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

export async function answerFollowUp(req: ChatRequest): Promise<string> {
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: chatContext(req.summary, req.report),
    messages: req.messages,
  });
  if (response.stop_reason === "refusal") {
    throw new CoachError("The AI coach declined to answer that.", 422);
  }
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  if (!text) throw new CoachError("The AI coach returned an empty answer. Please try again.", 502);
  return text;
}
