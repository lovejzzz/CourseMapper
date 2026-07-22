import { describe, expect, it } from 'vitest';
import {
  assignmentSelfAssessmentEvidenceCheck,
  compactAssignmentBriefBodyReferences,
  compactRepeatedCourseFocusReferences,
  examAtomPaddingOptions,
} from '../courseCompilerCopyVariants';
import { examFactCopy } from '../courseCompilerPolish';
import { finalizeCompiledDeliverableLanguage } from '../compiledLanguageFinalizer';
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

  it('keeps assignment identity visible without stamping the full lesson title through the body', () => {
    const focus = 'Meiosis and Gamete Formation';
    const result = compactAssignmentBriefBodyReferences({
      brief: {
        title: 'Stages of Meiosis short analysis',
        dueWeek: 'Week 2',
        assignmentType: 'Analysis log',
        overview: `${focus} asks students to connect ${focus} evidence to a decision.`,
        instructions: [
          `Review the ${focus} materials.`,
          `Choose evidence for ${focus}.`,
          `Trace the ${focus} reasoning and qualify the ${focus} claim.`,
          `Organize the response around ${focus}.`,
        ],
        gradingCriteria: [`Source-backed ${focus} reasoning`, `${focus} evidence quality`],
      },
      lesson: { lessonNumber: 2 },
      fullFocus: focus,
      fallbackArtifact: 'Week 2 analysis',
    });

    const body = JSON.stringify([result.overview, result.instructions, result.gradingCriteria]);
    expect((body.match(/Meiosis and Gamete Formation/g) || []).length).toBeLessThanOrEqual(4);
    expect(body).toContain('Meiosis Gamete Formation–specific reasoning');
    expect(body).toContain('the Meiosis Gamete Formation work');
    expect(result.title).toBe('Stages of Meiosis short analysis');
  });

  it('compacts repeated lesson-plan focus while preserving grammatical course-material references', () => {
    const focus = 'Mendelian Inheritance Basics';
    const result = compactRepeatedCourseFocusReferences(
      {
        opening: `${focus} introduces the model. ${focus} gives students a shared vocabulary.`,
        source: `${focus} course materials support the first claim.`,
        practice: [`Review ${focus}.`, `Use evidence from ${focus}.`, `Revise the ${focus} reasoning.`],
      },
      focus,
      { limit: 2 },
    );

    const text = JSON.stringify(result);
    expect((text.match(/Mendelian Inheritance Basics/g) || []).length).toBe(2);
    expect(result.source).toContain("Mendelian Inheritance lesson's course materials");
    expect(result.practice.join(' ')).toContain('the Mendelian Inheritance work');
    expect(result.practice.join(' ')).toContain('Mendelian Inheritance–specific reasoning');
  });

  it('does not hide a full three-word title inside every compact replacement', () => {
    const focus = 'DNA Structure Fundamentals';
    const result = compactRepeatedCourseFocusReferences(
      {
        materials: [`the ${focus} materials`, `${focus} preparation brief`, `${focus} notes`, `${focus} source packet`],
        teaching: [
          `Use the ${focus} focus to frame the example.`,
          `Trace ${focus} evidence to a decision.`,
          `Revise the ${focus} reasoning.`,
          `Return to ${focus} for the final check.`,
          `Close with the ${focus} focus.`,
        ],
      },
      focus,
      { limit: 2 },
    );

    const text = JSON.stringify(result);
    expect((text.match(/DNA Structure Fundamentals/g) || []).length).toBe(2);
    expect(text).toContain('DNA Structure–specific evidence');
    expect(text).toContain('the DNA Structure focus');
    expect(text).not.toContain('the the DNA Structure focus');
  });

  it('drops introductory prepositions and possessive fragments from compact focus labels', () => {
    for (const [focus, expected] of [
      ['Introduction to Earth Systems', 'Earth Systems focus'],
      ['Review of Nutrient Functions', 'Nutrient Functions focus'],
      ['Erikson’s Psychosocial Development', 'Erikson Psychosocial Development focus'],
    ]) {
      const result = compactRepeatedCourseFocusReferences(
        Array.from({ length: 8 }, () => `${focus} supports the next decision.`),
        focus,
        { limit: 1 },
      );
      const text = result.join(' ');
      expect(text).toContain(expected);
      expect(text).not.toMatch(/(?:to Earth|of Nutrient|Erikson s) focus/i);
    }
  });

  it('repairs reader-visible sentence starts, determiner collisions, and plural agreement', () => {
    const data = {
      lessonPlans: [
        {
          lessonNumber: 1,
          outline: [
            {
              instructorNotes:
                'Watch for this misconception. the classical conditioning focus is only a definition. Students name the next the lesson assessment revision. The key ideas in diurnal motion is only a definition to memorize.',
            },
          ],
        },
      ],
    };

    finalizeCompiledDeliverableLanguage('lessonPlans', data, {});
    const text = data.lessonPlans[0].outline[0].instructorNotes;
    expect(text).toContain('Watch for this misconception. The classical conditioning focus');
    expect(text).toContain('Students name the next lesson assessment revision.');
    expect(text).toContain('The key ideas in diurnal motion are only a definition to memorize.');
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

  it('keeps compound and plural concept labels grammatical in padded quiz options', () => {
    const options = examAtomPaddingOptions({
      concept: 'Dominant and recessive alleles',
      lessonFocus: 'Mendelian inheritance',
      sourceCue: 'the assigned lesson evidence',
      lessonNumber: 1,
      questionIndex: 0,
    });
    const text = options.join(' ');

    expect(text).toContain('the phrase “Dominant and recessive alleles”');
    expect(text).not.toMatch(/Dominant and recessive alleles (?:is|covers|requires|needs)\b/i);
  });
});
