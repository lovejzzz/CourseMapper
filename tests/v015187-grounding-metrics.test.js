// v0.15.187 — grounding is measured, not judged by feel.
//
// (a) measureGroundedFraction reports enrichment-tagged prose bytes vs total
//     per deliverable, excluding provenance/identity subtrees from both sides.
// (b) The compiler's dictionary defaults (lens/modality/genre/protocol)
//     record fallback hits, so "how often does a course fall through to the
//     generic register" is finally a number.
import { beforeEach, describe, expect, it } from 'vitest';
import { measureGroundedFraction, measurePackageGroundedFraction } from '../src/lib/quality/groundedFraction';
import { getContentFallbackTelemetry, resetContentFallbackTelemetry } from '../src/lib/contentFallbackTelemetry';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler';

describe('measureGroundedFraction', () => {
  it('counts strings under enrichmentSource-tagged subtrees as grounded', () => {
    const data = {
      items: [
        { enrichmentSource: 'lesson-content-enrichment', question: 'abcd', nested: { answer: 'efgh' } },
        { question: '12345678' },
      ],
    };
    const measured = measureGroundedFraction(data);
    expect(measured.groundedBytes).toBe(8 + 'lesson-content-enrichment'.length * 0); // tag key itself excluded
    expect(measured.totalBytes).toBe(16);
    expect(measured.fraction).toBe(0.5);
  });

  it('excludes provenance and identity subtrees from both sides', () => {
    const data = {
      prose: 'ABCD',
      sourceGrounding: { evidencePlan: { evidenceRequirement: 'this never renders to students' } },
      id: 'ignored-identity-value',
      tags: ['ignored', 'ignored'],
    };
    const measured = measureGroundedFraction(data);
    expect(measured.totalBytes).toBe(4);
    expect(measured.groundedBytes).toBe(0);
  });
});

const GENERIC_COURSE = {
  courseName: 'General Studies Overview',
  lessons: [1, 2, 3].map((n) => ({
    title: `Lesson ${n}: Broad Topic ${n}`,
    sections: [
      {
        topicSection: `${n}.1: General ideas`,
        learningGoals: `Understand broad topic ${n}.`,
        learningObjectives: `Discuss broad topic ${n}.`,
        weeklyAssessments: `Weekly submission ${n}`,
        asyncActivities: 'Read the module.',
        syncActivities: 'Talk it through.',
        supportingResources: 'Course pack',
      },
    ],
  })),
};

describe('content fallback telemetry', () => {
  beforeEach(() => resetContentFallbackTelemetry());

  it('records lens/modality fallbacks for a course no dictionary recognizes', () => {
    buildCourseBlueprint(GENERIC_COURSE);
    const telemetry = getContentFallbackTelemetry();
    expect(telemetry['lens-default']?.hits).toBeGreaterThanOrEqual(1);
    expect(telemetry['modality-default']?.hits).toBeGreaterThanOrEqual(1);
  });
});

