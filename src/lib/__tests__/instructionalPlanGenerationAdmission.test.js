import { describe, expect, it, vi } from 'vitest';

import { admitInstructionalPlanForGeneration } from '../instructionalPlanGenerationAdmission.js';

describe('instructional-plan generation admission', () => {
  it('routes evidence-only blockers into source-review recovery without failing every deliverable', () => {
    const planningAuthority = { governingSourceContractSha256: 'source-contract' };
    const instructionalPlan = {
      lessonIntents: [
        {
          id: 'lesson-1',
          lessonNumber: 1,
          evidenceBoundary: { unadmittedClaims: [] },
          clarificationQuestions: [{ priority: 'essential', prompt: 'Which source should govern this lesson?' }],
        },
      ],
      admission: {
        status: 'needs-evidence',
        blockerCount: 1,
        blockers: ['lesson-1:evidence-acquisition-required'],
      },
      planningAuthority,
      receipt: { exactInputSha256: 'grounded-plan' },
      evidenceNeedsPlan: { receipt: { exactInputSha256: 'evidence-needs' } },
    };
    const appendLog = vi.fn();
    const recordEvent = vi.fn();
    const commitKernelCache = vi.fn();
    const discardKernelCacheCommit = vi.fn();
    const courseGraph = {};
    const blueprint = { instructionalIntentGraph: instructionalPlan };

    expect(() =>
      admitInstructionalPlanForGeneration({
        appendLog,
        blueprint,
        blueprintEnrichment: { preDraftInstructionalPlanReceipt: { exactInputSha256: 'grounded-plan' } },
        commitKernelCache,
        courseGraph,
        discardKernelCacheCommit,
        evidenceGroundedInstructionalPlan: instructionalPlan,
        governingSourceContract: { receiptSha256: 'source-contract' },
        onCourseGraph: vi.fn(),
        preDraftInstructionalPlan: {
          receipt: { exactInputSha256: 'curriculum-plan' },
          evidenceNeedsPlan: { receipt: { exactInputSha256: 'evidence-needs' } },
        },
        recordEvent,
      }),
    ).not.toThrow();

    expect(commitKernelCache).toHaveBeenCalledOnce();
    expect(discardKernelCacheCommit).not.toHaveBeenCalled();
    expect(blueprint.enrichment.coverage.missingLessons).toEqual([1]);
    expect(blueprint.instructionalPlanLineage.status).toBe('evidence-recovery-authorized');
    expect(courseGraph.instructionalPlanLineage.status).toBe('evidence-recovery-authorized');
    expect(appendLog).toHaveBeenCalledWith(expect.stringMatching(/source gap.*provisional subject matter/i), 'done');
    expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({ status: 'evidence-recovery-authorized' }));
  });

  it('continues to reject non-evidence planning blockers', () => {
    expect(() =>
      admitInstructionalPlanForGeneration({
        appendLog: vi.fn(),
        blueprint: {
          instructionalIntentGraph: {
            lessonIntents: [],
            admission: { status: 'blocked', blockerCount: 1, blockers: ['lesson-1:missing-purpose'] },
          },
        },
        recordEvent: vi.fn(),
      }),
    ).toThrow(/blocked drafting/i);
  });
});
