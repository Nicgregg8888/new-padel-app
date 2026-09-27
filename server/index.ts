import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ChatRequestSchema, CoachRequestSchema } from "../shared/coach";
import { CoachError, answerFollowUp, generateCoachReport } from "./coach";

// Pick up ANTHROPIC_API_KEY / PORT from a local .env file when there is one.
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the real environment.
}

const app = express();
app.use(express.json({ limit: "20mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

function sendError(res: express.Response, err: unknown) {
  if (err instanceof CoachError) {
    res.status(err.status).json({ error: err.message });
  } else if (
    err instanceof Anthropic.AuthenticationError ||
    (err instanceof Error && err.message.startsWith("Could not resolve authentication method"))
  ) {
    res.status(503).json({ error: "AI coach is not configured: set ANTHROPIC_API_KEY on the server." });
  } else if (err instanceof Anthropic.RateLimitError) {
    res.status(429).json({ error: "AI coach is busy right now. Try again in a minute." });
  } else if (err instanceof Anthropic.APIError) {
    console.error("Claude API error", err.status, err.message);
    res.status(502).json({ error: "The AI coach service returned an error." });
  } else {
    console.error(err);
    res.status(500).json({ error: "Unexpected server error." });
  }
}

app.post("/api/coach", async (req, res) => {
  const parsed = CoachRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues.slice(0, 5) });
    return;
  }
  try {
    res.json(await generateCoachReport(parsed.data));
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/chat", async (req, res) => {
  const parsed = ChatRequestSchema.safeParse(req.body);
  const msgs = parsed.success ? parsed.data.messages : [];
  if (!parsed.success || msgs[0]?.role !== "user" || msgs.at(-1)?.role !== "user") {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  try {
    res.json({ reply: await answerFollowUp(parsed.data) });
  } catch (err) {
    sendError(res, err);
  }
});

if (process.env.NODE_ENV === "production") {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
  app.use(express.static(dist));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`Padel Vision API on http://localhost:${port}`));
