import { describe, expect, it } from 'vitest';
import {
  buildSlideContentFromKernel,
  matchDistractorRationales,
  projectKernelToSurfaces,
} from '../kernelProjection.js';
import {
  buildLessonKernelPrompt,
  buildQuizItemPlan,
  lintEnrichedQuizItem,
  lintEnrichedSlideContent,
  normalizeAbsorbedCourseLevel,
  parseLessonKernelResponse,
} from '../blueprintEnrichmentPass.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler.js';
import { auditSubstance } from '../contentQualityChecks.js';

const COURSE_MAP = {
  courseName: 'Climate Justice and Community Resilience',
  semester: 'Fall 2026',
  lessons: [
    {
      title: 'Lesson 1: Climate Science Foundations and the Justice Lens',
      sections: [
        {
          topicSection: '1.1: Climate System Basics',
          learningObjectives:
            'Explain key climate science concepts, including greenhouse effects and emissions pathways.\nAnalyze how historical conditions influence unequal climate impacts.',
          learningGoals: 'Ground justice analysis in climate science.',
          weeklyAssessments: 'Climate concepts check and data response.',
          asyncActivities: 'Read the climate primer.',
          syncActivities: 'Data interpretation workshop.',
          technologyNeeded: 'LMS.',
          supportingResources: 'Course climate science primer; IPCC summary materials (open access).',
          evaluateDesign: 'Aligned.',
        },
      ],
    },
  ],
};

const TERMS = [
  {
    term: 'Greenhouse effect',
    definition:
      'The warming that results when atmospheric gases absorb outgoing longwave radiation and re-emit part of it back toward the surface.',
    example: 'CO2 and methane absorb infrared radiation that would otherwise escape to space.',
    misconception: 'Students often believe the greenhouse effect is caused by the ozone layer hole.',
  },
  {
    term: 'Albedo',
    definition: 'The fraction of incoming sunlight a surface reflects back to space rather than absorbing.',
    example: 'Fresh snow reflects most incoming sunlight while dark ocean water absorbs it.',
    misconception: 'Students confuse albedo-driven reflection of incoming sunlight with greenhouse trapping.',
  },
  {
    term: 'Radiative forcing',
    definition: 'The change in the energy balance of the climate system caused by a factor such as added CO2.',
    example: 'Doubling CO2 adds roughly 3.7 watts per square meter of forcing.',
    misconception: 'Many assume CO2 produces direct heating of air through chemical reactions instead of radiation.',
  },
];

const MC_ITEM = {
  question: 'Which process explains why increasing atmospheric CO2 raises global mean surface temperature?',
  options: [
    'Absorption and re-emission of outgoing longwave radiation by greenhouse gases',
    'Increased reflection of incoming sunlight by a thicker atmosphere',
    'Direct heating of the air by CO2 chemical reactions',
    'Reduction of the ozone layer allowing more ultraviolet light through',
  ],
  answerIndex: 0,
  explanation: 'Greenhouse gases absorb outgoing longwave radiation and re-emit part of it back toward the surface.',
};

const KERNEL = {
  facts: [
    'CO2 absorbs outgoing longwave radiation and re-emits part of it toward the surface',
    'Atmospheric CO2 has risen from 280 ppm before industrialization to over 420 ppm today',
    'The greenhouse effect keeps Earth roughly 33C warmer than an airless baseline would be',
    'Ocean heat uptake delays surface warming for decades after emissions occur',
    'Attribution studies compare observed warming against natural-forcing-only model runs',
    'Low-income neighborhoods often face higher heat exposure from sparse tree cover',
    'Urban heat islands amplify local warming independently of the global greenhouse signal',
  ],
  keyTerms: TERMS,
  scenario: {
    setup:
      'A city council reviews thirty years of local temperature records alongside the Mauna Loa CO2 series. Staff ask whether the local warming trend reflects the global signal or local land-use change.',
    materials: 'the Mauna Loa CO2 record and the city temperature dataset',
  },
  discussionPrompt: {
    prompt: 'Should fast-growing cities prioritize emissions cuts or adaptation spending first?',
    tension: 'Mitigation benefits are global and delayed; adaptation benefits are local and immediate.',
    positions: ['Mitigation first: avoided warming compounds.', 'Adaptation first: protects current residents now.'],
  },
  assignmentCore: {
    taskDescription:
      'Analyze the heat-exposure dataset for two neighborhoods in the course case city and recommend one resilience investment, justified with the temperature and demographic evidence provided.',
    parameters: ['600-800 words', 'use the course heat-exposure dataset only', 'one figure required'],
  },
  mc: [MC_ITEM],
};

