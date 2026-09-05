import { describe, expect, it } from 'vitest';
import { RequestSchema } from '../../../server/scion/request';
import { skeletonSchemaProfile, SCION_SKELETON_DIRECTIVE } from '../scionContracts';
import { NATIVE_SKELETON_SYSTEM_PROMPT, buildNativeSkeletonUserPrompt } from '../nativeSkeletonPrompts';
import { buildPublicScionMessages } from '../publicScionProvider';

describe('original UI request compatibility', () => {
  it('accepts the actual skeleton instructions plus their schema while retaining bounded input', () => {
    const messages = buildPublicScionMessages(
      NATIVE_SKELETON_SYSTEM_PROMPT + SCION_SKELETON_DIRECTIVE,
      buildNativeSkeletonUserPrompt('Three lessons about experimental design.', {
        expectedLessons: 3,
        confidence: 'high',
      }),
      { task: 'nativeSkeleton', schema: skeletonSchemaProfile({ sessionCount: 3 }) },
    );
    const request = {
      system: messages[0].content,
      prompt: messages[1].content,
      seed: 7,
      thinking: true,
      maxTokens: 4096,
    };
    expect(request.system.length).toBeGreaterThan(8000);
    expect(RequestSchema.safeParse(request).success).toBe(true);
    expect(RequestSchema.safeParse({ ...request, system: 'x'.repeat(24001) }).success).toBe(false);
  });
});
