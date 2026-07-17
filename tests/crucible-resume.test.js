import { describe, expect, it } from 'vitest';
import { assessResumableCourseEvidence } from '../scripts/lib/crucibleResume.mjs';

const course = { id: 'mandarin--native--local', prompt: 'Elementary Mandarin with hanzi and pinyin.', lessonCount: 15 };
const comparison = {
  pairId: 'pair:world-languages',
  compilerCommit: 'e7d7e4e',
  variant: 'adapter',
};
const localModel = {
  id: 'scion-1',
  sourceModelId: 'google/gemma-4-E2B-it-qat-q4_0-unquantized',
  sourceRevision: '1ca4dd94',
  adapterActive: true,
  adapterId: 'scion-research',
};
const storedCourse = {
  ...course,
  provider: 'local',
  modelId: 'scion-1',
  comparison,
  localModel,
};
const report = { run: { status: 'passed' }, normalized: { graded: true, overall: 89 } };

const assess = (overrides = {}) =>
  assessResumableCourseEvidence({
    storedCourse,
    report,
    zipReady: true,
    manifestReady: true,
    course,
    provider: 'local',
    modelId: 'scion-1',
    expectedComparison: comparison,
    localModel,
    ...overrides,
  });

describe('Crucible hash-bound round resume', () => {
  it('reuses only complete identity-matched evidence', () => {
    expect(assess()).toEqual({ action: 'resume', reason: 'complete hash-matched evidence' });
  });

  it('regenerates an incomplete attempt instead of treating it as evidence', () => {
    expect(assess({ report: { run: { status: 'failed' } } })).toEqual({
      action: 'generate',
      reason: 'prior attempt is incomplete',
    });
  });

  it('rejects a model or benchmark-arm mismatch rather than mixing evidence', () => {
    const wrong = assess({
      storedCourse: {
        ...storedCourse,
        comparison: { ...comparison, variant: 'base-only' },
        localModel: { ...localModel, adapterId: 'another-adapter' },
      },
    });
    expect(wrong.action).toBe('reject');
    expect(wrong.reason).toContain('paired-benchmark identity');
    expect(wrong.reason).toContain('local-model identity');
  });

  it('rejects a changed prompt or lesson count even when the course id is unchanged', () => {
    const wrong = assess({
      course: { ...course, prompt: 'A different course request.', lessonCount: 14 },
    });
    expect(wrong).toMatchObject({ action: 'reject' });
    expect(wrong.reason).toContain('course input');
  });

  it('rejects a passed report whose ZIP or extracted manifest is missing', () => {
    expect(assess({ zipReady: false })).toEqual({
      action: 'reject',
      reason: 'report says passed but its grade, ZIP, or extracted manifest is incomplete',
    });
  });
});
