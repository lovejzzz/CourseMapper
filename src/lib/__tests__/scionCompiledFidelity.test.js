import { describe, expect, it } from 'vitest';
import { buildCourseBlueprint, compileBlueprintDeliverable } from '../courseBlueprintCompiler';
import { normalizeCourseIR } from '../courseIR';
import {
  parseNativeSkeletonResponse,
  buildNativeWireMap,
  backfillNativeAuthoringFromLessonContent,
} from '../nativeGraphAuthoring';
import { projectKernelToSurfaces } from '../kernelProjection';
import { extractInstructorProvidedFacts } from '../sourceBriefConstraints';
import { buildLessonKernelPrompt } from '../blueprintEnrichmentPass';

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
  it('carries a real single-lesson brief through skeleton parsing and the source ledger without losing the objective or decimals', () => {
    const objective = 'calculate a sample proportion and distinguish a sample result from a population claim.';
    const sourceText = `A single 45-minute introductory statistics lesson for adults: ${objective} Source facts: 20 volunteers joined a daytime workshop; 16 completed it; the sample proportion is 16/20 = 0.80 = 80%; night-shift workers could not attend; volunteering can introduce selection bias; these data alone do not establish the rate for all adult learners. Include a worked calculation.`;
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'Sample proportions' },
        sessions: [{ order: 1, title: 'Sample proportions', sectionTitles: ['Calculation', 'Selection bias'] }],
        assessments: [],
        readings: [],
        resources: [],
      }),
      { expectedLessons: 1, sourceText },
    );
    const wire = buildNativeWireMap(skeleton);
    expect(JSON.stringify(wire)).toContain(objective);
    const facts = extractInstructorProvidedFacts(sourceText);
    const prompt = buildLessonKernelPrompt(wire, [0], { sourceBrief: sourceText, instructorProvidedFacts: facts });
    expect(prompt.lessons[0].sourceFacts).toEqual(facts);
    const authored = backfillNativeAuthoringFromLessonContent({
      skeleton,
      lessonContent: {
        'lesson-1': {
          kernel: {
            facts,
            provenance: {
              source: 'compiler-owned-exact-source-ledger',
              authority: 'instructor-supplied',
              copiedFactsVerbatim: true,
            },
          },
          keyTerms: [],
        },
      },
    });
    expect(buildNativeWireMap(skeleton, authored).lessons[0].sections[0].learningObjectives).toContain(objective);
  });
  it('turns a worked example into an answerable practice item with the complete worked answer', () => {
    const surfaces = projectKernelToSurfaces(
      {
        facts: [],
        keyTerms: [],
        workedExample: {
          problem: 'What percentage is 16 out of 20?',
          steps: ['Divide 16 by 20 to get 0.80', 'Multiply 0.80 by 100'],
          result: 'The sample proportion is 80%.',
        },
      },
      { itemPlan: [{ index: 0, type: 'short_answer' }] },
    );
    expect(surfaces.quizItems[0].question).toContain('16 out of 20');
    expect(surfaces.quizItems[0].answer).toContain('Divide 16 by 20 to get 0.80. Multiply 0.80 by 100.');
    expect(surfaces.quizItems[0].scoringGuidance).toContain('not evidence of independent transfer');
  });
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
      assignmentCore: {
        taskDescription: 'Calculate 16/20 and explain why the result cannot describe night-shift workers.',
        parameters: [],
      },
      studyGuide: { summary: 'The sample proportion is 80%; the sampling frame omits night-shift workers.' },
    };
    const guide = compileBlueprintDeliverable('studyGuides', blueprint, {
      skipPrepareBlueprint: true,
      skipCompilerContractCheck: true,
      skipLanguageFinalizer: true,
    }).studyGuides[0];
    expect(guide.sourceEvidenceBrief.claims).toEqual(facts);
    expect(guide.objectivePractice).toEqual([
      'Calculate 16/20 and explain why the result cannot describe night-shift workers.',
    ]);
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