describe('matchDistractorRationales', () => {
  it('matches every wrong option to a term misconception by content overlap', () => {
    const rationales = matchDistractorRationales(MC_ITEM, TERMS);
    expect(rationales).toHaveLength(3);
    expect(rationales[0]).toContain('reflection of incoming sunlight');
    expect(rationales[1]).toContain('chemical reactions');
    expect(rationales[2]).toContain('ozone');
  });

  it('returns no rationales rather than a misaligned partial set', () => {
    const sparseTerms = [TERMS[0]];
    expect(matchDistractorRationales(MC_ITEM, sparseTerms)).toEqual([]);
    expect(matchDistractorRationales(MC_ITEM, [])).toEqual([]);
  });
});

describe('buildSlideContentFromKernel', () => {
  it('builds up to three assertion-evidence slides that pass the surface lint', () => {
    const slides = buildSlideContentFromKernel(KERNEL);
    expect(slides).toHaveLength(3);
    for (const slide of slides) {
      expect(lintEnrichedSlideContent(slide)).toEqual([]);
    }
    expect(slides[0].title).toContain('longwave radiation');
    expect(slides[0].notes).toContain('longwave radiation');
    // The misconception slide reuses the term atoms — knowledge bought once.
    expect(slides[2].notes).toContain('Common misunderstanding');
  });

  it('builds fewer slides when facts are scarce instead of padding', () => {
    const slides = buildSlideContentFromKernel({ ...KERNEL, facts: KERNEL.facts.slice(0, 3) });
    expect(slides.length).toBeLessThanOrEqual(2);
  });
});

