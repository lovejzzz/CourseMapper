import { describe, expect, it } from 'vitest';

import { scionCompactKernelMaxAttempts } from '../crucible/scionCompactAttemptPolicy.mjs';

describe('Scion compact-kernel attempt policy', () => {
  it('uses one native attempt for the exact source-grounded adapter task', () => {
    expect(
      scionCompactKernelMaxAttempts({
        taskFamily: 'source-grounded-lesson-kernel',
        promptProtocol: 'production-lesson-kernel-prompt-v1',
      }),
    ).toBe(1);
  });

  it('reserves one conditional fact-ledger retry only when the grounded stage is proven available', () => {
    const request = {
      taskFamily: 'lesson-kernel-synthesis',
      promptProtocol: 'production-lesson-kernel-synthesis-prompt-v1',
    };
    expect(scionCompactKernelMaxAttempts({ ...request, routeReason: 'grounded-stage-available' })).toBe(2);
    expect(scionCompactKernelMaxAttempts({ ...request, routeReason: 'task-family-out-of-scope' })).toBe(3);
  });

  it('allows two issue-informed synthesis retries inside an explicit compiler recovery seat', () => {
    expect(
      scionCompactKernelMaxAttempts({
        taskFamily: 'lesson-kernel-synthesis',
        promptProtocol: 'production-lesson-kernel-synthesis-prompt-v1',
        routeReason: 'grounded-stage-available',
        recoveryAttempt: 1,
      }),
    ).toBe(3);
  });

  it('keeps historical and mismatched protocols on the bounded three-attempt policy', () => {
    expect(
      scionCompactKernelMaxAttempts({
        taskFamily: 'lesson-kernel',
        promptProtocol: 'production-lesson-kernel-prompt-v1',
        routeReason: 'grounded-stage-available',
      }),
    ).toBe(3);
    expect(
      scionCompactKernelMaxAttempts({
        taskFamily: 'source-grounded-lesson-kernel',
        promptProtocol: 'wrong-protocol',
      }),
    ).toBe(3);
  });
});
