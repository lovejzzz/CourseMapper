import { describe, expect, it } from 'vitest';
import { buildCourseBlueprint, compileBlueprintDeliverable } from '../courseBlueprintCompiler';
import { normalizeCourseIR } from '../courseIR';

const facts = [
  'A sample is the observed subset of a population.',
  'A population is the entire group that a research question concerns.',
  'A sample proportion divides the observed number supporting a choice by the total number sampled.',
  'A daytime survey reaches 20 day-shift workers; 16 support a route change.',
  'No night-shift workers are included in the daytime survey.',
  'The observed proportion is 80 percent; it does not establish support among all 100 residents.',
];
const misconception = 'The sample proportion divides the observed number by the population size';
const correction = `The claim “${misconception}” is incorrect. Use “A sample proportion divides the observed number supporting a choice by the total number sampled” instead.`;

describe('Scion material fidelity after compilation', () => {
  it('keeps the full correction and late ledger limitations in the actual student guide', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Sample proportions and selection bias',
      lessons: [
        {
          title: 'Lesson 1: Sample proportions and selection bias',
          sections: [
            {
              topicSection: 'Sample proportions',
              learningObjectives: 'Calculate a sample proportion and explain its population boundary.',
              weeklyAssessments: 'Survey interpretation',
              syncActivities: 'Compare the observed sample with the population.',
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
      keyTerms: [
        {
          term: 'sample proportion',
          definition: facts[2],
          example: 'Dividing 16 supporters by the 20 surveyed workers.',
          misconception,
          correction,
        },
      ],
    };
    const guide = compileBlueprintDeliverable('studyGuides', blueprint, {
      skipPrepareBlueprint: true,
      skipCompilerContractCheck: true,
      skipLanguageFinalizer: true,
    }).studyGuides[0];
    expect(guide.sourceEvidenceBrief.claims).toEqual(facts);
    expect(guide.commonMisconceptions[0].correction).toContain(correction.slice(0, -1));
    expect(guide.commonMisconceptions[0].correction).toContain('by the total number sampled');
  });

  it('preserves a complete admitted correction through CourseIR normalization', () => {
    const fullCorrection = `${correction} The denominator is the observed sample count.`;
    expect(fullCorrection.length).toBeGreaterThan(220);
    expect(fullCorrection.length).toBeLessThanOrEqual(300);
    const ir = normalizeCourseIR({
      concepts: [
        {
          id: 'C1',
          term: 'sample proportion',
          vocabulary: [{ term: 'sample proportion', misconception, correction: fullCorrection }],
        },
      ],
    });
    expect(ir.concepts[0].vocabulary[0].correction).toBe(fullCorrection);
  });
});
