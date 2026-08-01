import { describe, it, expect } from 'vitest';
import {
  buildQualityScorePrompt,
  scoreHeuristic,
  computeAvgScore,
  scoreColor,
  signalBand,
  QUALITY_SCORER_SYSTEM_PROMPT,
} from '../deliverableQualityScorer';

describe('QUALITY_SCORER_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof QUALITY_SCORER_SYSTEM_PROMPT).toBe('string');
    expect(QUALITY_SCORER_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('mentions scoring dimensions', () => {
    expect(QUALITY_SCORER_SYSTEM_PROMPT).toContain('bloomsAlignment');
    expect(QUALITY_SCORER_SYSTEM_PROMPT).toContain('specificity');
    expect(QUALITY_SCORER_SYSTEM_PROMPT).toContain('actionability');
    expect(QUALITY_SCORER_SYSTEM_PROMPT).toContain('qmAlignment');
  });
});

describe('buildQualityScorePrompt', () => {
  it('returns a string containing the featureId', () => {
    const result = buildQualityScorePrompt('lessonPlans', { lessonPlans: [] });
    expect(result).toContain('lessonPlans');
  });

  it('caps output at ~800 chars', () => {
    const bigData = { lessonPlans: Array(100).fill({ objectives: ['A'.repeat(100)] }) };
    const result = buildQualityScorePrompt('lessonPlans', bigData);
    // The prompt prefix adds some chars, but the sample portion should be ≤ 800
    expect(result.length).toBeLessThan(900);
  });

  it('handles quiz bank data', () => {
    const data = { quizzes: [{ questions: [{ question: 'What is 2+2?' }] }] };
    const result = buildQualityScorePrompt('quizBank', data);
    expect(result).toContain('QUIZ SAMPLE');
    expect(result).toContain('What is 2+2?');
  });

  it('samples canonical quiz content instead of a stale legacy alias', () => {
    const result = buildQualityScorePrompt('quizBank', {
      quizBank: [{ questions: [{ question: 'Canonical scoring question' }] }],
      quizzes: [{ questions: [{ question: 'Stale scoring question' }] }],
    });

    expect(result).toContain('Canonical scoring question');
    expect(result).not.toContain('Stale scoring question');
  });

  it('falls back to generic JSON for unknown featureId', () => {
    const data = { custom: 'some data' };
    const result = buildQualityScorePrompt('customThing', data);
    expect(result).toContain('customThing');
    expect(result).toContain('custom');
  });
});

describe('scoreHeuristic', () => {
  it('returns all four scoring dimensions', () => {
    const result = scoreHeuristic('lessonPlans', { lessonPlans: [] });
    expect(result).toHaveProperty('bloomsAlignment');
    expect(result).toHaveProperty('specificity');
    expect(result).toHaveProperty('actionability');
    expect(result).toHaveProperty('qmAlignment');
    expect(result).toHaveProperty('tips');
    expect(result).toMatchObject({
      evidenceClass: 'deterministic',
      validationTier: 'automated-signal',
      construct: 'surface-content-signals',
    });
  });

  it('scores higher for detailed content with Blooms keywords', () => {
    const richData = {
      lessonPlans: [
        {
          objectives: ['Students will analyze data', 'Students will evaluate results', 'Students will create models'],
          activities: ['Demonstrate the technique', 'Design a rubric', 'Assess the criteria', 'Critique the approach'],
          assessment:
            'Students will synthesize findings using rubric criteria with points and minutes allocated per step',
          extra: 'A'.repeat(3000), // bulk up to get high specificity
        },
      ],
    };
    const result = scoreHeuristic('lessonPlans', richData);
    expect(result.bloomsAlignment).toBeGreaterThanOrEqual(6);
    expect(result.specificity).toBeGreaterThanOrEqual(6);
  });

  it('recognizes A-quality trace evidence without treating internal heuristics as perfect proof', () => {
    const traceEvidence = Array(20)
      .fill(
        [
          'Students analyze evaluate create synthesize apply demonstrate design critique assess.',
          'Use retrieval, spaced practice, transfer, metacognitive reflection, cumulative practice, revision, and feedback.',
          'Evidence, source, criterion, criteria, success criteria, artifact, assessment, rubric, calibration, bias check, and target construct are visible.',
          'Minutes, step, checklist, example, template, review, revise, share, score, support, extension, and diagnostic moves are ready.',
          'Objective alignment, measurable learning outcome, variety, multiple support paths, accommodation, accessibility, interaction, collaboration, peer group active learning, source integrity, do not invent, local review, publish boundary, human review, learner context, and participation are explicit.',
        ].join(' '),
      )
      .join(' ');
    const result = scoreHeuristic('lessonPlans', { lessonPlans: [{ title: 'A-quality trace', body: traceEvidence }] });

    expect(computeAvgScore(result)).toBe(9);
    expect(result.bloomsAlignment).toBe(9);
    expect(result.specificity).toBe(9);
    expect(result.actionability).toBe(9);
    expect(result.qmAlignment).toBe(9);
  });

  it('scores lower for sparse content', () => {
    const result = scoreHeuristic('lessonPlans', { lessonPlans: [{ title: 'Intro' }] });
    expect(result.specificity).toBeLessThanOrEqual(5);
    expect(result.tips.length).toBeGreaterThan(0);
  });

  it('provides tips array with max 3 items', () => {
    const result = scoreHeuristic('lessonPlans', {});
    expect(Array.isArray(result.tips)).toBe(true);
    expect(result.tips.length).toBeLessThanOrEqual(3);
  });
});

describe('computeAvgScore', () => {
  it('returns null for null input', () => {
    expect(computeAvgScore(null)).toBeNull();
  });

  it('computes average of 4 dimensions', () => {
    const quality = { bloomsAlignment: 8, specificity: 6, actionability: 10, qmAlignment: 8 };
    expect(computeAvgScore(quality)).toBe(8);
  });

  it('handles missing qmAlignment (backward compat)', () => {
    const quality = { bloomsAlignment: 9, specificity: 6, actionability: 6 };
    expect(computeAvgScore(quality)).toBe(7);
  });

  it('rounds to one decimal place', () => {
    const quality = { bloomsAlignment: 7, specificity: 8, actionability: 6, qmAlignment: 5 };
    expect(computeAvgScore(quality)).toBe(6.5);
  });
});

describe('scoreColor', () => {
  it('returns green for scores >= 8', () => {
    const color = scoreColor(8.5);
    expect(color.bg).toContain('emerald');
    expect(color.text).toContain('emerald');
  });

  it('returns amber for scores >= 6', () => {
    const color = scoreColor(7);
    expect(color.bg).toContain('amber');
  });

  it('returns red for scores < 6', () => {
    const color = scoreColor(4);
    expect(color.bg).toContain('red');
  });
});

describe('signalBand', () => {
  it('uses bounded language instead of exposing a quality score claim', () => {
    expect(signalBand(8.5).shortLabel).toBe('Strong');
    expect(signalBand(6.5).shortLabel).toBe('Mixed');
    expect(signalBand(4).shortLabel).toBe('Weak');
  });
});
