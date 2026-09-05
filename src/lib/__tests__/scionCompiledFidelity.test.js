import { describe, expect, it, vi } from 'vitest';
import { buildCourseBlueprint, compileBlueprintDeliverable } from '../courseBlueprintCompiler';
import { normalizeCourseIR } from '../courseIR';
import {
  parseNativeSkeletonResponse,
  buildNativeWireMap,
  backfillNativeAuthoringFromLessonContent,
} from '../nativeGraphAuthoring';
import { projectKernelToSurfaces } from '../kernelProjection';
import { extractInstructorProvidedFacts } from '../sourceBriefConstraints';
import { buildLessonKernelPrompt, parseLessonKernelResponse } from '../blueprintEnrichmentPass';
import { runScionLocalCompletion } from '../scionLocalProvider';
import { buildScionGroundedRefinementPrompt, scionCallOpts } from '../scionPassB';
import { assessPublicScionKernelResponse } from '../publicScionProvider';

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
  it('admits lowercase instructor facts through the real exact-copy route without treating source casing as model truncation', async () => {
    const sourceText =
      'Source facts: 20 volunteers joined a daytime workshop; 16 completed it; the sample completion proportion is 16/20 = 0.80 = 80%; night-shift workers could not attend; volunteering can introduce selection bias; these data alone do not establish the completion rate for all adult learners. Include a worked calculation.';
    const facts = extractInstructorProvidedFacts(sourceText);
    const map = {
      courseName: 'Sample proportions',
      lessons: [
        {
          title: 'Sample proportions',
          sections: [
            {
              topicSection: 'Sample proportion and selection bias',
              learningObjectives:
                'Calculate a sample proportion and distinguish a sample result from a population claim.',
            },
          ],
        },
      ],
    };
    const prompt = buildLessonKernelPrompt(map, [0], { sourceBrief: sourceText, instructorProvidedFacts: facts });
    const runtimeLoader = vi.fn();
    const result = await runScionLocalCompletion({
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      task: 'blueprintEnrichment',
      ...scionCallOpts({ prompt, expectedLessonIds: ['lesson-1'] }),
      runtimeLoader,
    });
    expect(runtimeLoader).not.toHaveBeenCalled();
    expect(JSON.parse(result.rawText).lessons[0].facts).toEqual(facts);
    const diagnostics = {};
    const bound = buildScionGroundedRefinementPrompt({
      rawText: result.rawText,
      prompt,
      expectedLessonIds: ['lesson-1'],
      exactSourceProjection: true,
      diagnostics,
    });
    expect(diagnostics.issues).toEqual([]);
    expect(bound).not.toBeNull();
    expect(bound.lessons[0].topics).toContain('0.80 = 80%');
    const parsed = parseLessonKernelResponse(result.rawText, { prompt: bound, expectedLessonIds: ['lesson-1'] });
    expect(parsed.lessons['lesson-1'].kernel.facts).toEqual(facts);
    const blueprint = buildCourseBlueprint(map, {
      sourceBrief: sourceText,
      instructorProvidedFacts: facts,
      enrichment: { lessonContent: parsed.lessons },
    });
    const guide = compileBlueprintDeliverable('studyGuides', blueprint).studyGuides[0];
    expect(guide.sourceEvidenceBrief.claims.map((claim) => claim.toLowerCase())).toEqual(
      facts.map((fact) => fact.toLowerCase()),
    );

    // The exception does not authorize altered claims or lower-case sampled
    // model fragments; exact identity and ordinary generation gates still apply.
    const changed = JSON.parse(result.rawText);
    changed.lessons[0].facts[1] = changed.lessons[0].facts[1].replace('80%', '90%');
    const rejected = {};
    expect(
      buildScionGroundedRefinementPrompt({
        rawText: JSON.stringify(changed),
        prompt,
        expectedLessonIds: ['lesson-1'],
        exactSourceProjection: true,
        diagnostics: rejected,
      }),
    ).toBeNull();
    expect(rejected.issues.some((issue) => issue.includes('source-fact-ledger-mismatch'))).toBe(true);
    const sampled = assessPublicScionKernelResponse(result.rawText, prompt.userPrompt, 'blueprintEnrichment', {
      applyCompilerRepairs: false,
    });
    expect(sampled.issues.some((issue) => issue.includes('truncated-fact'))).toBe(true);
  });

  it('binds all eight compiler-owned source facts without applying the five-fact adapter limit', () => {
    const sourceFacts = [
      ...facts,
      'The survey records support for one proposed route change.',
      'No household outside the town was surveyed in this example.',
    ];
    const map = {
      courseName: 'Sample proportions',
      lessons: [
        {
          title: 'Sample proportions',
          sections: [
            {
              topicSection: 'Sample proportions',
              learningObjectives: 'Calculate the observed proportion and explain the sampling limits.',
            },
          ],
        },
      ],
    };
    const prompt = buildLessonKernelPrompt(map, [0], { instructorProvidedFacts: sourceFacts });
    const bound = buildScionGroundedRefinementPrompt({
      rawText: JSON.stringify({ lessons: [{ lessonId: 'lesson-1', facts: sourceFacts }] }),
      prompt,
      expectedLessonIds: ['lesson-1'],
      exactSourceProjection: true,
    });
    expect(bound).not.toBeNull();
    const parsed = parseLessonKernelResponse(
      JSON.stringify({ lessons: [{ lessonId: 'lesson-1', facts: sourceFacts }] }),
      { prompt: bound, expectedLessonIds: ['lesson-1'] },
    );
    expect(parsed.lessons['lesson-1'].kernel.facts).toEqual(sourceFacts);
  });
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

  it('keeps complete authored questions and answers when a shorter quiz changes their slot numbers', () => {
    const workedExample = {
      problem: 'Calculate the sample proportion for 16 supporters among 20 surveyed workers.',
      steps: ['Divide 16 by 20 to obtain 0.80.', 'Multiply by 100 to obtain 80 percent.'],
      result: 'The sample proportion is 80 percent.',
    };
    const essay = {
      index: 5,
      type: 'essay',
      question:
        'Evaluate the claim that the sample is the whole population. Take a position using the survey evidence.',
      answer:
        'The claim is incorrect. The sample consists of the 20 observed workers; it does not include all 100 residents.',
      scoringGuidance: 'Identify the sampled group and explain the evidence boundary.',
    };
    const enrichment = projectKernelToSurfaces(
      {
        facts,
        keyTerms: [{ term: 'Sample', definition: facts[0] }],
        workedExample,
        mc: [
          {
            question: 'Which group is the observed sample?',
            options: ['20 workers', '100 residents', 'All workers', 'No workers'],
            answerIndex: 0,
            explanation: 'The 20 workers are the observed subset.',
          },
          {
            question:
              'In a daytime survey that excluded night-shift workers, which limitation affects the population claim?',
            options: ['Selection bias', 'Arithmetic error', 'No sample', 'All residents were surveyed'],
            answerIndex: 0,
            explanation: 'Excluding night-shift workers limits representation.',
          },
        ],
      },
      {
        itemPlan: [
          { index: 0, type: 'multiple_choice' },
          { index: 1, type: 'multiple_choice' },
          { index: 3, type: 'short_answer' },
        ],
      },
    );
    enrichment.quizItems.push(essay);
    enrichment.kernel.provenance = {
      source: 'compiler-owned-exact-source-ledger',
      authority: 'instructor-supplied',
      copiedFactsVerbatim: true,
      factCount: facts.length,
    };
    const blueprint = buildCourseBlueprint(
      {
        courseName: 'Sample proportions',
        lessons: [
          {
            title: 'Sample proportions and selection bias',
            sections: [
              {
                topicSection: 'Sample proportions',
                learningObjectives: 'Calculate a sample proportion and distinguish sample from population.',
                weeklyAssessments: 'Survey analysis',
              },
            ],
          },
        ],
      },
      { instructorProvidedFacts: facts, enrichment: { lessonContent: { 'lesson-1': enrichment } } },
    );
    blueprint.lessons[0].enrichment = enrichment;
    const quiz = compileBlueprintDeliverable('quizBank', blueprint, {
      configMap: { quizBank: { questionsPerLesson: 4 } },
      skipPrepareBlueprint: true,
      skipCompilerContractCheck: true,
    }).quizzes[0];
    const practice = quiz.questions.find((q) => q.projectionKind === 'worked-example-retrieval');
    expect(practice?.answer).toContain('Divide 16 by 20 to obtain 0.80');
    expect(practice.explanation).toBe('');
    expect(practice.bloomsLevel).toBe('Apply');
    expect(quiz.questions.find((q) => q.question.includes('Evaluate the claim'))?.answer).toBe(essay.answer);
    expect(new Set(quiz.questions.map((q) => q.question)).size).toBe(quiz.questions.length);
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
