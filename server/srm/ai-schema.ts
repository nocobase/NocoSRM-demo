import { z } from 'zod';

export const AI_ACTOR = 'srm.aiReview';
export const AI_PROMPT_VERSION = 'text-consistency-v1';
export const aiSettingsSchema = z
  .object({
    enabled: z.boolean(),
    threshold: z.number().finite().min(0).max(1).nullable(),
    model: z
      .object({ modelService: z.string().min(1), model: z.string().min(1) })
      .nullable(),
    maxOutputTokens: z.number().int().min(128).max(4096),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.enabled && value.threshold === null)
      context.addIssue({
        code: 'custom',
        path: ['threshold'],
        message: 'A calibrated threshold is required.',
      });
    if (value.enabled && value.model === null)
      context.addIssue({
        code: 'custom',
        path: ['model'],
        message: 'Select a configured model.',
      });
  });
export type AiSettings = z.infer<typeof aiSettingsSchema>;
export const defaultAiSettings: AiSettings = {
  enabled: false,
  threshold: null,
  model: null,
  maxOutputTokens: 1024,
};
export const aiResultSchema = z
  .object({
    recommendation: z.enum(['approve', 'reject', 'uncertain']),
    confidence: z.number().finite().min(0).max(1),
    reasons: z.array(z.string().trim().min(1).max(500)).min(1).max(5),
  })
  .strict();

/** Accept a complete JSON fence, never extract a JSON fragment from prose. */
export function parseAiResult(text: string) {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  return aiResultSchema.parse(JSON.parse(fenced ? fenced[1] : trimmed));
}
