import { describe, expect, it } from 'vitest';

import {
  buildBlueprintEnrichmentPrompt,
  chooseBlueprintEnrichmentPath,
  evaluateBlueprintEnrichmentQuality,
  lintEnrichedKeyTerm,
  normalizeBlueprintEnrichmentResponse,
  parseBlueprintEnrichmentResponse,
} from '../blueprintEnrichmentPass';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler';

const courseMap = {
  courseName: 'Applied Social Research Methods',
  semester: 'Fall 2026',
  learningOutcomes: 'Formulate empirical research questions and evaluate evidence quality.',
  lessons: [
    {
      title: 'Lesson 1: Asking Researchable Questions',
      sections: [
        {
          topicSection: 'Research questions, variables, population, feasibility',
          learningObjectives: 'Formulate a focused empirical research question.',
          weeklyAssessments: 'Question-quality memo with revised questions and rationale.',
          syncActivities: 'Question clinic with peer critique.',
          supportingResources: 'Question formulation checklist; empirical article examples',
        },
      ],
    },
    {
      title: 'Lesson 2: Sampling and Recruitment',
      sections: [
        {
          topicSection: 'Sampling frames, recruitment, consent',
          learningObjectives: 'Evaluate fit between a question, population, and sampling strategy.',
          weeklyAssessments: 'Sampling critique diagnosing bias risks.',
          syncActivities: 'Sampling case analysis lab.',
          supportingResources: 'Sampling decision tree; recruitment examples',
        },
      ],
    },
    {
      title: 'Lesson 3: Measurement Validity',
      sections: [
        {
          topicSection: 'Operational definitions, indicators, reliability, validity threats',
          learningObjectives: 'Assess whether a measure fits the concept and research question.',
          weeklyAssessments: 'Measurement validity memo comparing two possible indicators.',
          syncActivities: 'Indicator critique workshop using survey and interview examples.',
          supportingResources: 'Measurement validity checklist; operationalization examples',
        },
      ],
    },
  ],
};

