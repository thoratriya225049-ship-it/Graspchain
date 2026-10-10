import { z } from "zod";
import { MAX_WORDS } from "./text";

/** Content schema for content/articles/*.json (validated at API boot). */
export const ArticleSchema = z
  .object({
    id: z.string().regex(/^A\d+$/),
    title: z.string().min(5),
    dek: z.string().min(5),
    topic: z.string(),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    skillTags: z.array(z.string()).min(1),
    rubricVersion: z.number().int().positive(),
    sentences: z.array(z.string().min(3)).min(4).max(40),
    breaks: z.array(z.number().int().nonnegative()),
    keyPoints: z
      .array(
        z.object({
          id: z.string().regex(/^kp\d+$/),
          weight: z.number().positive(),
          concept: z.string(),
          statement: z.string(),
          sentenceIdx: z.array(z.number().int().nonnegative()).min(1),
          addHint: z.string(),
          example: z.string(),
          cues: z.array(z.array(z.string()).min(1)).min(1),
        }),
      )
      .min(1)
      .max(6),
    commonMisconceptions: z.array(
      z.object({
        id: z.string(),
        kpId: z.string(),
        statement: z.string().min(3),
        why: z.string(),
        correction: z.string(),
        any: z.array(z.string()).min(1),
        unless: z.array(z.string()).optional(),
      }),
    ),
    purposeCues: z.array(z.array(z.string()).min(1)),
    samples: z.array(z.object({ label: z.string(), text: z.string() })),
  })
  .superRefine((a, ctx) => {
    for (const kp of a.keyPoints)
      for (const i of kp.sentenceIdx) if (i >= a.sentences.length) ctx.addIssue({ code: "custom", message: `${a.id}/${kp.id}: sentenceIdx ${i} out of range` });
    const words = a.sentences.join(" ").split(/\s+/).length;
    if (words < 150 || words > 300) ctx.addIssue({ code: "custom", message: `${a.id}: ${words} words (must be 150–300)` });
  });

// ───────────────────────── API request bodies ─────────────────────────

export const LoginBody = z.object({ code: z.string().trim().min(3).max(32) });
export const ConsentBody = z.object({ accept: z.boolean() });
export const QueueJoinBody = z.object({ articleId: z.string().max(16) });
export const SessionCreateBody = z.object({ articleId: z.string().max(16), admissionToken: z.string().max(512).optional() });
export const SubmitBody = z.object({
  answer: z
    .string()
    .min(1)
    .max(MAX_WORDS * 12),
  idempotencyKey: z.string().min(8).max(80),
  pasteCount: z.number().int().min(0).max(10000).default(0),
  blurCount: z.number().int().min(0).max(10000).default(0),
  copyCount: z.number().int().min(0).max(10000).default(0),
});
export const ReviewBody = z.object({
  newScore: z.number().min(1).max(10),
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters.").max(500),
});
export const ModeBody = z
  .object({
    researchMode: z.boolean(),
    clockMode: z.enum(["fair", "naive"]),
    fairMode: z.enum(["fair", "fifo"]),
    readSecondsOverride: z.number().int().min(15).max(600).nullable(),
    demoLoad: z.boolean(),
  })
  .partial();
export const TamperBody = z.object({
  assessmentId: z.string().uuid(),
  field: z.enum(["finalScore", "answerHash", "createdAt", "models.jev", "rubricVersion", "studentRef", "readSecondsGranted"]),
});
export const RatingBody = z.object({
  attemptId: z.string().uuid(),
  rater: z.string().trim().min(1).max(40),
  raterType: z.enum(["internal", "external"]),
  score: z.number().int().min(1).max(10),
});
export const SimBody = z.object({
  mode: z.enum(["fifo", "fair"]),
  windowMs: z.number().int().min(250).max(10000).default(2000),
  seeds: z.number().int().min(1).max(60).default(30),
});

export type SubmitInput = z.infer<typeof SubmitBody>;