describe('projectKernelToSurfaces', () => {
  const itemPlan = buildQuizItemPlan(6);

  it('places MC at plan slots and compiles short-answer/essay frames around model substance', () => {
    const payload = projectKernelToSurfaces(KERNEL, { itemPlan });
    const byIndex = Object.fromEntries(payload.quizItems.map((item) => [item.index, item]));

    expect(byIndex[0].type).toBe('multiple_choice');
    expect(byIndex[0].distractorRationales).toHaveLength(3);

    const shortAnswer = byIndex[3];
    expect(shortAnswer.type).toBe('short_answer');
    expect(shortAnswer.question).toContain('city council');
    expect(shortAnswer.question).toContain('Greenhouse effect');
    expect(shortAnswer.answer.length).toBeGreaterThanOrEqual(30);
    expect(shortAnswer.scoringGuidance).toContain('Mauna Loa');

    const essay = byIndex[5];
    expect(essay.type).toBe('essay');
    expect(essay.question).toContain('emissions cuts or adaptation');
    expect(essay.scoringGuidance).toMatch(/opposing view|alternative|counterclaim/i);
    expect(essay.scoringGuidance).not.toContain('state a clear position, engage at least one opposing view');
    expect(shortAnswer.scoringGuidance).not.toContain('partial credit for correct concepts supported by thin evidence');

    // Projected items satisfy the same lint as direct model items.
    for (const item of payload.quizItems) {
      expect(lintEnrichedQuizItem(item, { groundingText: 'Mauna Loa city council dataset' })).toEqual([]);
    }
    expect(payload.keyTerms).toHaveLength(3);
    expect(payload.kernel.facts).toHaveLength(7);
  });

  it('varies essay counterpoint scaffolds across lesson-specific kernels', () => {
    const answerSet = new Set();
    const oldScaffold = 'A strong answer also engages the opposing view';
    const oldScaffoldHits = [];

    for (const [index, positions] of [
      [
        'adaptation',
        ['Mitigation first: avoided warming compounds.', 'Adaptation first: protects current residents now.'],
      ],
      [
        'trees',
        [
          'Tree canopy should be prioritized because heat exposure is local.',
          'Cooling centers should come first because they can open immediately.',
        ],
      ],
      [
        'transit',
        [
          'Transit resilience should lead because access shapes evacuation.',
          'Home retrofits should lead because risk is experienced indoors.',
        ],
      ],
      [
        'data',
        [
          'Use the long-term dataset first because trend evidence is inspectable.',
          'Use resident interviews first because lived experience reveals gaps.',
        ],
      ],
    ].entries()) {
      const payload = projectKernelToSurfaces(
        {
          ...KERNEL,
          discussionPrompt: {
            ...KERNEL.discussionPrompt,
            prompt: `${KERNEL.discussionPrompt.prompt} Case ${index + 1}?`,
            positions,
          },
        },
        { itemPlan },
      );
      const essay = payload.quizItems.find((item) => item.type === 'essay');
      expect(essay?.answer.toLowerCase()).toContain('opposing view');
      if (essay?.answer.includes(oldScaffold)) oldScaffoldHits.push(essay.answer);
      answerSet.add(
        essay?.answer.match(
          /(?:A well-supported answer|The opposing view|A complete response|The answer should|A strong response)[^.]+/,
        )?.[0] || '',
      );
    }

    expect(answerSet.size).toBeGreaterThan(1);
    expect(oldScaffoldHits).toEqual([]);
  });

  it('varies short-answer and essay quiz scaffolds across lesson-specific kernels', () => {
    const shortQuestionTails = new Set();
    const shortScoring = new Set();
    const essayScoring = new Set();
    const combined = [];

    for (let index = 0; index < 12; index += 1) {
      const payload = projectKernelToSurfaces(
        {
          ...KERNEL,
          scenario: {
            ...KERNEL.scenario,
            setup: `${KERNEL.scenario.setup} Lesson-specific evidence packet ${index + 1}.`,
            materials: `${KERNEL.scenario.materials} packet ${index + 1}`,
          },
          discussionPrompt: {
            ...KERNEL.discussionPrompt,
            prompt: `${KERNEL.discussionPrompt.prompt} Studio case ${index + 1}?`,
          },
        },
        { itemPlan },
      );
      const shortAnswer = payload.quizItems.find((item) => item.type === 'short_answer');
      const essay = payload.quizItems.find((item) => item.type === 'essay');
      shortQuestionTails.add(shortAnswer?.question.replace(/^.*?Using|^.*?Use|^.*?Apply|^.*?Connect/s, '').trim());
      shortScoring.add(shortAnswer?.scoringGuidance || '');
      essayScoring.add(essay?.scoringGuidance || '');
      combined.push(shortAnswer?.question, shortAnswer?.scoringGuidance, shortAnswer?.answer, essay?.scoringGuidance);
    }

    const allText = combined.join('\n');
    expect(shortQuestionTails.size).toBeGreaterThan(3);
    expect(shortScoring.size).toBeGreaterThan(3);
    expect(essayScoring.size).toBeGreaterThan(3);
    expect(allText).not.toMatch(/analyze what this evidence shows and justify your conclusion/i);
    expect(allText).not.toMatch(/concept recall without evidence stays below/i);
    expect(allText).not.toMatch(/use the assigned evidence rather than general opinion/i);
    expect(allText).not.toMatch(/answer keeps the claim honest by naming a plausible limit/i);
  });

  it('omits short-answer and essay frames when their kernel atoms are missing', () => {
    const payload = projectKernelToSurfaces({ ...KERNEL, scenario: null, discussionPrompt: null }, { itemPlan });
    const types = payload.quizItems.map((item) => item.type);
    expect(types).not.toContain('short_answer');
    expect(types).not.toContain('essay');
  });
});

