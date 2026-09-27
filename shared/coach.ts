import * as z from "zod/v4";

const shotType = z.enum(["forehand", "backhand", "forehand-volley", "backhand-volley", "overhead"]);

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
    shots: z
      .array(
        z.object({
          t: z.number(),
          playerId: z.number(),
          type: shotType,
          zone: z.enum(["net", "transition", "baseline"]),
          swingSpeed: z.number(),
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
