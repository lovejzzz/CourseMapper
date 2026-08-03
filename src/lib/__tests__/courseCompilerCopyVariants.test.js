import { describe, expect, it } from 'vitest';
import { buildGenericCriterionPerformanceBand } from '../courseCompilerRubricCopy';
import { assignmentSelfAssessmentEvidenceCheck } from '../courseCompilerSelfAssessmentCopy';
import {
  compactAssignmentBriefBodyReferences,
  compactCourseCopyFocus,
  compactRepeatedCourseFocusReferences,
} from '../courseCompilerCopyVariants';
import { examAtomPaddingOptions } from '../courseCompilerExamCopy';
import { assessmentRevisionCriterion, examFactCopy, slideDecisionMove } from '../courseCompilerPolish';
import { finalizeCompiledDeliverableLanguage } from '../compiledLanguageFinalizer';
import { isAppliedQuizStem } from '../quality/quizItemDepth';

describe('course compiler copy variants', () => {
  it('does not expose a generic Evidence artifact label on slides', () => {
    const copy = slideDecisionMove({
      lessonNumber: 1,
      concept: 'WCAG principles and conformance',
      decision: 'design decision',
      artifact: 'Evidence',
    });

    expect(copy).toContain('lesson artifact');
    expect(copy).not.toMatch(/\bfor Evidence\b/);
  });

  it('compacts a serial-list lesson title without leaving a dangling comma', () => {
    expect(compactCourseCopyFocus('accessible forms, testing, and remediation')).toBe('accessible forms and testing');
  });

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

  it('preserves exact assessment-contract objectives while compacting ordinary body copy', () => {
    const focus = 'Functions and automated tests';
    const objective = `Apply ${focus} in one practical example and justify one evidence-based revision.`;
    const result = compactAssignmentBriefBodyReferences({
      brief: {
        title: 'Comparison brief: Functions and automated tests',
        dueWeek: 'Week 3',
        assignmentType: 'Comparison brief',
        objectives: [objective],
        overview: `${focus} asks students to compare evidence from ${focus}.`,
      },
      lesson: { lessonNumber: 3 },
      fullFocus: focus,
      fallbackArtifact: 'Comparison brief: Functions and automated tests',
    });

    expect(result.objectives).toEqual([objective]);
    expect(result.overview).not.toContain(focus);
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

  it('falls back to the assessment genre instead of a trailing abstract noun', () => {
    const longBodyAlias = 'Week 14 Core tenets of power politics limitation';
    const result = compactAssignmentBriefBodyReferences({
      brief: {
        title: 'Core tenets of power politics application',
        dueWeek: 'Week 14',
        assignmentType: 'Checkpoint response',
        overview: `${longBodyAlias} asks students to test a claim. Revise ${longBodyAlias} before submission.`,
      },
      lesson: {
        lessonNumber: 14,
        artifactGenre: { label: 'Checkpoint response' },
      },
      fullFocus: 'Core tenets of power politics',
      fallbackArtifact: longBodyAlias,
    });

    expect(result.overview).not.toContain('Week 14 limitation');
    expect(result.overview).toContain('Week 14 checkpoint response');
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
    expect(body).not.toContain('Meiosis and Gamete Formation');
    expect(body).toContain('Gamete Formation–specific reasoning');
    expect(body).toContain('the Gamete Formation work');
    expect(result.title).toBe('Stages of Meiosis short analysis');
  });

  it('keeps exact identity in headings while removing it from every body in a multi-brief lesson', () => {
    const focus = 'Comparative Reading Methods';
    const result = compactAssignmentBriefBodyReferences({
      brief: {
        title: 'comparative essay proposal: Comparative Reading Methods',
        relatedLessons: [`Lesson 8: ${focus}`],
        overview: `${focus} asks students to compare two readings through ${focus}.`,
        instructions: [`Review ${focus}.`, `Revise the ${focus} claim.`],
        supportResources: [`${focus} source packet`],
      },
      lesson: { lessonNumber: 8 },
      fullFocus: focus,
      fallbackArtifact: 'comparative essay proposal',
    });

    const body = JSON.stringify([result.overview, result.instructions, result.supportResources]);
    expect(result.title).toContain(focus);
    expect(result.relatedLessons).toContain(`Lesson 8: ${focus}`);
    expect(body).not.toContain(focus);
  });

  it('keeps a named literary reading locatable without stamping its full title through the brief body', () => {
    const focus = 'The Thousand and One Nights';
    const repeated = Array.from(
      { length: 12 },
      (_, index) => `${focus} evidence move ${index + 1} supports the comparison.`,
    );
    const result = compactAssignmentBriefBodyReferences({
      brief: {
        title: 'comparative reading response',
        relatedLessons: [`Lesson 5: ${focus}`],
        dueWeek: 'Week 5',
        assignmentType: 'Comparative close-reading response',
        overview: repeated.slice(0, 3).join(' '),
        instructions: repeated.slice(3, 8),
        supportResources: repeated.slice(8),
      },
      lesson: {
        lessonNumber: 5,
        instructorNamedReadings: [focus],
      },
      fullFocus: focus,
      fallbackArtifact: 'comparative reading response',
    });

    const body = JSON.stringify([result.overview, result.instructions, result.supportResources]);
    expect(result.relatedLessons).toContain(`Lesson 5: ${focus}`);
    expect((body.match(/The Thousand and One Nights/g) || []).length).toBe(1);
    expect(body).toContain('Thousand One Nights–specific evidence');
  });

  it('recognizes quoted-title punctuation variants as the same named reading', () => {
    const courseFocus = 'Borges’s “The Library of Babel.”';
    const registryTitle = 'Borges’s “The Library of Babel”';
    const repeated = Array.from(
      { length: 12 },
      (_, index) => `${courseFocus} evidence move ${index + 1} supports the comparison.`,
    );
    const result = compactAssignmentBriefBodyReferences({
      brief: {
        title: 'final comparative paper',
        relatedLessons: [`Lesson 8: ${registryTitle}`],
        dueWeek: 'Week 8',
        assignmentType: 'Final comparative paper',
        overview: repeated.slice(0, 3).join(' '),
        instructions: repeated.slice(3, 8),
        supportResources: repeated.slice(8),
      },
      lesson: {
        lessonNumber: 8,
        instructorNamedReadings: [registryTitle],
      },
      fullFocus: courseFocus,
      fallbackArtifact: 'final comparative paper',
    });

    const body = JSON.stringify([result.overview, result.instructions, result.supportResources]);
    expect(result.relatedLessons).toContain(`Lesson 8: ${registryTitle}`);
    expect((body.match(/Borges’s “The Library of Babel”/g) || []).length).toBe(1);
    expect(body).toContain('Library Babel–specific evidence');
  });

  it('recognizes an author-prefixed lesson title as the same named reading', () => {
    const focus = 'Borges’s “The Library of Babel”';
    const registryTitle = 'The Library of Babel';
    const repeated = Array.from(
      { length: 12 },
      (_, index) => `${focus} evidence move ${index + 1} supports the comparison.`,
    );
    const result = compactAssignmentBriefBodyReferences({
      brief: {
        title: 'final comparative paper',
        relatedLessons: [`Lesson 8: ${focus}`],
        dueWeek: 'Week 8',
        assignmentType: 'Final comparative paper',
        overview: repeated.slice(0, 3).join(' '),
        instructions: repeated.slice(3, 8),
        supportResources: repeated.slice(8),
      },
      lesson: {
        lessonNumber: 8,
        instructorNamedReadings: [registryTitle],
      },
      fullFocus: focus,
      fallbackArtifact: 'final comparative paper',
    });

    const body = JSON.stringify([result.overview, result.instructions, result.supportResources]);
    expect(result.relatedLessons).toContain(`Lesson 8: ${focus}`);
    expect(body).not.toContain(focus);
    expect((body.match(/The Library of Babel/g) || []).length).toBe(1);
    expect(body).toContain('Library Babel–specific evidence');
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

  it('keeps a grammatical side of a short compound lesson title', () => {
    const result = compactRepeatedCourseFocusReferences(
      Array.from(
        { length: 6 },
        () => 'Use Qubits and quantum states evidence, then revisit the Qubits and quantum states focus.',
      ),
      'Qubits and quantum states',
      { limit: 1 },
    );
    const text = result.join(' ');
    expect(text).toContain('quantum states–specific evidence');
    expect(text).toContain('the quantum states focus');
    expect(text).not.toContain('Qubits quantum states');
  });

  it('keeps compact compiler assessment identities title-shaped', () => {
    const result = compactRepeatedCourseFocusReferences(
      {
        first: 'Teach Qubits and quantum states with one visible example.',
        second: 'Revisit Qubits and quantum states before the check.',
        artifact: 'Evidence explanation: Qubits and quantum states',
        followUp: 'Use Evidence explanation: Qubits and quantum states during peer review.',
        resource: 'Source packet for Qubits and quantum states: annotated excerpt plus activity prompt.',
      },
      'Qubits and quantum states',
      { limit: 2 },
    );

    expect(result.artifact).toBe('Evidence explanation: quantum states');
    expect(result.followUp).toContain('Evidence explanation: quantum states');
    expect(result.resource).toContain('Source packet for quantum states:');
    expect(JSON.stringify(result)).not.toContain('Evidence explanation: the quantum states focus');
    expect(JSON.stringify(result)).not.toContain('Source packet for the quantum states work');
  });

  it('does not hide an article-led full title inside compact local references', () => {
    const focus = 'The Medieval Journey Narrative';
    const result = compactRepeatedCourseFocusReferences(
      Array.from({ length: 10 }, () => `Use ${focus} evidence, then revise the ${focus} claim.`),
      focus,
      { limit: 2 },
    );

    const text = result.join(' ');
    expect((text.match(/The Medieval Journey Narrative/gi) || []).length).toBe(2);
    expect(text).toContain('Medieval Journey–specific claim');
    expect(text).not.toContain('the Medieval Journey Narrative focus');
  });

  it('drops introductory prepositions and possessive fragments from compact focus labels', () => {
    for (const [focus, expected] of [
      ['Introduction to Earth Systems', 'Earth Systems focus'],
      ['Review of Nutrient Functions', 'Nutrient Functions focus'],
      ['Erikson’s Psychosocial Development', 'Psychosocial Development focus'],
      ['Diurnal motion and the apparent daily motion of the sky', 'Diurnal motion focus'],
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
                "Watch for this misconception. the classical conditioning focus is only a definition. Students name the next the lesson assessment revision. The key ideas in diurnal motion is only a definition to memorize. Use today's the Erikson focus to separate a solid the key ideas detail from Instructor-selected Earth s Structure reading evidence. Focus students on the central The six classes of nutrients decision. Use Family and Family Members Vocabulary. A trainer rewards closer and closer approximations. Make the Week 5 assignment defend one interpretation. Present it in the locally approved submission form.",
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
    expect(text).toContain("Use today's Erikson focus to separate a solid key ideas detail");
    expect(text).toContain("Instructor-selected Earth's Structure reading evidence.");
    expect(text).toContain('the central six classes of nutrients decision.');
    expect(text).toContain('Use Family Members Vocabulary.');
    expect(text).toContain('closer and closer approximations.');
    expect(text).toContain('Use the Week 5 assignment to defend one interpretation.');
    expect(text).toContain('submission format specified in the course site.');
    expect(text).not.toContain('locally approved submission form');
  });

  it('repairs an echo introduced by study-guide title compression', () => {
    const data = {
      studyGuides: [
        {
          lessonNumber: 5,
          lessonTitle: 'Lesson 5: Family and Possession',
          overview: 'Family and Possession frames the evidence. Family and Possession supports revision.',
          reviewQuestions: [
            {
              hint: 'Use Family and Possession and Family Members Vocabulary in your explanation.',
            },
          ],
        },
      ],
    };
    const blueprint = {
      lessons: [{ lessonNumber: 5, title: 'Family and Possession', topic: 'Family' }],
    };

    finalizeCompiledDeliverableLanguage('studyGuides', data, blueprint);

    expect(JSON.stringify(data)).not.toMatch(/Family and Family Members Vocabulary/i);
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

  it('varies every analysis and revision performance band across lesson-scoped rubrics', () => {
    const build = (priority, variantIndex) =>
      buildGenericCriterionPerformanceBand({
        priority,
        concept: 'invocation',
        artifact: 'close-reading response',
        evidenceNoun: 'passage evidence',
        sourceCue: 'The Odyssey',
        evidenceSignal: 'Identify the formal detail that warrants the interpretation.',
        calibrationUse: 'Can two scorers locate the same warrant?',
        revisionTarget: 'Revise the evidence-to-claim link.',
        commonPitfall: 'Plot summary without formal analysis.',
        formatLabel: 'interpretive response',
        pick: (variants) => variants[variantIndex],
      });

    const analysis = [0, 1, 2, 3].map((index) => build('analysis and decision logic', index));
    const revision = [0, 1, 2, 3].map((index) => build('feedback-informed revision', index));
    const communication = [0, 1, 2, 3].map((index) => build('professional communication and format fit', index));

    for (const field of ['exemplary', 'proficient', 'developing', 'beginning']) {
      expect(new Set(analysis.map((band) => band[field])).size).toBe(4);
    }
    for (const field of ['exemplary', 'proficient', 'developing', 'beginning']) {
      expect(new Set(revision.map((band) => band[field])).size).toBe(4);
    }
    for (const field of ['exemplary', 'proficient', 'developing', 'beginning']) {
      expect(new Set(communication.map((band) => band[field])).size).toBe(4);
    }
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

  it('rotates repaired self-check copy by lesson while preserving the criterion intent', () => {
    const shared = {
      evidenceSignal: 'A strong signal addresses professional communication.',
      index: 2,
      lessonFocus: 'Close Reading',
      assignmentType: 'Interpretive memo',
    };
    const checks = [1, 2, 3, 4].map((lessonNumber) =>
      assignmentSelfAssessmentEvidenceCheck({ ...shared, lessonNumber }),
    );

    expect(new Set(checks).size).toBe(4);
    expect(checks.join(' ')).toMatch(/evidence/i);
    expect(checks.join(' ')).toMatch(/interpretive memo/i);
  });

  it('uses a concrete evidence decision for the first rotating fact-check variant', () => {
    const item = examFactCopy({
      lessonNumber: 1,
      assessmentTitle: 'Environmental Chemistry final',
      lessonFocus: 'Atmospheric Chemistry',
      answer: 'Photochemical reactions transform primary pollutants.',
    });

    expect(item.question).toContain('study group');
    expect(item.question).toContain('course evidence');
    expect(isAppliedQuizStem(item.question)).toBe(true);
  });

  it('removes leading articles from embedded revision-criterion labels', () => {
    const criterion = assessmentRevisionCriterion({
      title: 'Lesson 8: Comparative Reading Methods',
      concept: 'the Comparative Reading focus',
      artifact: 'the Week 8 assignment',
    });

    expect(criterion).not.toMatch(/Feedback-informed the |in the the /i);
    expect(criterion).toMatch(/Comparative Reading focus/);
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
    expect(questions[0]).toContain('study group');
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

  it('does not splice an imperative activity into a padded quiz option', () => {
    const options = examAtomPaddingOptions({
      concept: 'WCAG',
      lessonFocus: 'WCAG principles and conformance',
      sourceCue: 'Run critique round that tests how',
      lessonNumber: 1,
      questionIndex: 1,
    });
    const text = options.join(' ');

    expect(text).not.toContain('Run critique round that tests how');
    expect(text).toContain('the assigned source evidence');
  });
});