describe('courseFaq atom routing (v0.15.187)', () => {
  // Lesson 1's identity tokens overlap the enrichment content — the
  // enrichmentMatchesLessonIdentity honesty gate requires it.
  const KERNEL_COURSE = {
    courseName: 'Applied Research Evidence',
    lessons: [
      {
        title: 'Lesson 1: Evidence Triangulation',
        sections: [
          {
            topicSection: '1.1: Evidence triangulation and corroboration',
            learningGoals: 'Use triangulation to test claims against independent sources.',
            learningObjectives: 'Explain when a claim is corroborated by independent evidence.',
            weeklyAssessments: 'Evidence memo triangulating one claim',
            asyncActivities: 'Read the triangulation primer.',
            syncActivities: 'Workshop the survey and interview excerpts.',
            supportingResources: 'Survey excerpt; interview notes',
          },
        ],
      },
      {
        title: 'Lesson 2: Reporting Findings',
        sections: [
          {
            topicSection: '2.1: Reporting standards',
            learningGoals: 'Report findings with appropriate caveats.',
            learningObjectives: 'Write findings with limitation language.',
            weeklyAssessments: 'Findings brief',
            asyncActivities: 'Review the reporting checklist.',
            syncActivities: 'Peer-review a findings draft.',
            supportingResources: 'Reporting checklist',
          },
        ],
      },
    ],
  };
  const FULL_KERNEL_ENRICHMENT = {
    source: 'metric-test',
    lessonContent: {
      'lesson-1': {
        quizItems: [],
        keyTerms: [
          {
            term: 'Evidence triangulation',
            definition:
              'Cross-checking a claim against at least two independent sources before treating it as established.',
            example: 'Comparing survey results with interview notes before reporting a finding.',
            misconception: 'Students often treat one strong source as sufficient proof for a claim.',
            correction: 'One source can support a claim, but only independent corroboration makes it defensible.',
          },
        ],
        assignmentCore: {
          taskDescription:
            'Write a two-page evidence memo triangulating one claim from the week using the provided survey and interview excerpts.',
          parameters: ['two pages', 'uses both provided sources', 'names one limitation'],
        },
        discussionPrompt: {
          prompt: 'Is one high-quality source ever enough to establish a program claim?',
          tension: 'Rigor demands corroboration, but field deadlines often allow only one source.',
          positions: [
            'No claim should ship without at least two independent sources',
            'A single rigorous source beats two weak ones under deadline pressure',
          ],
        },
        kernel: {
          facts: [
            'Triangulated claims survive peer review at roughly twice the rate of single-source claims',
            'Independent sources must differ in method, not just author, to count as triangulation',
          ],
          scenario: {
            setup: 'A program report claims attendance doubled based on one staff survey.',
            materials: 'the staff survey excerpt and the attendance log sample',
          },
        },
      },
    },
  };

  it('quotes authored debate positions in discussion stems and follow-ups', () => {
    const blueprint = buildCourseBlueprint(KERNEL_COURSE, { enrichment: FULL_KERNEL_ENRICHMENT });
    const compiled = compileBlueprintDeliverables(blueprint, ['discussions'], {});
    const discussion = compiled.discussions.discussions[0];
    const stems = discussion.responseStems.join('\n');
    const followUps = discussion.followUpProbes.join('\n');
    expect(stems).toContain('No claim should ship without at least two independent sources');
    expect(stems).toContain('A single rigorous source beats two weak ones under deadline pressure');
    expect(followUps).toContain('A single rigorous source beats two weak ones under deadline pressure');
    expect(followUps).toContain('Rigor demands corroboration');
    // Ungrounded lessons keep the template stems.
    const lessonTwo = compiled.discussions.discussions[1];
    expect(lessonTwo.responseStems.join('\n')).toContain('The evidence I find most convincing');
  });

  it('grounds FAQ answers in kernel atoms when present and tags them', () => {
    const blueprint = buildCourseBlueprint(KERNEL_COURSE, { enrichment: FULL_KERNEL_ENRICHMENT });
    const compiled = compileBlueprintDeliverables(blueprint, ['courseFaq'], {
      configMap: { courseFaq: { questionsPerLesson: 8 } },
    });
    const lessonOne = compiled.courseFaq.faqs[0];
    const answers = lessonOne.qs.map((item) => item.an).join('\n');

    // Atoms are quoted, not gestured at.
    expect(answers).toContain('Triangulated claims survive peer review');
    expect(answers).toContain('treat one strong source as sufficient proof');
    expect(answers).toContain('independent corroboration makes it defensible');
    // The artifact-name inside the quoted task may be shortened by the
    // reference machinery on 3rd+ mention — assert the stable tail.
    expect(answers).toContain('using the provided survey and interview excerpts');
    expect(answers).toContain('the staff survey excerpt and the attendance log sample');
    expect(answers).toContain('Cross-checking a claim against at least two independent sources');

    // Grounded items are tagged so the metric can see them.
    const groundedCount = lessonOne.qs.filter((item) => item.enrichmentSource).length;
    expect(groundedCount).toBeGreaterThanOrEqual(5);
    // Lesson 2 has no kernel and dilutes the feature-level fraction; the
    // grounded lesson alone measures ~2× this. 0.15 across the two-lesson
    // fixture is the regression floor (was 0.0 before v0.15.187).
    const measured = measureGroundedFraction(compiled.courseFaq);
    expect(measured.fraction).toBeGreaterThan(0.15);

    // Lessons without kernels keep the template fallback (no tag, no throw).
    const lessonTwo = compiled.courseFaq.faqs[1];
    expect(lessonTwo.qs.every((item) => !item.enrichmentSource)).toBe(true);
  });
});

