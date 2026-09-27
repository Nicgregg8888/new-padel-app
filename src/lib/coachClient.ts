import type { CoachReport, CoachRequest } from "../../shared/coach";
import {
  COACH_INSTRUCTIONS,
  REPORT_JSON_FORMAT,
  chatContext,
  coachRequestText,
  normalizeReport,
  type ChatTurn,
} from "../../shared/coachPrompt";
import { blobToDataUrl, captureFrames } from "../analysis/analyzeVideo";
import { buildCoachSummary, planKeyframes, type KeyframePlan } from "../analysis/coachRequest";
import type { Goal } from "../analysis/goals";
import type { AnalysisResult, PointTag } from "../analysis/types";
import { HOSTED, claudeRuntime, isSampleError } from "./hosted";
import { loadHiddenVideo } from "./video";

/** Stay well under the 64 KiB prompt cap of in-page Claude calls. */
const MAX_PROMPT_CHARS = 50_000;

/** Server path: our /api/coach endpoint with an Anthropic API key. */
async function reportFromServer(req: Omit<CoachRequest, "keyframes">, plan: KeyframePlan[], images: Blob[]) {
  const keyframes = await Promise.all(plan.map(async (p, i) => ({ ...p, image: await blobToDataUrl(images[i]) })));
  const res = await fetch("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...req, keyframes }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as CoachReport;
}

/** Hosted path: ask Claude through the viewer's own account. */
async function reportInPage(req: Omit<CoachRequest, "keyframes">, plan: KeyframePlan[], images: Blob[]) {
  const sample = await getSample();
  const limits = await sample.limits().catch(() => null);
  const sent = plan.slice(0, limits?.images?.maxCount ?? 0);

  const summary = { ...req.summary };
  const build = () =>
    [
      COACH_INSTRUCTIONS,
      sent.length
        ? "Attached stills, in order:\n" + sent.map((k, i) => `${i + 1}. ${k.t.toFixed(1)}s — ${k.caption}`).join("\n")
        : "No stills are attached; work from the statistics.",
      coachRequestText({ summary, context: req.context }),
      REPORT_JSON_FORMAT,
    ].join("\n\n");
  let prompt = build();
  // Long matches: thin the shot list evenly until the prompt fits.
  while (prompt.length > MAX_PROMPT_CHARS && summary.shots.length > 20) {
    summary.shots = summary.shots.filter((_, i) => i % 2 === 0);
    prompt = build();
  }

  try {
    return normalizeReport(await sample.json(prompt, { images: images.slice(0, sent.length) }));
  } catch (e) {
    if (!isSampleError(e)) throw e;
    throw new Error(sampleErrorMessage(e.code));
  }
}


function sampleErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    not_granted: "Claude access wasn't allowed for this page. Reload the page and choose Allow to use the coach.",
    sampling_disabled: "Claude isn't available on this account, so the coach can't run.",
    rate_limited: "You've reached a Claude usage limit. Try again in a little while.",
    session_expired: "Your Claude session expired. Sign in again, then retry.",
    refused: "Claude declined to review this match.",
    invalid_json: "The report came back incomplete. Try again.",
    empty_completion: "The report came back empty. Try again.",
  };
  return messages[code] ?? "The AI coach couldn't be reached. Try again.";
}

async function getSample() {
  const sample = (await claudeRuntime()?.use("sample")) ?? null;
  if (!sample) throw new Error("The AI coach only works when this page is opened in Claude.");
  return sample;
}

export interface ReportInput {
  result: AnalysisResult;
  /** Video to take stills from; null for a saved match without its video. */
  src: string | null;
  names: Record<number, string>;
  me: number | null;
  points?: PointTag[];
  goldenPoint?: boolean;
  goals?: Goal[];
  level: string;
  focus: string;
  onStep?: (step: string) => void;
}

export async function generateReport(input: ReportInput): Promise<CoachReport> {
  let plan: KeyframePlan[] = [];
  let images: Blob[] = [];
  if (input.src) {
    input.onStep?.("Capturing key moments…");
    plan = planKeyframes(input.result);
    const video = await loadHiddenVideo(input.src);
    images = await captureFrames(video, plan.map((p) => p.t));
  }
  input.onStep?.("Your AI coach is reviewing the match…");
  const req = {
    summary: buildCoachSummary(input.result, { names: input.names, me: input.me, points: input.points, goldenPoint: input.goldenPoint, goals: input.goals }),
    context: { level: input.level, focus: input.focus || undefined },
  };
  return HOSTED ? reportInPage(req, plan, images) : reportFromServer(req, plan, images);
}

export interface FollowUpInput {
  result: AnalysisResult;
  names: Record<number, string>;
  me: number | null;
  points?: PointTag[];
  goldenPoint?: boolean;
  goals?: Goal[];
  report: CoachReport | null;
  turns: ChatTurn[];
  onText?: (text: string) => void;
  signal?: AbortSignal;
}

/** Answer a follow-up question; `turns` ends with the new user question. */
/** A conversation sent to Claude must start with the user's turn. */
function trimTurns(turns: ChatTurn[]): ChatTurn[] {
  const first = turns.findIndex((t) => t.role === "user");
  return first < 0 ? [] : turns.slice(first);
}

export async function askFollowUp(input: FollowUpInput): Promise<string> {
  const summary = buildCoachSummary(input.result, { names: input.names, me: input.me, points: input.points, goldenPoint: input.goldenPoint, goals: input.goals });
  let turns = trimTurns(input.turns.slice(-12));
  if (!HOSTED) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary, report: input.report, messages: turns }),
      signal: input.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
    input.onText?.(body.reply);
    return body.reply as string;
  }

  const sample = await getSample();
  // Fit the in-page prompt cap: thin the shot list, then drop the oldest turns.
  let slim = summary;
  const size = () => chatContext(slim, input.report).length + turns.reduce((a, t) => a + t.content.length, 0);
  while (size() > MAX_PROMPT_CHARS && slim.shots.length > 20) {
    slim = { ...slim, shots: slim.shots.filter((_, i) => i % 2 === 0) };
  }
  while (size() > MAX_PROMPT_CHARS && turns.length > 1) turns = trimTurns(turns.slice(1));
  const context = chatContext(slim, input.report);
  try {
    const { text } = await sample([{ role: "user", content: context }, ...turns], {
      cache: false,
      signal: input.signal,
      onText: ({ text }) => input.onText?.(text),
    });
    return text;
  } catch (e) {
    if (isSampleError(e)) {
      if (e.code === "cancelled") throw e;
      throw new Error(sampleErrorMessage(e.code));
    }
    throw e;
  }
}
