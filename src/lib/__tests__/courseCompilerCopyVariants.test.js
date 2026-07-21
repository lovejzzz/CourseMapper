import { describe, expect, it } from 'vitest';
import {
  assignmentSelfAssessmentEvidenceCheck,
  compactAssignmentBriefBodyReferences,
} from '../courseCompilerCopyVariants';
import { examFactCopy } from '../courseCompilerPolish';
import { isAppliedQuizStem } from '../quality/quizItemDepth';

describe('course compiler copy variants', () => {
  it('keeps the canonical assignment heading but compacts its week-prefixed body alias', () => {
    const canonicalTitle =
      'Review of statistical inference application check: choose evidence that supports one course decision.';
    const longBodyAlias = 'Week 13 review of statistical inference application check';
    const result = compactAssignmentBriefBodyReferences({
      brief: {
        title: canonicalTitle,
        dueWeek: 'Week 13',
        assignmentType: 'Checkpoint response',
        overview: `${longBodyAlias} asks students to select evidence. Revise ${longBodyAlias} before submission.`,
        instructions: [`Use the rubric for ${longBodyAlias}.`],
      },
      lesson: {},
      fullFocus: 'Review of statistical inference',
      fallbackArtifact: longBodyAlias,
    });

    expect(result.title).toBe(canonicalTitle);
    expect(JSON.stringify([result.overview, result.instructions])).not.toContain(longBodyAlias);
    expect(result.overview).toContain('Week 13 application check');
    expect(result.overview).not.toContain('Week 13 Week 13');
  });

  it('uses the discipline-aware genre when a week-prefixed artifact alias is still too long', () => {
    const canonicalTitle =
      "Homer's Epic Structure evidence memo: explain how form, language, or context changes the reading.";
    const longBodyAlias = "Week 3 Homer's Epic Structure evidence memo";
    const result = compactAssignmentBriefBodyReferences({
      brief: {
        title: canonicalTitle,
        dueWeek: 'Week 3',
        assignmentType: 'Interpretive analysis portfolio',
        overview: `${longBodyAlias} asks students to cite a passage. Revise ${longBodyAlias} before submission.`,
        instructions: [`Use the rubric for ${longBodyAlias}.`],
      },
      lesson: { lessonNumber: 3, artifactGenre: { label: 'Interpretive analysis portfolio' } },
      fullFocus: 'Homeric Epic',
      fallbackArtifact: longBodyAlias,
    });

    const body = JSON.stringify([result.overview, result.instructions]);
    expect(result.title).toBe(canonicalTitle);
    expect(body).not.toContain(longBodyAlias);
    expect(body).toContain('Week 3 memo');
  });

  it('turns generic rubric echoes into complete student self-checks', () => {
    const shared = {
      lessonFocus: 'Statistical Inference Review',
      assignmentType: 'Checkpoint response',
    };
    const signals = [
      'Criterion: Statistical Inference Review accuracy. Look.',
      'Strong evidence addresses analysis logic for statistical inference review. It supports a specific decision.',
      'A strong signal addresses professional communication.',
      'Revise Week 13 checkpoint response for this criterion: Revision note showing how feedback changed Review.',
    ];
    const results = signals.map((evidenceSignal, index) =>
      assignmentSelfAssessmentEvidenceCheck({ ...shared, evidenceSignal, index }),
    );

    expect(results).toEqual([
      'Identify one inspectable Statistical Inference Review detail from the lesson materials, explain the checkpoint response decision it supports, and state one limitation',
      'Trace the reasoning from Statistical Inference Review evidence to the checkpoint response decision and name the assumption or tradeoff that could change it',
      'Make the evidence, decision, and limitation easy for a reader to locate in the checkpoint response',
      'Name one feedback-informed revision to the checkpoint response and explain how it strengthened the evidence or reasoning',
    ]);
    expect(results.join(' ')).not.toMatch(/\b(?:Look|choose evidence)\.$/i);
  });

  it('preserves domain-specific evidence signals', () => {
    const signal = 'Each interval label shows the counted span and the quality check used to verify it.';
    expect(
      assignmentSelfAssessmentEvidenceCheck({
        evidenceSignal: signal,
        index: 0,
        lessonFocus: 'Compound Intervals',
        assignmentType: 'Analysis worksheet',
      }),
    ).toBe(signal);
  });

  it('uses a concrete evidence decision for the first rotating fact-check variant', () => {
    const item = examFactCopy({
      lessonNumber: 1,
      assessmentTitle: 'Environmental Chemistry final',
      lessonFocus: 'Atmospheric Chemistry',
      answer: 'Photochemical reactions transform primary pollutants.',
    });

    expect(item.question).toContain('lab team');
    expect(item.question).toContain('course evidence');
    expect(isAppliedQuizStem(item.question)).toBe(true);
  });

  it('rotates fact-check stems across question seats in the same lesson', () => {
    const questions = [0, 1, 2, 4].map(
      (questionIndex) =>
        examFactCopy({
          lessonNumber: 1,
          questionIndex,
          assessmentTitle: 'Environmental Chemistry final',
          lessonFocus: 'Atmospheric Chemistry',
          answer: 'Photochemical reactions transform primary pollutants.',
        }).question,
    );

    expect(new Set(questions).size).toBe(4);
    expect(questions[0]).toContain('lab team');
  });
});