describe('kernel studyGuide body (v0.15.187)', () => {
  it('parses sm/rs short keys and the compiler prefers the authored body', async () => {
    const { buildLessonKernelPrompt, parseLessonKernelResponse } = await import('../src/lib/blueprintEnrichmentPass');
    const prompt = buildLessonKernelPrompt(
      {
        courseName: 'Applied Research Evidence',
        // Title differs from the keyTerm below — lintEnrichedKeyTerm rejects
        // terms that merely restate the lesson title.
        lessons: [
          { title: 'Lesson 1: Corroborating Program Claims', sections: [{ topicSection: '1.1: Corroboration' }] },
        ],
      },
      [0],
      {},
    );
    expect(prompt.systemPrompt).toContain('studyGuide');
    expect(prompt.systemPrompt).toContain('sm=summary, rs=reviewStrategy');

    const response = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-1',
          facts: ['Triangulated claims survive peer review at roughly twice the rate of single-source claims'],
          keyTerms: [
            {
              tr: 'Evidence triangulation',
              df: 'Cross-checking a claim against at least two independent sources before treating it as established.',
              eg: 'Comparing survey results with interview notes.',
              mi: 'One strong source is treated as sufficient proof.',
              cx: 'Only independent corroboration makes a claim defensible.',
            },
          ],
          studyGuide: {
            sm: 'Triangulation tests every claim against at least two independent sources; the method-difference rule extends the test to program evaluation, where two same-method surveys never corroborate each other.',
            rs: 'Rehearse the method-difference rule on the survey-versus-log example until you can state why two staff surveys do not count as triangulation.',
          },
          mc: [],
        },
      ],
    });
    const parsed = parseLessonKernelResponse(response, { prompt, expectedLessonIds: ['lesson-1'] });
    expect(parsed.lessons['lesson-1'].studyGuide.summary).toContain('method-difference rule');
    expect(parsed.lessons['lesson-1'].studyGuide.reviewStrategy).toContain('two staff surveys');
  });

  it('compiled study guides use the authored summary and review strategy', () => {
    const enrichment = {
      source: 'metric-test',
      lessonContent: {
        'lesson-1': {
          quizItems: [],
          keyTerms: [],
          studyGuide: {
            summary:
              'Triangulation tests every claim against at least two independent sources; this lesson develops the method-difference rule for evidence review.',
            reviewStrategy:
              'Rehearse the method-difference rule on the survey-versus-log example until the distinction is automatic.',
          },
        },
      },
    };
    const course = {
      courseName: 'Applied Research Evidence',
      lessons: [
        {
          title: 'Lesson 1: Evidence Triangulation',
          sections: [
            {
              topicSection: '1.1: Evidence triangulation and independent sources',
              learningGoals: 'Use triangulation to test claims.',
              learningObjectives: 'Explain the method-difference rule for independent sources.',
              weeklyAssessments: 'Evidence review memo',
              asyncActivities: 'Read the triangulation primer.',
              syncActivities: 'Workshop paired sources.',
              supportingResources: 'Survey excerpt',
            },
          ],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(course, { enrichment });
    const compiled = compileBlueprintDeliverables(blueprint, ['studyGuides'], {});
    const guide = compiled.studyGuides.studyGuides[0];
    expect(guide.summary).toContain('method-difference rule');
    expect(guide.examPrep.reviewStrategy).toContain('survey-versus-log example');
  });
});

describe('package grounded fraction end to end', () => {
  it('reports zero grounding without enrichment and >0 for enriched quiz banks', () => {
    const bare = buildCourseBlueprint(GENERIC_COURSE);
    const bareCompiled = compileBlueprintDeliverables(bare, ['quizBank'], {});
    const bareMeasure = measurePackageGroundedFraction(bareCompiled);
    expect(bareMeasure.perFeature.quizBank.fraction).toBe(0);

    const enrichment = {
      source: 'metric-test',
      lessonContent: {
        'lesson-1': {
          quizItems: [
            {
              index: 0,
              type: 'multiple_choice',
              question: 'Which claim about broad topic one is best supported by the assigned evidence?',
              options: [
                'The evidence-supported claim named in the reading',
                'A plausible but unsupported generalization',
                'A claim the reading explicitly rejects',
                'A claim about a different topic entirely',
              ],
              answerIndex: 0,
              distractorRationales: [],
              answer: '',
              explanation: 'The reading grounds exactly one of these claims with cited evidence.',
              scoringGuidance: '',
            },
          ],
          keyTerms: [],
        },
      },
    };
    const enriched = buildCourseBlueprint(GENERIC_COURSE, { enrichment });
    const enrichedCompiled = compileBlueprintDeliverables(enriched, ['quizBank'], {});
    const enrichedMeasure = measurePackageGroundedFraction(enrichedCompiled);
    expect(enrichedMeasure.perFeature.quizBank.fraction).toBeGreaterThan(0);
    expect(enrichedMeasure.overall.totalBytes).toBeGreaterThan(0);
  });
});