describe('blueprint enrichment pass', () => {
  it('builds a compact prompt from course-map facts only', () => {
    const prompt = buildBlueprintEnrichmentPrompt(courseMap, { maxLessons: 1 });

    expect(prompt.systemPrompt).toContain('Return only compact valid JSON');
    expect(prompt.userPrompt).toContain('Applied Social Research Methods');
    expect(prompt.userPrompt).toContain('Asking Researchable Questions');
    expect(prompt.userPrompt).toContain('Include exactly one lessonPhrases entry for every lesson id');
    expect(prompt.userPrompt).toContain('Include all five teachingMoves keys');
    expect(prompt.userPrompt).not.toContain('Sampling and Recruitment');
    expect(prompt.approxInputTokens).toBeLessThan(900);
  });

  it('chooses adaptive enrichment only when source signal, model access, and call budget are present', () => {
    const selected = chooseBlueprintEnrichmentPath(courseMap, {
      mode: 'adaptive',
      compiledFeatureIds: ['syllabus', 'lessonPlans', 'slideDecks', 'quizBank'],
      modelAvailable: true,
      remainingProviderCalls: 2,
    });
    const noModel = chooseBlueprintEnrichmentPath(courseMap, {
      mode: 'adaptive',
      compiledFeatureIds: ['syllabus', 'lessonPlans', 'slideDecks', 'quizBank'],
      modelAvailable: false,
      remainingProviderCalls: 2,
    });
    const capped = chooseBlueprintEnrichmentPath(courseMap, {
      mode: 'adaptive',
      compiledFeatureIds: ['syllabus', 'lessonPlans', 'slideDecks', 'quizBank'],
      modelAvailable: true,
      remainingProviderCalls: 0,
    });

    expect(selected).toMatchObject({
      mode: 'enriched',
      shouldRunEnrichment: true,
      reason: expect.stringContaining('adaptive enrichment'),
      details: {
        compiledFeatureCount: 4,
        lessonCount: 3,
      },
    });
    expect(noModel).toMatchObject({
      mode: 'deterministic',
      shouldRunEnrichment: false,
      reason: 'no enrichment-capable model is connected',
    });
    expect(capped).toMatchObject({
      mode: 'deterministic',
      shouldRunEnrichment: false,
      reason: 'provider call cap leaves no room for enrichment',
    });
  });

  it('keeps adaptive enrichment deterministic for sparse course maps but honors explicit requests', () => {
    const sparseMap = {
      courseName: 'Sparse Seminar',
      lessons: [{ title: 'Lesson 1', sections: [{ topicSection: 'Intro' }] }],
    };
    const adaptive = chooseBlueprintEnrichmentPath(sparseMap, {
      mode: 'adaptive',
      compiledFeatureIds: ['syllabus', 'lessonPlans', 'slideDecks', 'quizBank'],
      modelAvailable: true,
      remainingProviderCalls: 2,
    });
    const required = chooseBlueprintEnrichmentPath(sparseMap, {
      mode: true,
      compiledFeatureIds: ['syllabus', 'lessonPlans'],
      modelAvailable: true,
      remainingProviderCalls: 1,
    });

    expect(adaptive).toMatchObject({
      mode: 'deterministic',
      reason: 'too few lessons to justify one enrichment call',
    });
    expect(required).toMatchObject({
      mode: 'enriched',
      shouldRunEnrichment: true,
      reason: 'blueprint enrichment explicitly requested',
    });
  });

  it('normalizes model JSON into compiler enrichment', () => {
    const payload = buildBlueprintEnrichmentPrompt(courseMap).payload;
    const enrichment = parseBlueprintEnrichmentResponse(
      `
      \`\`\`json
      {
        "signatureTerms": ["empirical question", "sampling frame", "empirical question"],
        "lens": {
          "domain": "applied social research",
          "evidenceNoun": "empirical evidence",
          "decisionNoun": "method decision",
          "learnerRole": "student researcher",
          "exampleNoun": "study-design scenario"
        },
        "lessonPhrases": {
          "lesson-1": {
            "context": "research questions and feasibility",
            "evidenceMove": "use empirical evidence to test feasibility",
            "decisionMove": "choose a defensible method decision"
          },
          "lesson-2": {
            "context": "sampling frame and recruitment consent",
            "evidenceMove": "compare sampling frame evidence for bias",
            "decisionMove": "choose a defensible recruitment strategy"
          },
          "lesson-3": {
            "context": "measurement validity and indicators",
            "evidenceMove": "inspect validity evidence for indicators",
            "decisionMove": "choose a defensible measurement decision"
          }
        },
        "teachingMoves": {
          "openingMove": "Open with a researchable-question clinic using empirical article examples.",
          "practiceMove": "Have student researchers compare sampling frame evidence before choosing recruitment options.",
          "feedbackMove": "Give feedback on measurement validity evidence and one revision to the method decision.",
          "assessmentMove": "Use the question-quality memo and sampling critique as evidence for method decisions.",
          "reviewMove": "Confirm consent, recruitment, and validity examples against the local research context."
        },
        "styleNotes": ["Name the study-design choice before giving general advice."]
      }
      \`\`\`
    `,
      { payload },
    );

    expect(enrichment).toMatchObject({
      source: 'model-blueprint-enrichment',
      signatureTerms: ['empirical question', 'sampling frame'],
      lens: {
        evidenceNoun: 'empirical evidence',
        decisionNoun: 'method decision',
      },
      quality: {
        status: 'accepted',
        lensGroundingSignalCount: expect.any(Number),
        ungroundedLessonPhraseCount: 0,
        expectedLessonPhraseCount: 3,
        inScopeLessonPhraseCount: 3,
        lessonPhraseCoverageRatio: 1,
        teachingMoveGroundingSignalCount: expect.any(Number),
        missingLessonPhrases: [],
        outOfScopeLessonPhrases: [],
      },
      teachingMoves: {
        openingMove: 'Open with a researchable-question clinic using empirical article examples.',
        practiceMove: 'Have student researchers compare sampling frame evidence before choosing recruitment options.',
        feedbackMove: 'Give feedback on measurement validity evidence and one revision to the method decision.',
        assessmentMove: 'Use the question-quality memo and sampling critique as evidence for method decisions.',
        reviewMove: 'Confirm consent, recruitment, and validity examples against the local research context.',
      },
      lessonPhrases: {
        'lesson-1': {
          context: 'research questions and feasibility',
        },
        'lesson-2': {
          context: 'sampling frame and recruitment consent',
        },
        'lesson-3': {
          context: 'measurement validity and indicators',
        },
      },
    });
    expect(enrichment.quality.lensGroundingSignalCount).toBeGreaterThanOrEqual(2);
    expect(enrichment.quality.teachingMoveGroundingSignalCount).toBeGreaterThanOrEqual(2);
  });

  it('rejects empty or malformed enrichment responses', () => {
    expect(parseBlueprintEnrichmentResponse('not json')).toBeNull();
    expect(normalizeBlueprintEnrichmentResponse({ styleNotes: ['too thin alone'] })).toBeNull();
  });

  it('rejects generic or ungrounded model enrichment when source payload is provided', () => {
    const payload = buildBlueprintEnrichmentPrompt(courseMap).payload;

    const generic = normalizeBlueprintEnrichmentResponse(
      {
        signatureTerms: ['course evidence', 'student learning'],
        lens: {
          domain: 'course practice',
          evidenceNoun: 'course evidence',
          decisionNoun: 'professional decision',
        },
        lessonPhrases: {
          'lesson-1': {
            context: 'course topic',
            evidenceMove: 'use course evidence',
            decisionMove: 'make a decision',
          },
        },
      },
      { payload },
    );
    const risky = normalizeBlueprintEnrichmentResponse(
      {
        signatureTerms: ['office hours', 'room number'],
        lens: {
          domain: 'applied social research',
          evidenceNoun: 'empirical evidence',
          decisionNoun: 'method decision',
        },
      },
      { payload },
    );

    expect(generic).toBeNull();
    expect(risky).toBeNull();
    expect(
      evaluateBlueprintEnrichmentQuality(
        {
          source: 'model-blueprint-enrichment',
          signatureTerms: ['course evidence'],
          lens: { domain: 'course practice' },
          lessonPhrases: {},
          styleNotes: [],
        },
        { payload },
      ),
    ).toMatchObject({
      status: 'rejected',
      reasons: expect.arrayContaining(['Enrichment is too generic to improve compiled materials.']),
    });
  });

  it('rejects incomplete or out-of-scope lesson enrichment coverage', () => {
    const payload = buildBlueprintEnrichmentPrompt(courseMap).payload;
    const incomplete = {
      signatureTerms: ['research questions', 'sampling frame', 'measurement validity'],
      lens: {
        domain: 'applied social research',
        evidenceNoun: 'empirical evidence',
        decisionNoun: 'method decision',
        learnerRole: 'student researcher',
        exampleNoun: 'study-design scenario',
      },
      lessonPhrases: {
        'lesson-1': {
          context: 'research questions and feasibility',
          evidenceMove: 'use empirical evidence to test feasibility',
          decisionMove: 'choose a defensible method decision',
        },
        'lesson-99': {
          context: 'sampling frame and recruitment consent',
          evidenceMove: 'compare sampling evidence for bias',
          decisionMove: 'choose a recruitment strategy',
        },
      },
      teachingMoves: {
        openingMove: 'Open with a research question clinic.',
        practiceMove: 'Compare sampling frame evidence.',
        feedbackMove: 'Give feedback on validity evidence.',
        assessmentMove: 'Use the question-quality memo.',
        reviewMove: 'Confirm recruitment and consent examples.',
      },
    };

    const quality = evaluateBlueprintEnrichmentQuality(incomplete, { payload });

    expect(normalizeBlueprintEnrichmentResponse(incomplete, { payload })).toBeNull();
    expect(quality).toMatchObject({
      status: 'rejected',
      expectedLessonPhraseCount: 3,
      lessonPhraseCount: 2,
      inScopeLessonPhraseCount: 1,
      lessonPhraseCoverageRatio: 0.33,
      missingLessonPhrases: ['lesson-2', 'lesson-3'],
      outOfScopeLessonPhrases: ['lesson-99'],
      reasons: expect.arrayContaining([
        'Lesson enrichment phrases must cover every lesson in the source payload.',
        'Lesson enrichment phrases include lesson ids outside the source payload.',
      ]),
    });
  });

  it('rejects source-vocabulary bait when the lens or lesson phrases drift away from the course', () => {
    const payload = buildBlueprintEnrichmentPrompt(courseMap).payload;
    const drifted = {
      signatureTerms: ['research questions', 'sampling frame', 'measurement validity'],
      lens: {
        domain: 'architecture studio',
        evidenceNoun: 'prototype evidence',
        decisionNoun: 'design decision',
        learnerRole: 'studio designer',
      },
      lessonPhrases: {
        'lesson-1': {
          context: 'brand identity composition',
          evidenceMove: 'use prototype artifacts to inspect visual hierarchy',
          decisionMove: 'choose a design direction for the campaign',
        },
      },
      teachingMoves: {
        openingMove: 'Open with a prototype critique.',
        practiceMove: 'Practice campaign color choices.',
        feedbackMove: 'Give feedback on visual hierarchy.',
        assessmentMove: 'Assess the design campaign.',
        reviewMove: 'Confirm studio gallery constraints.',
      },
      styleNotes: ['Keep the studio critique concrete.'],
    };

    expect(normalizeBlueprintEnrichmentResponse(drifted, { payload })).toBeNull();
    expect(evaluateBlueprintEnrichmentQuality(drifted, { payload })).toMatchObject({
      status: 'rejected',
      sourceGroundingSignalCount: expect.any(Number),
      lensGroundingSignalCount: 0,
      ungroundedLessonPhraseCount: 1,
      ungroundedLessonPhrases: ['lesson-1'],
      reasons: expect.arrayContaining([
        'Enrichment lens is not grounded enough in the source course map.',
        'Lesson enrichment phrases must be grounded in their own lesson source signals.',
      ]),
    });
  });

  it('feeds enriched phrasing into compiled deliverables', () => {
    const enrichment = {
      source: 'model-blueprint-enrichment',
      signatureTerms: ['sampling frame', 'measurement validity'],
      lens: {
        domain: 'applied social research',
        evidenceNoun: 'empirical evidence',
        decisionNoun: 'method decision',
        learnerRole: 'student researcher',
        exampleNoun: 'study-design scenario',
      },
      lessonPhrases: {
        'lesson-1': {
          context: 'research questions and feasibility',
          evidenceMove: 'use empirical evidence to test feasibility',
          decisionMove: 'choose a defensible method decision',
        },
      },
      teachingMoves: {
        openingMove: 'Open with a question clinic using empirical article examples.',
        practiceMove: 'Have student researchers compare sampling frame evidence before choosing a method decision.',
        feedbackMove: 'Give feedback on measurement validity evidence and one revision to the method decision.',
        assessmentMove: 'Use the question-quality memo as evidence for the method decision.',
        reviewMove: 'Confirm recruitment, consent, and validity examples against the local research context.',
      },
      quality: {
        status: 'accepted',
        sourceGroundingSignalCount: 4,
        teachingMoveGroundingSignalCount: 4,
        specificWordCount: 8,
        genericPhraseCount: 0,
      },
      styleNotes: ['Prefer study-design language over generic classroom language.'],
    };

    const blueprint = buildCourseBlueprint(courseMap, { enrichment });
    const compiled = compileBlueprintDeliverables(blueprint, [
      'syllabus',
      'lessonPlans',
      'studyGuides',
      'discussions',
      'slideDecks',
    ]);

    expect(compiled.studyGuides.studyGuides[0].summary).toContain('use empirical evidence to test feasibility');
    expect(compiled.discussions.discussions[0].context).toContain('empirical evidence');
    expect(compiled.slideDecks.decks[0].slides[4].bullets.join(' ')).toContain('method decision');
    expect(compiled.slideDecks.decks[0].slideDeckSequenceGuide.instructionalMoveGuide.practiceMove).toContain(
      'sampling frame evidence',
    );
    expect(compiled.lessonPlans.lessonPlans[0].instructionalMoveGuide.openingMove).toContain('question clinic');
    expect(compiled.lessonPlans.lessonPlans[0].warmUp.facilitation).toContain('question clinic');
    expect(compiled.syllabus.syllabus.blueprintQualityReceipt.enrichmentQuality).toMatchObject({
      sourceGroundingSignalCount: 4,
      teachingMoveGroundingSignalCount: 4,
    });
    expect(compiled.syllabus.syllabus.blueprintQualityReceipt.enrichmentLanguage).toMatchObject({
      signatureTerms: expect.arrayContaining(['sampling frame', 'measurement validity']),
      lens: {
        evidenceNoun: 'empirical evidence',
        decisionNoun: 'method decision',
      },
      teachingMoves: {
        openingMove: expect.stringContaining('question clinic'),
        practiceMove: expect.stringContaining('sampling frame evidence'),
      },
    });
  });
});

describe('lintEnrichedKeyTerm script-aware term length', () => {
  // Long enough to clear the 40-char definition floor, free of META_SURFACE_RE words.
  const definition = 'A common everyday greeting spoken when meeting another person for the first time.';

  it('accepts a 2-character hanzi term', () => {
    const issues = lintEnrichedKeyTerm(
      { term: '你好', definition, example: '你好！我是王老师。(Nǐ hǎo! Wǒ shì Wáng lǎoshī.)' },
      { lessonTitle: 'Lesson 3: Greetings and Introductions' },
    );
    expect(issues).not.toContain('term-missing');
    expect(issues).toEqual([]);
  });

  it('still rejects a 2-character Latin term', () => {
    const issues = lintEnrichedKeyTerm(
      {
        term: 'if',
        definition: 'A keyword that branches program flow based on a boolean condition result.',
        example: 'if x > 0: print(x)',
      },
      { lessonTitle: 'Lesson 3: Conditionals and Boolean Logic' },
    );
    expect(issues).toContain('term-missing');
  });
});
