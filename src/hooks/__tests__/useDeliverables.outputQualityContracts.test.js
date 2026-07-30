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
    expect(source).toContain('Number(getGenerationConfig(fid)?.questionsPerLesson) || 5');
    expect(source).toContain('normalizeQuizBankQuestionCounts(merged, configuredQuizTarget)');
    expect(source).toContain('quizCountCheck.underfilledIndices');
  });
});
