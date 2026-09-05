import { describe, expect, it } from 'vitest';
import {
  SOURCE_ARITHMETIC_PROTOCOL,
  sourceArithmeticWorkedExample,
  sourceArithmeticGuidePractice,
} from '../sourceArithmeticStudyPractice';
import { buildCourseBlueprint, compileBlueprintDeliverable } from '../courseBlueprintCompiler';

describe('source proportion rehearsal', () => {
  it.each([
    ['16/20 = 0.80 = 80%', '16', '20', '0.80', '80'],
    ['3 / 8 = 0.375 = 37.5%', '3', '8', '0.375', '37.5'],
    ['0/7 = 0 = 0%', '0', '7', '0', '0'],
    ['7/7 = 1.00 = 100%', '7', '7', '1.00', '100'],
  ])(
    'checks both equalities in %s without changing the source numbers',
    (equation, numerator, denominator, decimal, percent) => {
      const claim = `The observed proportion is ${equation}.`;
      const worked = sourceArithmeticWorkedExample({ claims: [claim] });
      expect(worked.verification).toMatchObject({
        checked: true,
        numerator,
        denominator,
        decimal,
        percent,
        sourceClaim: claim,
        scope: 'arithmetic-only',
      });
      expect(worked.result).toContain(claim);
      expect(worked.steps).toContain(
        `Check the calculation by reversing it: ${decimal} × ${denominator} = ${numerator}.`,
      );
      expect(worked.transferTask).toContain('not a test of transfer');
      if (Number(decimal) === 0) expect(sourceArithmeticGuidePractice(worked).commonMisconceptions).toHaveLength(1);
    },
  );

  it.each([
    'The proportion is 16/20 = 0.90 = 90%.',
    'The proportion is 16/20 = 0.80 = 90%.',
    'The proportion is 1/3 = 0.33 = 33%.',
    'The proportion is 1/0 = 1 = 100%.',
    'The proportion is -16/20 = 0.80 = 80%.',
    'The proportion is 1.16/20 = 0.80 = 80%.',
    'The proportion is 16/20 = 0.80 = 80% = 90%.',
    'The proportion is 20/16 = 1.25 = 125%.',
    'The proportion is 80 percent.',
    'The date is 16/20 = 0.80 = 80%.',
  ])('does not turn unsupported arithmetic into a verified example: %s', (claim) => {
    expect(sourceArithmeticWorkedExample({ claims: [claim] })).toBeNull();
  });

  it('carries an admitted equation into the guide and teacher plan while respecting the lesson boundary', () => {
    const facts = [
      '20 volunteers joined a daytime workshop; 16 completed it.',
      'The sample completion proportion is 16/20 = 0.80 = 80%.',
      'Night-shift workers could not attend.',
      'Volunteering can introduce selection bias.',
      'These data alone do not establish the completion rate for all adult learners.',
    ];
    const blueprint = buildCourseBlueprint({
      courseName: 'Sample proportions',
      lessons: [
        {
          title: 'Sample proportions',
          sections: [
            {
              topicSection: 'Sample proportion calculation',
              learningObjectives:
                'Calculate the observed completion proportion and explain which learners the sample excludes.',
            },
          ],
        },
      ],
    });
    blueprint.lessons[0].enrichment = {
      kernel: {
        facts,
        provenance: {
          source: 'compiler-owned-exact-source-ledger',
          authority: 'instructor-supplied',
          copiedFactsVerbatim: true,
          factCount: facts.length,
        },
      },
      keyTerms: [],
    };
    const options = { skipPrepareBlueprint: true, skipCompilerContractCheck: true };
    const guide = compileBlueprintDeliverable('studyGuides', blueprint, options).studyGuides[0];
    expect(guide.workedExample.protocol).toBe(SOURCE_ARITHMETIC_PROTOCOL);
    expect(guide.workedExample.steps.join(' ')).toContain('16 ÷ 20 = 0.80');
    expect(guide.workedExample.result).not.toContain('.”.');
    expect(guide.sourceEvidenceBrief.claims).toEqual(facts);
    expect(guide.objectivePractice.join(' ')).not.toContain('Practice First');
    expect(guide.commonMisconceptions.map((item) => item.correction).join(' ')).toContain('0.80 × 100 = 80%');
    expect(guide.examScope).not.toContain('Week');
    const teacher = compileBlueprintDeliverable('lessonPlans', blueprint, {
      skipCompilerContractCheck: true,
    }).lessonPlans[0];
    expect(JSON.stringify(teacher)).toContain('16 ÷ 20 = 0.80');

    blueprint.lessons[0].enrichment.kernel.provenance.authority = 'model-provisional';
    const unverified = compileBlueprintDeliverable('studyGuides', blueprint, options).studyGuides[0];
    expect(unverified.workedExample?.protocol).not.toBe(SOURCE_ARITHMETIC_PROTOCOL);
  });
});