describe('kernel parse → project → compile (end to end)', () => {
  const shortKeyResponse = JSON.stringify({
    lessons: [
      {
        lessonId: 'lesson-1',
        facts: KERNEL.facts,
        keyTerms: TERMS.map((term) => ({
          tr: term.term,
          df: term.definition,
          eg: term.example,
          mi: term.misconception,
        })),
        scenario: { su: KERNEL.scenario.setup, ma: KERNEL.scenario.materials },
        discussionPrompt: {
          pr: KERNEL.discussionPrompt.prompt,
          tn: KERNEL.discussionPrompt.tension,
          po: KERNEL.discussionPrompt.positions,
        },
        assignmentCore: { td: KERNEL.assignmentCore.taskDescription, pa: KERNEL.assignmentCore.parameters },
        mc: [{ q: MC_ITEM.question, op: MC_ITEM.options, ai: MC_ITEM.answerIndex, ex: MC_ITEM.explanation }],
      },
    ],
    courseLevel: {
      signatureTerms: ['greenhouse effect', 'albedo', 'radiative forcing', 'climate justice'],
      lens: { domain: 'climate justice', evidenceNoun: 'temperature records' },
      styleNotes: ['Name the dataset in every analysis prompt.'],
    },
  });

  it('parses the kernel, validates atoms, and projects the full surface payload', () => {
    const prompt = buildLessonKernelPrompt(COURSE_MAP, [0], { includeCourseLevel: true });
    expect(prompt.systemPrompt).toContain('Return JSON matching this shape');
    expect(prompt.systemPrompt).toContain('courseLevel');
    // Static prefix discipline: the user prompt carries only course + lessons.
    expect(prompt.userPrompt).not.toContain('Return JSON matching this shape');

    const parsed = parseLessonKernelResponse(shortKeyResponse, { prompt });
    expect(parsed).toBeTruthy();
    const payload = parsed.lessons['lesson-1'];
    expect(payload.quizItems.length).toBeGreaterThanOrEqual(3);
    expect(payload.slideContent.length).toBeGreaterThanOrEqual(2);
    expect(payload.discussionPrompt.positions).toHaveLength(2);
    expect(payload.assignmentCore.parameters).toHaveLength(3);

    const courseLevel = normalizeAbsorbedCourseLevel(parsed.courseLevel, prompt.lessons);
    expect(courseLevel.signatureTerms).toContain('greenhouse effect');
    expect(courseLevel.quality.source).toBe('kernel-chunk-1');
  });

  it('drops invalid kernel atoms individually and keeps the lesson', () => {
    const prompt = buildLessonKernelPrompt(COURSE_MAP, [0]);
    const withBadAtoms = JSON.parse(shortKeyResponse);
    withBadAtoms.lessons[0].facts = ['too short', ...KERNEL.facts];
    withBadAtoms.lessons[0].mc.push({ q: 'short?', op: ['a'], ai: 0 });
    const parsed = parseLessonKernelResponse(JSON.stringify(withBadAtoms), { prompt });
    expect(parsed.lessons['lesson-1']).toBeTruthy();
    expect(parsed.issues.some((issue) => issue.surface === 'facts')).toBe(true);
    expect(parsed.issues.some((issue) => issue.surface === 'mc')).toBe(true);
  });

  it('compiled deliverables consume the projected payload exactly like the v0.9.1 contract', () => {
    const prompt = buildLessonKernelPrompt(COURSE_MAP, [0]);
    const parsed = parseLessonKernelResponse(shortKeyResponse, { prompt });
    const enrichment = { source: 'kernel-test', lessonContent: parsed.lessons };
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(COURSE_MAP, { enrichment })));
    const compiled = compileBlueprintDeliverables(
      blueprint,
      ['quizBank', 'studyGuides', 'slideDecks', 'discussions', 'assignments'],
      {},
    );

    const firstQuestion = compiled.quizBank.quizzes[0].questions[0];
    expect(firstQuestion.enrichmentSource).toBe('lesson-content-enrichment');
    expect(firstQuestion.question).toContain('atmospheric CO2');
    expect(['A', 'B', 'C', 'D']).toContain(firstQuestion.answer);

    const guide = compiled.studyGuides.studyGuides[0];
    expect(guide.keyTerms[0].term).toBe('Greenhouse effect');
    expect(guide.commonMisconceptions[0].misconception).toContain('ozone');

    const slides = compiled.slideDecks.decks[0].slides;
    expect(slides.some((slide) => slide.enrichmentSource)).toBe(true);

    const discussion = compiled.discussions.discussions[0];
    expect(discussion.prompt).toContain('emissions cuts or adaptation');

    const brief = compiled.assignments.assignments[0];
    expect(brief.overview).toContain('heat-exposure dataset');

    const quizAudit = auditSubstance('quizBank', compiled.quizBank);
    const baseline = auditSubstance(
      'quizBank',
      compileBlueprintDeliverables(JSON.parse(JSON.stringify(buildCourseBlueprint(COURSE_MAP, {}))), ['quizBank'], {})
        .quizBank,
    );
    expect(quizAudit.metaShare).toBeLessThan(baseline.metaShare);
  });
});
