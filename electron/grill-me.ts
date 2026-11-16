import { z } from 'zod';
import { hasMeaningfulClarification } from '../shared/clarification-quality';

const decisionQuestion = z.object({
  kind: z.literal('question'),
  question: z.string().trim().min(5).max(300),
  reason: z.string().trim().min(5).max(240),
  options: z
    .array(
      z.object({
        label: z.string().trim().min(2).max(100),
        description: z.string().trim().min(3).max(180),
      }),
    )
    .min(2)
    .max(3),
  recommended: z.number().int().min(1).max(3),
});

const plan = z.object({
  kind: z.literal('plan'),
  summary: z.string().trim().min(5).max(1000),
});

export const grillMeFormat = z.toJSONSchema(z.discriminatedUnion('kind', [decisionQuestion, plan]));
export const grillMePlanFormat = z.toJSONSchema(plan);

export function parseGrillMeTurn(text: string, request: string, allowQuestion: boolean) {
  const next = z.discriminatedUnion('kind', [decisionQuestion, plan]).parse(JSON.parse(text));
  if (
    next.kind === 'question' &&
    (!allowQuestion ||
      next.recommended > next.options.length ||
      !hasMeaningfulClarification(next.question, next.options, request, true))
  )
    throw new Error(
      'Provide one concrete question with two or three distinct options and a valid recommendation.',
    );
  return next;
}
