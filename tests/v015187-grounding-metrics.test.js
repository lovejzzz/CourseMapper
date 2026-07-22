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
      configMap: { courseFaq: { questionsPerLesson: 10 } },
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
    // Mid-sentence joins lowercase the lead ('… means cross-checking …').
    expect(answers).toContain('ross-checking a claim against at least two independent sources');

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

  // Live crucible P2 (the last texture point): authored corrections and
  // definitions often LEAD with their own term ("Dictionaries are accessed
  // by key…"). "the trap for X: X …" minted the exact "X: X" echo chain the
  // grader hunts. Every term/atom join now drops the redundant term when the
  // atom already leads with it.
  it('never mints an "X: X" echo when the authored atom leads with its term', () => {
    const echoEnrichment = JSON.parse(JSON.stringify(FULL_KERNEL_ENRICHMENT));
    echoEnrichment.lessonContent['lesson-1'].keyTerms[0] = {
      term: 'Evidence triangulation',
      definition:
        'Evidence triangulation cross-checks a claim against at least two independent sources before treating it as established.',
      example: 'Comparing survey results with interview notes before reporting a finding.',
      misconception: 'Students often treat one strong source as sufficient proof for a claim.',
      correction:
        'Evidence triangulation requires independent corroboration before a claim can be treated as defensible.',
    };
    const blueprint = buildCourseBlueprint(KERNEL_COURSE, { enrichment: echoEnrichment });
    const compiled = compileBlueprintDeliverables(blueprint, ['courseFaq', 'quizBank'], {
      configMap: { courseFaq: { questionsPerLesson: 10 } },
    });
    const allText = JSON.stringify(compiled.courseFaq) + JSON.stringify(compiled.quizBank);
    // The grader's exact echo pattern (artifactDefectPatterns v0.12.1).
    expect(allText).not.toMatch(/\b([A-Z][\w &'-]{3,50}): \1\b/);
    // The correction still ships — just without the redundant connective.
    const answers = compiled.courseFaq.faqs[0].qs.map((item) => item.an).join('\n');
    expect(answers).toContain('requires independent corroboration');
  });

  it('keeps a correction that starts with a term tail out of the "X: For X" echo shape', () => {
    const echoEnrichment = JSON.parse(JSON.stringify(FULL_KERNEL_ENRICHMENT));
    echoEnrichment.lessonContent['lesson-1'].keyTerms[0] = {
      term: 'Concepts of the Fantastic',
      definition: 'The fantastic challenges stable categories of narrative and reality.',
      example: 'A library that contains every possible book makes order and meaning unstable.',
      misconception: 'Students may treat the first clue as resolving every question.',
      correction: 'For Fantastic and Infinite Library, connect the claims and preserve the open question.',
    };
    const blueprint = buildCourseBlueprint(KERNEL_COURSE, { enrichment: echoEnrichment });
    const compiled = compileBlueprintDeliverables(blueprint, ['courseFaq'], {
      configMap: { courseFaq: { questionsPerLesson: 10 } },
    });
    const answers = compiled.courseFaq.faqs[0].qs.map((item) => item.an).join('\n');

    expect(answers).toContain('That is the trap for Concepts of the Fantastic. For Fantastic and Infinite Library');
    expect(answers).not.toMatch(/\b([A-Z][\w &'-]{3,50}): For \1\b/);
  });

  // Live crucible round 6 P1: the slide evidence-table cell composed
  // "definition — e.g., Example" without terminal punctuation; an example
  // ending on a preposition then read as a truncated bullet in the PPTX
  // audit. The composed cell is a full sentence: lowercased example lead,
  // terminal period.
  it('slide evidence-table cells end with terminal punctuation', () => {
    // The evidence table needs >= 2 authored term rows, each composed cell
    // within the exporter's 130-char row guard.
    const tableEnrichment = JSON.parse(JSON.stringify(FULL_KERNEL_ENRICHMENT));
    tableEnrichment.lessonContent['lesson-1'].keyTerms = [
      {
        term: 'Evidence triangulation',
        definition: 'Cross-checking a claim against two independent sources first.',
        example: 'Comparing survey results with the interview notes over',
        misconception: 'Students often treat one strong source as sufficient proof for a claim.',
        correction: 'One source can support a claim, but only independent corroboration makes it defensible.',
      },
      {
        term: 'Corroboration standard',
        definition: 'The bar a source must clear to count as corroboration.',
        example: 'A second source with an unshared method',
        misconception: 'Any second citation is treated as corroboration.',
        correction: 'A source only corroborates when its method is independent of the first.',
      },
    ];
    const blueprint = buildCourseBlueprint(KERNEL_COURSE, { enrichment: tableEnrichment });
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks'], {});
    const text = JSON.stringify(compiled.slideDecks);
    const cell = text.match(/[^"]*— e\.g\., [^"]*/);
    expect(cell).not.toBeNull();
    // The composed cell is a full sentence: lowercased example lead and a
    // terminal period even when the example ends on a preposition ("over").
    expect(cell[0]).toContain('— e.g., comparing survey results');
    expect(cell[0]).toMatch(/over\./);
  });

  it('punctuates long structural-mapping table cells at the final slide boundary', () => {
    const blueprint = buildCourseBlueprint(KERNEL_COURSE, { enrichment: FULL_KERNEL_ENRICHMENT });
    blueprint.lessons[0].enrichment.structuralBridges = [
      {
        fromTerm: 'Earlier evidence model',
        toTerm: 'Evidence triangulation',
        archetypeName: 'Staged process',
        note: 'Both structures coordinate evidence across successive decisions.',
        mappingPairs: [
          {
            from: 'Each observation is checked before the next interpretation is accepted',
            to: 'Each source is compared with independent evidence before a claim is accepted',
          },
          {
            from: 'A later decision depends on the evidence consolidated in the stage before',
            to: 'A final claim depends on corroboration established in the comparison before',
          },
        ],
      },
    ];
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks'], {});
    const mapping = compiled.slideDecks.decks[0].slides.find(
      (slide) => slide.visual?.kind === 'structural mapping table',
    );
    const longCells = mapping.visual.rows.flat().filter((cell) => cell.length >= 60);

    expect(longCells.length).toBeGreaterThan(0);
    longCells.forEach((cell) => expect(cell).toMatch(/[.!?;:]$/));
  });
});

// Live crucible P1 (the last format point): the finalizer's lesson-title
// mention cap rewrote the focus INSIDE identity mentions — "Lesson 10: file
// input and output" became "Lesson 10: the lesson" and "Autograded quiz:
// file input and output criterion" became "Autograded quiz: the lesson
// criterion" (a generic placeholder in student-facing wording). Identity
// spans are masked before capping; plain prose mentions still compress.
describe('title-mention cap preserves identity spans (v0.15.187)', () => {
  it('never rewrites full lesson titles or registry titles, still caps prose', async () => {
    const { finalizeCompiledDeliverableLanguage } = await import('../src/lib/compiledLanguageFinalizer.js');
    const blueprint = {
      // The focus map keys by lesson POSITION — the fixture pads to ten so
      // lesson 10 sits at index 9 like a real blueprint.
      lessons: Array.from({ length: 10 }, (_, i) => ({
        lessonNumber: i + 1,
        title: i === 9 ? 'Lesson 10: file input and output' : `Lesson ${i + 1}: topic ${i + 1}`,
      })),
      assessmentRegistry: [
        { id: 'A10.1', title: 'Autograded quiz: file input and output', kind: 'graded-artifact', dueSession: 10 },
      ],
    };
    const data = {
      discussions: [
        {
          lessonNumber: 10,
          lessonTitle: 'Lesson 10: file input and output',
          context:
            'Reasonable positions differ. Lesson 10: file input and output turns that tension into a position students must defend.',
          evidenceRequirement:
            'Cite one source from Lesson 10: file input and output, then connect a specific Autograded quiz: file input and output criterion to the claim.',
          prompt:
            'Within file input and output, weigh direct writes against buffering. Consider file input and output tradeoffs. Then file input and output decisions again, and file input and output once more.',
        },
      ],
    };
    finalizeCompiledDeliverableLanguage('discussions', data, blueprint);
    const item = data.discussions[0];
    // Identity mentions stay verbatim — no placeholder corruption.
    expect(item.context).toContain('Lesson 10: file input and output turns that tension');
    expect(item.evidenceRequirement).toContain('Autograded quiz: file input and output criterion');
    expect(item.context + item.evidenceRequirement).not.toMatch(/Lesson 10: the lesson|the lesson criterion/);
    // The cap still works on plain prose mentions (budget 2, rest compressed).
    expect(item.prompt).not.toContain('Then file input and output decisions');
    expect(item.prompt).toContain('the lesson');
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

describe('kernel-authored discussion protocol (v0.15.187 dictionary retirement, slice 1)', () => {
  it('a complete authored course protocol beats the genre dictionary', () => {
    const enrichment = {
      source: 'metric-test',
      discussionProtocol: {
        format: 'Corroboration Panel',
        participationPattern:
          'claim posting, source-independence check, corroboration ruling, dissent registration, and revised verdict',
        artifactUse: 'Students inspect the paired sources behind each posted claim before ruling on corroboration.',
        reviewFocus: 'source independence, method difference, ruling justification, and dissent quality',
      },
    };
    const blueprint = buildCourseBlueprint(GENERIC_COURSE, { enrichment });
    const compiled = compileBlueprintDeliverables(blueprint, ['discussions'], {});
    const discussion = compiled.discussions.discussions[0];
    expect(discussion.discussionProtocol.format).toBe('Corroboration Panel');
    expect(discussion.discussionProtocol.participationPattern).toContain('source-independence check');
    expect(discussion.discussionProtocol.reviewFocus).toContain('method difference');
    // The audit gate's consistency contract still holds on the authored path.
    expect(discussion.format).toBe('Corroboration Panel');
    expect(discussion.sourceGrounding.discussionProtocol.format).toBe('Corroboration Panel');
    expect(discussion.guidelines).toContain(discussion.discussionProtocol.participationPattern);
  });

  it('incomplete authored protocols fall back to the dictionary', () => {
    const enrichment = {
      source: 'metric-test',
      discussionProtocol: { format: 'Half-Baked Panel' },
    };
    const blueprint = buildCourseBlueprint(GENERIC_COURSE, { enrichment });
    const compiled = compileBlueprintDeliverables(blueprint, ['discussions'], {});
    expect(compiled.discussions.discussions[0].discussionProtocol.format).not.toBe('Half-Baked Panel');
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
