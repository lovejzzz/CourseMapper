import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/hooks/useDeliverables.js', 'utf8');

describe('useDeliverables output-quality contracts', () => {
  it('fails closed when Course FAQ generation is unusable', () => {
    expect(source).not.toContain('buildFallbackCourseFaq');
    expect(source).not.toContain('completeFallbackCourseFaq');
    expect(source).not.toContain('created a course-map-based FAQ instead');
    expect(source).toContain("markFeatureError(fid, 'All chunks failed')");
    expect(source).toContain("markFeatureError(fid, 'Failed to merge chunks')");
  });

  it('retries quiz lessons against the configured question target', () => {
    expect(source).not.toContain('const minQuestions = 5');
    expect(source).toContain('Number(getGenerationConfig(fid).questionsPerLesson) || 8');
    expect(source).toContain('normalizeQuizBankQuestionCounts(merged, configuredQuizTarget)');
    expect(source).toContain('quizCountCheck.underfilledIndices');
    expect(source).toContain('removedUnderfilledForRetry');
    expect(source).toContain('questionRetryBaseline = merged');
    expect(source).toContain('getGenerationConfig(fid).questionsPerLesson');
    expect(source).toContain('maxQuestions: getGenerationConfig(fid).questionsPerLesson');
    expect(source).toContain('questionRetryResults.set(retryChunkIndex, retryData)');
    expect(source).toContain('patchScopeNumbering(parsed, fid, retryScope, courseMap)');
    expect(source).toContain('mergeQuestionRetryResults(fid, questionRetryBaseline, questionRetryResults, {');
  });
});
