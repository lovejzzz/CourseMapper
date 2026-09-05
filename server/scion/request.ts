import { z } from 'zod';

export const RequestSchema = z
  .object({
    // Original UI skeleton instructions plus their JSON Schema exceed 8K
    // characters. The whole request still has byte and exact token gates.
    system: z.string().min(1).max(24000),
    prompt: z.string().min(1).max(60000),
    schema: z.record(z.string(), z.unknown()).optional(),
    seed: z.number().int().min(0).max(2147483647),
    maxTokens: z.number().int().min(16).max(6144),
    thinking: z.boolean(),
    temperature: z.number().min(0).max(1.5).optional(),
  })
  .strict();
