import * as z from "zod/v4";

const shotType = z.enum(["serve", "forehand", "backhand", "forehand-volley", "backhand-volley", "overhead"]);

export const CoachRequestSchema = z.object({
  summary: z.object({
    durationSeconds: z.number(),
    calibrated: z.boolean(),
    rallies: z.number(),
    avgRallyShots: z.number(),
    players: z.array(
      z.object({
        playerId: z.number(),
        label: z.string(),
        name: z.string().max(60).optional(),
        isMe: z.boolean().optional(),
        team: z.enum(["A", "B"]),
        distanceMeters: z.number(),
        avgSpeed: z.number(),
        maxSpeed: z.number(),
        trackedSeconds: z.number(),
        zoneShare: z.object({ net: z.number(), transition: z.number(), baseline: z.number() }),
        shots: z.record(shotType, z.number()),
        totalShots: z.number(),
        avgSwingSpeed: z.number(),
        dominantHand: z.enum(["left", "right"]),
        avgNetDistance: z.number(),
      }),
    ),
    points: z
      .object({
        tagged: z.number(),
        score: z.object({ A: z.number(), B: z.number() }),
        byPattern: z.record(
          z.enum(["A", "B"]),
          z.partialRecord(z.enum(["net", "mid", "back", "staggered", "split"]), z.object({ won: z.number(), played: z.number() })),
        ),
        perPlayer: z.record(z.string(), z.record(z.enum(["winner", "forced", "unforced"]), z.number())),
      })
      .optional(),
    goals: z
      .array(z.object({ goal: z.string().max(120), value: z.string().max(40).optional(), met: z.boolean().optional() }))
      .max(10)
      .optional(),
    score: z
      .object({
        sets: z.array(z.object({ A: z.number(), B: z.number() })).max(10),
        currentGame: z.object({ A: z.string().max(4), B: z.string().max(4) }),
        goldenPoint: z.boolean(),
        breakPoints: z.record(z.enum(["A", "B"]), z.object({ won: z.number(), chances: z.number() })),
        serviceGamesHeld: z.record(z.enum(["A", "B"]), z.object({ won: z.number(), played: z.number() })),
      })
      .optional(),
    teams: z
      .array(
        z.object({
          team: z.enum(["A", "B"]),
          pairedSeconds: z.number(),
          togetherNet: z.number(),
          togetherMid: z.number(),
          togetherBack: z.number(),
          staggered: z.number(),
          split: z.number(),
          avgSpacing: z.number(),
          avgDepthGap: z.number(),
          avgLateralGap: z.number(),
          netTakings: z.number(),
        }),
      )
      .max(2)
      .optional(),
    shots: z
      .array(
        z.object({
          t: z.number(),
          playerId: z.number(),
          type: shotType,
          zone: z.enum(["net", "transition", "baseline"]),
          swingSpeed: z.number(),
          confirmed: z.boolean().optional(),
          lob: z.boolean().optional(),
          edited: z.boolean().optional(),
        }),
      )
      .max(2000),
  }),
  keyframes: z
    .array(
      z.object({
        t: z.number(),
        caption: z.string().max(200),
        image: z.string().regex(/^data:image\/jpeg;base64,/),
      }),
    )
    .max(8),
  context: z
    .object({
      level: z.string().max(60).optional(),
      focus: z.string().max(500).optional(),
    })
    .optional(),
});

export type CoachRequest = z.infer<typeof CoachRequestSchema>;

export const CoachReportSchema = z.object({
  headline: z.string().describe("One-sentence verdict on the session."),
  summary: z.string().describe("2-4 sentence overview of how the match was played."),
  players: z.array(
    z.object({
      playerId: z.number(),
      strengths: z.array(z.string()),
      improvements: z.array(z.string()),
      drills: z.array(z.object({ name: z.string(), description: z.string() })),
    }),
  ),
  teamTactics: z.array(
    z.object({
      team: z.enum(["A", "B"]),
      observations: z.array(z.string()),
    }),
  ),
  keyMoments: z.array(
    z.object({
      t: z.number().describe("Timestamp in seconds."),
      title: z.string(),
      observation: z.string(),
    }),
  ),
  caveats: z.array(z.string()).describe("Where the data may be unreliable."),
});

export type CoachReport = z.infer<typeof CoachReportSchema>;

export const ChatRequestSchema = z.object({
  summary: CoachRequestSchema.shape.summary,
  report: CoachReportSchema.nullable(),
  messages: z
    .array(
      z.union([
        z.object({ role: z.literal("user"), content: z.string().min(1).max(4000) }),
        // The coach's own earlier answers come back as context and can be long.
        z.object({ role: z.literal("assistant"), content: z.string().min(1).max(40000) }),
      ]),
    )
    .min(1)
    .max(40),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
