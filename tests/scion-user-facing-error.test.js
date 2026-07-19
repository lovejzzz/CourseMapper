import { describe, expect, it } from 'vitest';

import {
  getScionAgentFailureMessage,
  getScionReviewFailureMessage,
  isLocalScionRuntimeFailure,
} from '../src/lib/scionUserFacingError.js';

describe('Scion user-facing runtime errors', () => {
  it('recognizes fatal local worker failures without exposing their internals', () => {
    const error = new Error('Received abort signal from llama.cpp; Message: (empty)');

    expect(isLocalScionRuntimeFailure(error)).toBe(true);
    expect(getScionReviewFailureMessage(error)).toBe(
      'Scion stopped early. Your course is safe—retry when Scion is ready.',
    );
    expect(getScionAgentFailureMessage(error)).toBe(
      'Scion paused before it could answer. Your work is safe—please retry in a moment.',
    );
    expect(getScionReviewFailureMessage(error)).not.toMatch(/llama|callback|runtime/i);
    expect(getScionAgentFailureMessage(error)).not.toMatch(/llama|callback|runtime/i);
  });

  it('uses calm generic recovery language for other failures', () => {
    expect(getScionReviewFailureMessage(new Error('network unavailable'))).toContain('Your course is safe');
    expect(getScionAgentFailureMessage(new Error('network unavailable'))).toContain('Your work is safe');
  });
});
