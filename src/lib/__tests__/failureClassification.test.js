import { describe, expect, it } from 'vitest';
import { classifyError, failureEventFields, FAILURE_CLASSES, toClassifiedError } from '../failureClassification';

describe('failureClassification', () => {
  it('classifies an incomplete course-map scope as a retryable quality failure', () => {
    expect(classifyError(new Error('Course map generation stopped at 11 of 12 lessons.'))).toMatchObject({
      failureClass: FAILURE_CLASSES.QUALITY,
      retryable: true,
    });
  });

  it('classifies provider auth and permission failures as non-retryable', () => {
    expect(classifyError(new Error('Invalid API key [401]'))).toMatchObject({
      failureClass: FAILURE_CLASSES.AUTH,
      statusCode: 401,
      retryable: false,
    });
    expect(classifyError(new Error('Model access denied [403]'))).toMatchObject({
      failureClass: FAILURE_CLASSES.PERMISSION,
      statusCode: 403,
      retryable: false,
    });
  });

  it('classifies provider outages and rate limits as retryable', () => {
    expect(classifyError(new Error('Service unavailable [503]'))).toMatchObject({
      failureClass: FAILURE_CLASSES.PROVIDER_UNAVAILABLE,
      statusCode: 503,
      retryable: true,
    });
    expect(classifyError(new Error('Rate limit exceeded [429]'))).toMatchObject({
      failureClass: FAILURE_CLASSES.RATE_LIMIT,
      statusCode: 429,
      retryable: true,
    });
  });

  it('attaches classification metadata for API budget events', () => {
    const error = toClassifiedError(Object.assign(new Error('Model not found [404]'), { status: 404 }), {
      provider: 'google',
      modelId: 'gemini-missing',
    });

    expect(error.failureClass).toBe(FAILURE_CLASSES.MODEL_UNSUPPORTED);
    expect(failureEventFields(error, { provider: 'google', modelId: 'gemini-missing' })).toMatchObject({
      failureClass: FAILURE_CLASSES.MODEL_UNSUPPORTED,
      statusCode: 404,
      retryable: false,
      provider: 'google',
      modelId: 'gemini-missing',
    });
  });
});
