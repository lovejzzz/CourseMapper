import { describe, expect, it } from 'vitest';
import {
  buildSlideContentFromKernel,
  ensureContrastiveExplanation,
  matchDistractorRationales,
  projectKernelToSurfaces,
} from '../kernelProjection.js';
import {
  assessProjectedKernelCoverage,
  buildLessonKernelPrompt,
  buildQuizItemPlan,
  lintEnrichedQuizItem,
  lintEnrichedSlideContent,
  normalizeAbsorbedCourseLevel,
  parseLessonKernelResponse,
  selectEnrichmentRecoveryChunk,
} from '../blueprintEnrichmentPass.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler.js';
import { auditSubstance } from '../contentQualityChecks.js';
import { isClaimEvidenceBoundaryShortAnswer } from '../quality/quizItemDepth.js';

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

const TERM_CORRECTIONS = [
  'Greenhouse gases warm the surface by absorbing outgoing infrared radiation, independently of ozone depletion.',
  'Albedo changes incoming sunlight reflection, whereas greenhouse gases alter outgoing radiation.',
  'Added CO2 changes the radiative energy balance rather than heating air through a chemical reaction.',
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

describe('ensureContrastiveExplanation', () => {
  it('preserves authored contrastive rationales byte for byte', () => {
    const item = { ...MC_ITEM, explanation: 'The key fits the evidence, while the other options do not.' };
    expect(ensureContrastiveExplanation(item)).toBe(item.explanation);
  });

  it('names the nearest authored distractor when the explanation is one-sided', () => {
    const explanation = ensureContrastiveExplanation(MC_ITEM);
    expect(explanation).toContain(MC_ITEM.explanation);
    expect(explanation).toMatch(/By contrast/);
    expect(MC_ITEM.options.slice(1).some((option) => explanation.includes(option))).toBe(true);
    expect(explanation).toContain('does not address the same evidence or decision criterion');
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

  // v0.15.187 live crucible P1 class: a period-stripped bullet ending on a
  // preposition/auxiliary ("…can be iterated over") reads as a TRUNCATED
  // line in the PPTX text audit. Such bullets keep sentence punctuation.
  it('keeps terminal punctuation on bullets that end with a dangling function word', () => {
    const kernel = {
      ...KERNEL,
      facts: [
        KERNEL.facts[0],
        'A string or list can be iterated over.',
        'Generators produce items one at a time in a loop.',
        ...KERNEL.facts.slice(3),
      ],
    };
    const slides = buildSlideContentFromKernel(kernel);
    const bullets = slides.flatMap((slide) => slide.bullets);
    const dangling = bullets.find((bullet) => bullet.includes('iterated over'));
    expect(dangling).toBe('A string or list can be iterated over.');
    // Bullets ending on content words stay period-free (bullet style).
    const content = bullets.find((bullet) => bullet.includes('one at a time in a loop'));
    expect(content).toBe('Generators produce items one at a time in a loop');
  });
});

describe('native kernel coverage contract', () => {
  it('distinguishes a present-but-partial payload from a complete lesson kernel', () => {
    const completeKernel = {
      ...KERNEL,
      discussionPrompt: {
        ...KERNEL.discussionPrompt,
        positions: [...KERNEL.discussionPrompt.positions, 'Sequence both investments against an explicit trigger.'],
      },
      assignmentCore: {
        ...KERNEL.assignmentCore,
        parameters: [...KERNEL.assignmentCore.parameters, 'submit one bounded recommendation'],
      },
      mc: [0, 1, 2, 3].map((index) => ({
        ...MC_ITEM,
        question: `${MC_ITEM.question} Case ${index + 1}?`,
      })),
    };
    const payload = projectKernelToSurfaces(completeKernel, { itemPlan: buildQuizItemPlan(6) });
    payload.studyGuide = {
      summary: 'Compare the local temperature record with the emissions evidence before making a bounded claim.',
      reviewStrategy: 'Rehearse the greenhouse mechanism and the alternative land-use explanation.',
    };
    expect(assessProjectedKernelCoverage(payload, { requiredMcCount: 4 })).toMatchObject({
      complete: true,
      usable: true,
      issues: [],
      usabilityIssues: [],
      mcCount: 4,
      keyTermCount: 3,
    });

    const richButUnsaturated = {
      ...payload,
      quizItems: payload.quizItems.slice(0, 2),
      keyTerms: payload.keyTerms.slice(0, 1),
      slideContent: payload.slideContent.slice(0, 1),
    };
    expect(assessProjectedKernelCoverage(richButUnsaturated, { requiredMcCount: 4 })).toMatchObject({
      complete: false,
      usable: true,
      factCount: 7,
      quizItemCount: 2,
      keyTermCount: 1,
      slideCount: 1,
      usabilityIssues: [],
    });

    const partial = {
      ...payload,
      quizItems: payload.quizItems.filter((item) => item.type !== 'multiple_choice').concat(payload.quizItems[0]),
      keyTerms: payload.keyTerms.slice(0, 1),
      studyGuide: {},
    };
    const result = assessProjectedKernelCoverage(partial, { requiredMcCount: 4 });
    expect(result.complete).toBe(false);
    expect(result.usable).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining(['mc-coverage:1/4', 'key-term-coverage:1/3', 'study-guide-coverage']),
    );
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
    expect(shortAnswer.question).not.toContain('Greenhouse effect');
    expect(shortAnswer.question).toMatch(/(?:identify|select|choose|name).{0,80}(?:concept|method)/i);
    expect(shortAnswer.question).toMatch(/(?:limitation|boundary|next piece of evidence|additional evidence)/i);
    expect(shortAnswer.answer.length).toBeGreaterThanOrEqual(30);
    expect(shortAnswer.answer).toContain('Greenhouse effect');
    expect(shortAnswer.answer).toMatch(
      /(?:not a broader|cannot establish|do not prove|needs another source|case-specific|remaining limitation)/i,
    );
    expect(shortAnswer.scoringGuidance).toContain('Mauna Loa');

    const essay = byIndex[5];
    expect(essay.type).toBe('essay');
    expect(essay.question).toContain('emissions cuts or adaptation');
    expect(essay.question).not.toContain('dataset..');
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
    expect(allText).not.toMatch(/source grounding/i);
  });

  it('grounds the short-answer frame in the term example when the scenario is missing', () => {
    // Genome-linked lessons arrive without a course-layer scenario; the item
    // must still carry real subject matter instead of falling back to the
    // subject-free template frame.
    const payload = projectKernelToSurfaces({ ...KERNEL, scenario: null, discussionPrompt: null }, { itemPlan });
    const shortAnswer = payload.quizItems.find((item) => item.type === 'short_answer');
    expect(shortAnswer).toBeTruthy();
    expect(shortAnswer.question).toMatch(/CO2 and methane absorb infrared radiation/);
    expect(shortAnswer.question).not.toContain('Greenhouse effect');
    expect(shortAnswer.question).toContain('Identify the most relevant course concept or method');
    expect(shortAnswer.answer).toMatch(/greenhouse effect/i);
    // No term carries a correction, so the misconception-tension essay
    // fallback has nothing gradeable and the essay frame is omitted.
    expect(payload.quizItems.map((item) => item.type)).not.toContain('essay');
  });

  it('keys the short answer to the term best supported by the scenario instead of the first term', () => {
    const payload = projectKernelToSurfaces(
      {
        ...KERNEL,
        keyTerms: [
          {
            term: 'Card Sorting',
            definition: 'A method where participants organize cards into groups that make sense to them.',
            example: 'Participants group product cards into candidate categories.',
          },
          {
            term: 'Navigation Structure',
            definition: 'The hierarchy of links that lets users move through a website or application.',
            example: 'A flat menu and a multi-level menu provide different navigation structures.',
          },
        ],
        scenario: {
          setup:
            'A startup must decide between a flat navigation menu and a multi-level hierarchy. The team compares user-flow data with two navigation mockups.',
          materials: 'user-flow analytics and the two prototype navigation mockups.',
        },
        facts: ['Navigation hierarchy changes how users move between product categories.', ...KERNEL.facts],
      },
      { itemPlan },
    );
    const shortAnswer = payload.quizItems.find((item) => item.type === 'short_answer');
    expect(shortAnswer.answer).toContain('Navigation Structure');
    expect(shortAnswer.answer).not.toContain('Card Sorting is the most relevant');
    expect(shortAnswer.scoringGuidance).not.toContain('mockups..');
  });

  it('builds a misconception-tension essay when the discussion prompt is missing but a correction exists', () => {
    const correctedTerms = [
      {
        ...TERMS[0],
        correction:
          'The greenhouse effect is driven by radiatively active gases absorbing longwave radiation, not by the ozone hole.',
      },
      ...TERMS.slice(1),
    ];
    const payload = projectKernelToSurfaces(
      { ...KERNEL, keyTerms: correctedTerms, scenario: null, discussionPrompt: null },
      { itemPlan },
    );
    const essay = payload.quizItems.find((item) => item.type === 'essay');
    expect(essay).toBeTruthy();
    expect(essay.question).toMatch(/common claim about Greenhouse effect/i);
    expect(essay.question).toMatch(/ozone layer hole/);
    expect(essay.answer).toMatch(/radiatively active gases/i);
  });

  it('omits short-answer and essay frames when the kernel has no terms at all', () => {
    const payload = projectKernelToSurfaces(
      { ...KERNEL, keyTerms: [], scenario: null, discussionPrompt: null },
      { itemPlan },
    );
    const types = payload.quizItems.map((item) => item.type);
    expect(types).not.toContain('short_answer');
    expect(types).not.toContain('essay');
  });

  it('derives a grounded scenario when the authored scenario is missing', () => {
    const fallbackKernel = {
      ...KERNEL,
      scenario: null,
      keyTerms: KERNEL.keyTerms.map((term, index) => ({
        ...term,
        correction:
          index === 0
            ? 'Greenhouse warming comes from absorption and re-emission of outgoing longwave radiation.'
            : `The accurate correction for ${term.term} distinguishes the mechanism from the misconception.`,
      })),
    };
    const payload = projectKernelToSurfaces(fallbackKernel, { itemPlan });
    expect(payload.kernel.scenario.source).toBe('derived-kernel-fallback');
    expect(payload.kernel.scenario.setup).toContain(fallbackKernel.keyTerms[0].example);
    expect(payload.kernel.scenario.setup).toContain(fallbackKernel.keyTerms[0].misconception);
    expect(payload.quizItems.find((item) => item.type === 'short_answer')?.question).toContain(
      fallbackKernel.keyTerms[0].example,
    );
  });
});

describe('kernel parse → project → compile (end to end)', () => {
  const shortKeyResponse = JSON.stringify({
    lessons: [
      {
        lessonId: 'lesson-1',
        facts: KERNEL.facts,
        keyTerms: TERMS.map((term, index) => ({
          tr: term.term,
          df: term.definition,
          eg: term.example,
          mi: term.misconception,
          cx: TERM_CORRECTIONS[index],
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
    expect(prompt.systemPrompt).toContain('exactly three defensible positions');
    expect(prompt.systemPrompt).toContain('exactly four distinct parameters');
    // v0.15.186 static-prefix discipline: the courseLevel schema lives in the
    // USER prompt so every chunk shares a byte-identical system prompt (the
    // provider prompt-cache prefix). Chunk-varying content never enters the
    // system prompt.
    expect(prompt.systemPrompt).not.toContain('courseLevel');
    expect(prompt.userPrompt).toContain('courseLevel');
    const chunk2Prompt = buildLessonKernelPrompt(COURSE_MAP, [0], { includeCourseLevel: false });
    expect(chunk2Prompt.systemPrompt).toBe(prompt.systemPrompt);
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

  it('rejects an explanation-key conflict when only lexical overlap supports moving the key', () => {
    const prompt = buildLessonKernelPrompt(COURSE_MAP, [0]);
    const response = JSON.parse(shortKeyResponse);
    response.lessons[0].mc = [
      {
        q: 'During card sorting, 70% placed Winter Jackets under Clothing while 30% chose Outdoor Gear. Which next step best supports user-centered design?',
        op: [
          'Conduct a second card sorting session with a larger sample.',
          'Add a new top-level Outdoor Gear category to the sitemap.',
          'Merge Clothing and Outdoor Gear into a single category.',
          'Remove Winter Jackets from the product catalog.',
        ],
        ai: 0,
        ex: 'Adding a new top-level Outdoor Gear category addresses the split grouping, while a second session merely confirms the same split.',
      },
    ];

    const parsed = parseLessonKernelResponse(JSON.stringify(response), { prompt });
    expect(parsed.lessons['lesson-1'].quizItems).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ question: response.lessons[0].mc[0].q })]),
    );
    expect(parsed.repairs).toEqual([]);
    expect(parsed.issues).toContainEqual(
      expect.objectContaining({
        lessonId: 'lesson-1',
        surface: 'mc',
        problems: expect.arrayContaining(['explanation-key-conflict']),
      }),
    );
  });

  it('lets exact kernel fact citations repair a key before canonical projection', () => {
    const prompt = buildLessonKernelPrompt(COURSE_MAP, [0]);
    const response = JSON.parse(shortKeyResponse);
    response.lessons[0].facts = [
      'Relative dating orders events while absolute dating assigns numerical ages.',
      'Absolute numerical dating assigns specific ages in years to mineral grains within a rock.',
      'Superposition orders undisturbed layers from oldest to youngest.',
    ];
    response.lessons[0].mc = [
      {
        q: 'What does absolute dating provide regarding mineral grains in a rock?',
        op: [
          'A numerical age in years',
          'A relative order of events',
          "The span of Earth's history",
          'The sequence of deposition',
        ],
        ai: 1,
        fi: [1],
        ex: 'The correct choice gives a relative ordering for the sampled mineral grains.',
      },
    ];

    const parsed = parseLessonKernelResponse(JSON.stringify(response), { prompt });
    expect(parsed.lessons['lesson-1'].quizItems[0].answerIndex).toBe(0);
    expect(parsed.repairs).toEqual([
      expect.objectContaining({
        pass: 'sourceAnswerAlignment',
        preferenceEvidence: expect.objectContaining({ supportedIndex: 0 }),
      }),
    ]);
  });

  it('never shifts a cited fact index after an earlier fact fails admission', () => {
    const prompt = buildLessonKernelPrompt(COURSE_MAP, [0]);
    const response = JSON.parse(shortKeyResponse);
    response.lessons[0].facts = [
      'too short',
      'Absolute numerical dating assigns specific ages in years to mineral grains within a rock.',
      'Relative dating orders events from older to younger without assigning a numerical age.',
    ];
    response.lessons[0].mc = [
      {
        q: 'What does absolute dating provide regarding mineral grains in a rock?',
        op: [
          'A numerical age in years',
          'A relative order of events',
          "The span of Earth's history",
          'The sequence of deposition',
        ],
        ai: 1,
        fi: [1],
        ex: 'The correct choice gives a relative ordering for the sampled mineral grains.',
      },
    ];

    const parsed = parseLessonKernelResponse(JSON.stringify(response), { prompt });
    expect(parsed.lessons['lesson-1'].quizItems[0].answerIndex).toBe(0);
    expect(parsed.repairs[0]).toMatchObject({ pass: 'sourceAnswerAlignment' });

    response.lessons[0].mc[0].fi = [0];
    const invalidCitation = parseLessonKernelResponse(JSON.stringify(response), { prompt });
    expect(invalidCitation.lessons['lesson-1'].quizItems).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ question: response.lessons[0].mc[0].q })]),
    );
    expect(invalidCitation.issues).toContainEqual(
      expect.objectContaining({ surface: 'mc', problems: expect.arrayContaining(['source-fact-index']) }),
    );
  });

  it('keeps every deterministic short-answer variant explicit about concept, evidence, and boundary', () => {
    const itemPlan = buildQuizItemPlan(6);
    for (let index = 0; index < 80; index += 1) {
      const variedKernel = {
        ...KERNEL,
        scenario: { ...KERNEL.scenario, setup: `${KERNEL.scenario.setup} Case variation ${index}.` },
      };
      const shortAnswer = projectKernelToSurfaces(variedKernel, { itemPlan }).quizItems.find(
        (item) => item.type === 'short_answer',
      );
      expect(isClaimEvidenceBoundaryShortAnswer(shortAnswer.question)).toBe(true);
    }
  });

  it('makes recovery prompts cache-distinct and rotates across missing lessons', () => {
    const recoveryOne = buildLessonKernelPrompt(COURSE_MAP, [0], { recoveryAttempt: 1 });
    const recoveryTwo = buildLessonKernelPrompt(COURSE_MAP, [0], { recoveryAttempt: 2 });
    expect(recoveryOne.systemPrompt).toBe(recoveryTwo.systemPrompt);
    expect(recoveryOne.userPrompt).toContain('Recovery attempt 1');
    expect(recoveryTwo.userPrompt).toContain('Recovery attempt 2');
    expect(recoveryOne.userPrompt).not.toBe(recoveryTwo.userPrompt);
    expect(selectEnrichmentRecoveryChunk([8, 10], [], 1)).toEqual([8]);
    expect(selectEnrichmentRecoveryChunk([8, 10], [8], 1)).toEqual([10]);
    expect(selectEnrichmentRecoveryChunk([8], [8], 1)).toEqual([8]);
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

  it('drops a key-term misconception that affirmatively restates one of the same kernel facts', () => {
    const prompt = buildLessonKernelPrompt(COURSE_MAP, [0]);
    const response = JSON.parse(shortKeyResponse);
    response.lessons[0].keyTerms[0].mi =
      'Believing atmospheric CO2 has risen from 280 ppm before industrialization to over 420 ppm today.';

    const parsed = parseLessonKernelResponse(JSON.stringify(response), { prompt });
    expect(parsed.lessons['lesson-1']).toBeTruthy();
    expect(parsed.issues).toContainEqual(
      expect.objectContaining({
        lessonId: 'lesson-1',
        surface: 'keyTerms',
        index: 0,
        problems: expect.arrayContaining(['misconception-repeats-known-fact']),
      }),
    );
    expect(parsed.lessons['lesson-1'].keyTerms).toHaveLength(2);
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
