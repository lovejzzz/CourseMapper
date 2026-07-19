/**
 * V0.14.5 WS-E (E1/E3) + WS-F (F1/F2) — provider breadth and the language
 * depth slice.
 *
 *  E1 — provider-aware API key parsing: the three key shapes are mutually
 *       exclusive (sk-… minus sk-ant-, sk-ant-…, AIza…), so the loader can
 *       never hand an Anthropic key to an OpenAI round. (Provider flag,
 *       default models, and run-dir expansion live in
 *       tests/crucible-round-logic.test.js next to the rest of the pure
 *       driver logic.)
 *  F1 — generated pronunciation reference: language-genre packages gain a
 *       "Pronunciation Reference" markdown built from the study guides'
 *       romanized vocabulary (tone chart for Mandarin-signaled courses);
 *       everything else ships exactly what it shipped before.
 *  F2 — dialogue contract: the kernel prompt asks for an optional dialogue
 *       (language-gated like rm), parsing is lint-tolerant (malformed turns
 *       dropped, capped at 6, never costs the lesson), and the compiled
 *       lesson plan + study guide carry the "Dialogue Practice" block. The
 *       dialogue deliberately does NOT join the rm recovery retry.
 */
import { describe, expect, it } from 'vitest';
import { PROVIDER_KEY_RULES, pickApiKeyFromEnvText } from '../scripts/lib/crucibleRound.mjs';
import {
  buildLessonKernelPrompt,
  courseUsesNonLatinScript,
  listLessonRomanizationGaps,
  parseLessonKernelResponse,
  sanitizeDialogueTurns,
} from '../src/lib/blueprintEnrichmentPass.js';
import {
  buildPronunciationReference,
  classifyCourseAssetGenre,
  collectPronunciationRows,
} from '../src/lib/requiredLabAssets.js';
import { buildCourseBlueprint, compileBlueprintDeliverable } from '../src/lib/courseBlueprintCompiler.js';
import {
  assessTargetLanguagePresence,
  detectForeignLanguageTeachingContent,
} from '../src/lib/languageIdentityGuard.js';

// ── fixtures ────────────────────────────────────────────────────────────────

function mandarinCourseMap() {
  return {
    courseName: 'Elementary Mandarin Chinese I',
    lessons: [
      {
        title: 'Lesson 1: Greetings and Self-Introductions',
        sections: [
          {
            topicSection: 'greetings; pinyin and the four tones',
            learningObjectives:
              'Exchange basic greetings with correct tones.\nIntroduce yourself with name and origin.',
            weeklyAssessments: 'Oral drill: record a greeting exchange',
            asyncActivities: 'Listen to the greetings audio set.',
            syncActivities: 'Pair drill: greeting exchanges.',
            supportingResources: 'Greetings audio packet',
          },
        ],
      },
    ],
  };
}

function geologyCourseMap() {
  return {
    courseName: 'Physical Geology',
    lessons: [
      {
        title: 'Lesson 1: Minerals',
        sections: [
          {
            topicSection: 'mineral identification',
            learningObjectives: 'Analyze mineral properties with hand-specimen evidence.',
            weeklyAssessments: 'Quiz: mineral criteria',
            asyncActivities: 'Read the minerals chapter.',
            syncActivities: 'Lab: identify specimens.',
            supportingResources: 'Mineral kit guide',
          },
        ],
      },
    ],
  };
}

const MANDARIN_KEY_TERMS = [
  {
    term: '你好',
    definition: 'The standard neutral greeting used between speakers at any time of day.',
    example: '你好！我叫王明。',
    romanization: 'nǐ hǎo',
  },
  {
    term: '请给我',
    definition: 'A polite request meaning please give me, used when asking for an item.',
    example: '请给我水。',
    romanization: 'qǐng gěi wǒ',
  },
];

const DIALOGUE_TURNS = [
  { speaker: 'A', line: '你好！', rm: 'nǐ hǎo' },
  { speaker: 'B', line: '你好，请给我水。', rm: 'nǐ hǎo, qǐng gěi wǒ shuǐ' },
  { speaker: 'A', line: '好的。', rm: 'hǎo de' },
  { speaker: 'B', line: '谢谢！', rm: 'xièxie' },
];

// ── E1: provider-keyed API key parsing ──────────────────────────────────────

describe('E1 — provider-aware API key parsing (pickApiKeyFromEnvText)', () => {
  const envText = [
    '# CourseMapper provider keys',
    'OPENAI_API_KEY=sk-proj-openai-1234567890',
    "export ANTHROPIC_API_KEY='sk-ant-api03-anthropic-key-123'",
    'GEMINI_API_KEY="AIzaSyGoogleKey_1234567890"',
  ].join('\n');

  it('each provider gets ITS key from a mixed file', () => {
    expect(pickApiKeyFromEnvText(envText, 'openai')).toBe('sk-proj-openai-1234567890');
    expect(pickApiKeyFromEnvText(envText, 'anthropic')).toBe('sk-ant-api03-anthropic-key-123');
    expect(pickApiKeyFromEnvText(envText, 'google')).toBe('AIzaSyGoogleKey_1234567890');
  });

  it('an Anthropic-only file NEVER yields an OpenAI key (sk-ant- excluded from sk-)', () => {
    const anthropicOnly = 'ANTHROPIC_API_KEY=sk-ant-api03-only-key';
    expect(pickApiKeyFromEnvText(anthropicOnly, 'openai')).toBe('');
    expect(pickApiKeyFromEnvText(anthropicOnly, 'anthropic')).toBe('sk-ant-api03-only-key');
  });

  it('bare-value lines resolve by shape alone', () => {
    expect(pickApiKeyFromEnvText('sk-bare-openai-key-12345', 'openai')).toBe('sk-bare-openai-key-12345');
    expect(pickApiKeyFromEnvText('AIzaSyBareGoogleKey12345', 'google')).toBe('AIzaSyBareGoogleKey12345');
    expect(pickApiKeyFromEnvText('sk-bare-openai-key-12345', 'google')).toBe('');
  });

  it('deepseek requires the sk- shape — prose comment lines are never keys (Scion session regression)', () => {
    const withProse = [
      'For openai use the project key below', // un-hashed prose over 20 chars
      'OPENAI_API_KEY=sk-proj-openai-1234567890',
      'Deepseek_API_KEY=sk-deepseek-key-1234567890',
    ].join('\n');
    expect(pickApiKeyFromEnvText(withProse, 'deepseek')).toBe('sk-deepseek-key-1234567890');
    expect(pickApiKeyFromEnvText('just a sentence that is long enough', 'deepseek')).toBe('');
    // …and an anthropic-shaped value is never a deepseek key.
    expect(pickApiKeyFromEnvText('ANTHROPIC_API_KEY=sk-ant-api03-anthropic-key-123', 'deepseek')).toBe('');
  });

  it('a mislabeled line is rejected by shape, never returned cross-provider', () => {
    // OPENAI_API_KEY carrying a Google-shaped value is not an OpenAI key…
    expect(pickApiKeyFromEnvText('OPENAI_API_KEY=AIzaSyMislabeled12345', 'openai')).toBe('');
    // …and a line NAMED for another provider is skipped even when the shape
    // matches the requested provider.
    expect(pickApiKeyFromEnvText('GOOGLE_API_KEY=sk-not-actually-google-123', 'openai')).toBe('');
  });

  it('unknown providers and empty content return empty (caller raises the actionable error)', () => {
    expect(pickApiKeyFromEnvText(envText, 'azure')).toBe('');
    expect(pickApiKeyFromEnvText('', 'openai')).toBe('');
    expect(PROVIDER_KEY_RULES.anthropic.envVars).toContain('ANTHROPIC_API_KEY');
    expect(PROVIDER_KEY_RULES.google.envVars).toContain('GEMINI_API_KEY');
  });
});

// ── F2: the dialogue contract (mirrors rm end to end) ───────────────────────

describe('F2 — kernel dialogue contract (language-gated, lint-tolerant)', () => {
  it('adds the dialogue instruction to the kernel prompt for language courses ONLY (same gate as rm)', () => {
    expect(courseUsesNonLatinScript(mandarinCourseMap())).toBe(true);
    const mandarinPrompt = buildLessonKernelPrompt(mandarinCourseMap(), [0]);
    expect(mandarinPrompt.systemPrompt).toContain('dialogue = 4-6 short conversational turns');
    expect(mandarinPrompt.systemPrompt).toContain('"speaker":"A"|"B"');

    const geologyPrompt = buildLessonKernelPrompt(geologyCourseMap(), [0]);
    expect(geologyPrompt.systemPrompt).not.toContain('dialogue');
  });

  it('sanitizeDialogueTurns drops malformed turns, caps at 6, normalizes speakers, sanitizes rm', () => {
    const turns = sanitizeDialogueTurns([
      { speaker: 'A', line: '你好！', rm: 'nǐ hǎo' },
      { speaker: 'banana', line: '你好，你叫什么名字？', rm: 'nǐ jiào shénme míngzi' },
      { speaker: 'A', line: '' }, // dropped: empty line
      { speaker: 'B', line: 'x'.repeat(200) }, // dropped: absurd length
      'not-an-object', // dropped
      { speaker: 'B', line: '我叫王明。', rm: '我叫王明' }, // rm carries script → rm dropped, turn kept
      { speaker: 'A', line: '很高兴认识你。', rm: 'hěn gāoxìng rènshi nǐ' },
      { speaker: 'B', line: '再见。', rm: 'zàijiàn' },
      { speaker: 'A', line: '明天见。', rm: 'míngtiān jiàn' },
      { speaker: 'B', line: '好，明天见！', rm: 'hǎo, míngtiān jiàn' }, // over the cap
    ]);
    expect(turns).toHaveLength(6);
    expect(turns[0]).toEqual({ speaker: 'A', line: '你好！', rm: 'nǐ hǎo' });
    // Unknown speaker normalizes to the alternating slot.
    expect(turns[1].speaker).toBe('B');
    // Script-carrying rm is dropped; the turn survives.
    const scriptRmTurn = turns.find((turn) => turn.line === '我叫王明。');
    expect(scriptRmTurn).toBeTruthy();
    expect(scriptRmTurn.rm).toBeUndefined();
  });

  it('fewer than 2 usable turns → no dialogue at all', () => {
    expect(sanitizeDialogueTurns([{ speaker: 'A', line: '你好！' }])).toEqual([]);
    expect(sanitizeDialogueTurns(null)).toEqual([]);
    expect(sanitizeDialogueTurns('你好')).toEqual([]);
  });

  function kernelResponse({ dialogue } = {}) {
    return JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-1',
          facts: ['Mandarin greetings change with time of day and the relationship between speakers.'],
          keyTerms: [
            {
              tr: '你好',
              df: 'The standard neutral greeting used between speakers at any time of day.',
              eg: '你好！我叫王明。',
              mi: 'Students assume it is only used in the morning.',
              cx: 'It is time-neutral; specific-time greetings exist separately.',
              rm: 'nǐ hǎo',
            },
          ],
          ...(dialogue !== undefined ? { dialogue } : {}),
        },
      ],
    });
  }

  it('parses the dialogue off the kernel lesson and attaches it to the payload', () => {
    const prompt = buildLessonKernelPrompt(mandarinCourseMap(), [0]);
    const parsed = parseLessonKernelResponse(kernelResponse({ dialogue: DIALOGUE_TURNS }), { prompt });
    expect(parsed).toBeTruthy();
    const payload = parsed.lessons['lesson-1'];
    expect(payload.dialogue).toHaveLength(4);
    expect(payload.dialogue[0]).toEqual({ speaker: 'A', line: '你好！', rm: 'nǐ hǎo' });
    // The rm contract is untouched: the keyTerm still carries its romanization.
    expect(payload.keyTerms[0].romanization).toBe('nǐ hǎo');
  });

  it('a malformed dialogue NEVER costs the lesson (and absent dialogue is fine)', () => {
    const prompt = buildLessonKernelPrompt(mandarinCourseMap(), [0]);
    const malformed = parseLessonKernelResponse(kernelResponse({ dialogue: ['garbage', 42, { speaker: 'A' }] }), {
      prompt,
    });
    expect(malformed).toBeTruthy();
    expect(malformed.lessons['lesson-1'].dialogue).toBeUndefined();
    expect(malformed.lessons['lesson-1'].keyTerms).toHaveLength(1);

    const absent = parseLessonKernelResponse(kernelResponse(), { prompt });
    expect(absent.lessons['lesson-1'].dialogue).toBeUndefined();
  });

  it('dialogue does NOT join the rm recovery retry (cost discipline)', () => {
    // A lesson whose keyTerms all carry rm has NO romanization gaps — even
    // when the dialogue is completely missing. Absent dialogue never earns a
    // second model call.
    const payload = {
      keyTerms: [{ term: '你好', romanization: 'nǐ hǎo' }],
      // no dialogue at all
    };
    expect(listLessonRomanizationGaps(payload)).toEqual([]);
  });
});

describe('language identity firewall', () => {
  it('distinguishes foreign teaching content from a legitimate learner-population citation', () => {
    expect(
      detectForeignLanguageTeachingContent({
        courseIdentity: 'Elementary Mandarin Chinese I',
        text: 'The Second Language Acquisition of Mandarin Tones by English, Japanese and Korean Speakers.',
      }),
    ).toBeNull();

    expect(
      detectForeignLanguageTeachingContent({
        courseIdentity: 'Elementary Mandarin Chinese I',
        text: 'Korean commonly uses native Korean and Sino-Korean number systems. Review Hangul counters.',
      }),
    ).toMatchObject({ languageId: 'korean', languageLabel: 'Korean' });
  });

  it('requires visible hanzi and tone-marked pinyin in each single-language Mandarin kernel', () => {
    expect(
      assessTargetLanguagePresence({
        courseIdentity: 'Elementary Mandarin Chinese I',
        text: 'Students practice a greeting and revise their response.',
      }),
    ).toMatchObject({
      required: true,
      complete: false,
      missing: ['hanzi', 'tone-marked-pinyin'],
    });
    expect(
      assessTargetLanguagePresence({
        courseIdentity: 'Elementary Mandarin Chinese I',
        text: 'Students practice 你好 (nǐ hǎo) and revise their response.',
      }),
    ).toMatchObject({ required: true, complete: true });
    expect(
      assessTargetLanguagePresence({
        courseIdentity: 'Comparative Mandarin and Korean Language Pedagogy',
        text: 'This lesson focuses only on Hangul.',
      }),
    ).toMatchObject({ required: false, complete: true });
  });

  it('does not invent unsupported Hanzi for an explicitly Pinyin-only source scope', () => {
    expect(
      assessTargetLanguagePresence({
        courseIdentity: 'Elementary Mandarin Chinese I',
        sourceText: 'Lesson 1: Pinyin and Tones. Distinguish initials, finals, and four tone contours.',
        text: 'Learners compare mā, má, mǎ, and mà while listening.',
      }),
    ).toMatchObject({ required: true, complete: true, pinyinOnly: true, missing: [] });

    const prompt = buildLessonKernelPrompt(
      {
        courseName: 'Elementary Mandarin Chinese I',
        lessons: [
          {
            title: 'Lesson 1: Pinyin and Tones',
            sections: [{ topicSection: 'Pinyin System; Four Tones' }],
          },
        ],
      },
      [0],
      { questionsPerLesson: 4 },
    );

    expect(prompt.systemPrompt).toContain('Source-scoped Pinyin/tones requirement');
    expect(prompt.systemPrompt).toContain('Do not invent unsupported Hanzi');
    expect(prompt.systemPrompt).not.toContain('every broad Mandarin lesson');

    const response = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-1',
          facts: [
            'Mandarin uses four main tone contours to distinguish otherwise similar spoken syllables.',
            'The first tone is high and level while the second tone rises.',
            'The third tone is low then rising while the fourth falls sharply.',
            'A Pinyin syllable may contain an initial followed by a final.',
            'Tone changes meaning across mā, má, mǎ, and mà.',
          ],
          keyTerms: [
            {
              tr: 'tone contour',
              df: 'A pitch movement across one spoken syllable that can distinguish lexical meaning.',
              eg: 'A learner compares mā, má, mǎ, and mà before repeating each contour.',
              mi: 'Changing a tone changes only emotion and never changes lexical meaning.',
              cx: 'The four contours can distinguish meaning even when the initial and final stay the same.',
            },
          ],
        },
      ],
    });
    expect(parseLessonKernelResponse(response, { prompt })).toBeTruthy();
  });

  it('keeps the Hanzi + tone-marked Pinyin contract for broad Mandarin lessons', () => {
    const prompt = buildLessonKernelPrompt(
      {
        courseName: 'Elementary Mandarin Chinese I',
        lessons: [
          {
            title: 'Lesson 1: Greetings',
            sections: [{ topicSection: 'Introductions and polite greetings' }],
          },
        ],
      },
      [0],
      { questionsPerLesson: 4 },
    );

    expect(prompt.systemPrompt).toContain('every broad Mandarin lesson');
    expect(prompt.systemPrompt).toContain('Hanzi example paired with its tone-marked Pinyin');
  });

  it('projects a grammar-required Mandarin pair into learner-facing facts', () => {
    const prompt = buildLessonKernelPrompt(mandarinCourseMap(), [0]);
    const response = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-1',
          targetLanguagePair: { hanzi: '你好', pinyin: 'nǐ hǎo', english: 'hello' },
          facts: ['Tone contours distinguish otherwise identical spoken syllables in Mandarin.'],
          keyTerms: [
            {
              tr: 'tone contour',
              df: 'A pitch movement over one syllable that can distinguish lexical meaning in Mandarin.',
              eg: 'A learner compares mā, má, mǎ, and mà while listening to the same initial and final.',
              mi: 'Changing the pitch only adds emotion and never changes the word being spoken.',
              cx: 'The contour can distinguish lexical meaning even when the initial and final remain identical.',
            },
          ],
        },
      ],
    });

    const parsed = parseLessonKernelResponse(response, { prompt });
    expect(parsed).toBeTruthy();
    expect(parsed.lessons['lesson-1'].kernel.facts).toContain('你好 (nǐ hǎo) means hello.');
  });

  it('rejects a Korean lesson kernel inside Mandarin but permits an explicitly comparative course', () => {
    const contaminatedResponse = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-1',
          facts: ['Korean commonly uses native Korean and Sino-Korean number systems for different contexts.'],
          keyTerms: [
            {
              tr: 'Hangul counters',
              df: 'Hangul is the Korean writing system used to represent the language in syllable blocks.',
              eg: 'Learners combine a native Korean number with the counter practiced in the dialogue.',
              mi: 'One Korean number system works in every context.',
              cx: 'The grammatical context determines which Korean number system and counter to use.',
            },
          ],
        },
      ],
    });

    const mandarinPrompt = buildLessonKernelPrompt(mandarinCourseMap(), [0]);
    expect(mandarinPrompt.courseName).toBe('Elementary Mandarin Chinese I');
    expect(parseLessonKernelResponse(contaminatedResponse, { prompt: mandarinPrompt })).toBeNull();

    const comparativePrompt = buildLessonKernelPrompt(
      { ...mandarinCourseMap(), courseName: 'Comparative Mandarin and Korean Language Pedagogy' },
      [0],
    );
    expect(parseLessonKernelResponse(contaminatedResponse, { prompt: comparativePrompt })).toBeTruthy();
  });
});

describe('F2 — compiled render sites (lesson plan practice block + study guide)', () => {
  function mandarinBlueprint({ dialogue = DIALOGUE_TURNS } = {}) {
    return buildCourseBlueprint(mandarinCourseMap(), {
      enrichment: {
        source: 'test-enrichment',
        lessonContent: {
          'lesson-1': {
            quizItems: [],
            keyTerms: MANDARIN_KEY_TERMS,
            ...(dialogue ? { dialogue } : {}),
          },
        },
      },
    });
  }

  it('the lesson plan carries the Dialogue Practice block with every turn and its rm', () => {
    const plans = compileBlueprintDeliverable('lessonPlans', mandarinBlueprint(), { skipLanguageFinalizer: true });
    const plan = plans.lessonPlans[0];
    expect(plan.dialoguePractice).toBeTruthy();
    expect(plan.dialoguePractice.turns).toHaveLength(4);
    expect(plan.dialoguePractice.turns[0]).toEqual({ speaker: 'A', line: '你好！', rm: 'nǐ hǎo' });
    expect(plan.dialoguePractice.intro).toMatch(/swap roles/i);
    // It sits beside the practice outline — the docx exporter renders it as a
    // "Dialogue Practice" subsection right after the session outline.
    expect(Array.isArray(plan.outline)).toBe(true);
  });

  it('the study guide carries the same block after its key terms', () => {
    const guides = compileBlueprintDeliverable('studyGuides', mandarinBlueprint(), { skipLanguageFinalizer: true });
    const guide = guides.studyGuides[0];
    expect(guide.keyTerms[0].term).toBe('你好 (nǐ hǎo)');
    expect(guide.dialoguePractice.turns.map((turn) => turn.line)).toEqual([
      '你好！',
      '你好，请给我水。',
      '好的。',
      '谢谢！',
    ]);
  });

  it('F1 hook: compiled study-guide key terms keep the STRUCTURED script/romanization pair', () => {
    const guides = compileBlueprintDeliverable('studyGuides', mandarinBlueprint(), { skipLanguageFinalizer: true });
    const term = guides.studyGuides[0].keyTerms[0];
    expect(term.scriptTerm).toBe('你好');
    expect(term.romanization).toBe('nǐ hǎo');
  });

  it('projects an admitted Hanzi-Pinyin fact when the model key terms are Latin-only', () => {
    const blueprint = buildCourseBlueprint(mandarinCourseMap(), {
      enrichment: {
        source: 'test-enrichment',
        lessonContent: {
          'lesson-1': {
            quizItems: [],
            keyTerms: [
              {
                term: 'Tone contour',
                definition: 'A pitch movement that distinguishes lexical meaning.',
                example: 'Learners compare the four Mandarin tones.',
              },
            ],
            kernel: { facts: ['妈 (mā) means mother.'] },
          },
        },
      },
    });

    const guide = compileBlueprintDeliverable('studyGuides', blueprint, { skipLanguageFinalizer: true }).studyGuides[0];
    expect(guide.keyTerms).toContainEqual(
      expect.objectContaining({
        term: '妈 (mā)',
        scriptTerm: '妈',
        romanization: 'mā',
        definition: '妈 means mother.',
        enrichmentSource: 'admitted-language-pair',
      }),
    );
  });

  it('keeps an admitted language pair in a cumulative exam-day guide', () => {
    const courseMap = mandarinCourseMap();
    courseMap.lessons.push({
      title: 'Lesson 2: Final exam',
      sections: [
        {
          topicSection: 'cumulative Mandarin review',
          learningObjectives: 'Demonstrate cumulative beginner Mandarin proficiency.',
          weeklyAssessments: 'Final exam (40%)',
          asyncActivities: 'Review the course study guides.',
          syncActivities: 'Complete the final exam.',
          supportingResources: 'Course study guides',
        },
      ],
    });
    const blueprint = buildCourseBlueprint(courseMap, {
      enrichment: {
        source: 'test-enrichment',
        lessonContent: {
          'lesson-1': {
            quizItems: [],
            keyTerms: [
              {
                term: 'Tone contour',
                definition: 'A pitch movement that distinguishes lexical meaning.',
                example: 'Learners compare the four Mandarin tones.',
              },
            ],
            kernel: { facts: ['妈 (mā) means mother.'] },
          },
        },
      },
    });

    const examGuide = compileBlueprintDeliverable('studyGuides', blueprint, { skipLanguageFinalizer: true })
      .studyGuides[1];
    expect(examGuide.examDay).toBe(true);
    expect(examGuide.keyTerms).toContainEqual(
      expect.objectContaining({ term: '妈 (mā)', romanization: 'mā', enrichmentSource: 'admitted-language-pair' }),
    );
  });

  it('no dialogue → no block; non-language courses are untouched', () => {
    const noDialogue = compileBlueprintDeliverable('lessonPlans', mandarinBlueprint({ dialogue: null }), {
      skipLanguageFinalizer: true,
    });
    expect(noDialogue.lessonPlans[0].dialoguePractice).toBeUndefined();

    const geology = buildCourseBlueprint(geologyCourseMap(), {
      enrichment: {
        source: 'test-enrichment',
        lessonContent: {
          'lesson-1': {
            quizItems: [],
            keyTerms: [
              {
                term: 'Cleavage',
                definition: 'The tendency of a mineral to break along planes of weak bonding.',
                example: 'Halite breaks into cubes along three cleavage planes.',
              },
            ],
          },
        },
      },
    });
    const geologyGuides = compileBlueprintDeliverable('studyGuides', geology, { skipLanguageFinalizer: true });
    expect(geologyGuides.studyGuides[0].dialoguePractice).toBeUndefined();
    expect(geologyGuides.studyGuides[0].keyTerms[0].scriptTerm).toBeUndefined();
  });
});

// ── F1: the generated pronunciation reference ───────────────────────────────

describe('F1 — pronunciation reference (language-genre Required Assets)', () => {
  function studyGuidesDeliverable(keyTerms) {
    return {
      studyGuides: {
        status: 'done',
        data: { studyGuides: [{ lessonTitle: 'Lesson 1: Greetings', keyTerms }] },
      },
    };
  }

  it('the Mandarin course classifies as language and yields a tone chart + hanzi|pinyin|gloss table', () => {
    const courseMap = mandarinCourseMap();
    expect(classifyCourseAssetGenre({ courseMap })).toBe('language');
    const reference = buildPronunciationReference({
      courseMap,
      deliverables: studyGuidesDeliverable([
        { term: '你好', scriptTerm: '你好', romanization: 'nǐ hǎo', definition: 'A neutral greeting. Used any time.' },
        { term: '请给我 (qǐng gěi wǒ)', definition: 'A polite request meaning please give me.' },
      ]),
    });
    expect(reference).toBeTruthy();
    expect(reference.mandarin).toBe(true);
    expect(reference.rowCount).toBe(2);
    // The four tones with the mā/má/mǎ/mà example.
    expect(reference.markdown).toContain('## The four Mandarin tones');
    for (const example of ['mā', 'má', 'mǎ', 'mà']) expect(reference.markdown).toContain(example);
    // Structured fields AND the "term (rm)" display fallback both yield rows.
    expect(reference.markdown).toContain('| Hanzi | Pinyin | Gloss |');
    expect(reference.markdown).toContain('| 你好 | nǐ hǎo | A neutral greeting. |');
    expect(reference.markdown).toContain('| 请给我 | qǐng gěi wǒ |');
  });

  it('rows are capped at 40 and de-duplicated', () => {
    const manyTerms = Array.from({ length: 60 }, (_, index) => ({
      term: `词${index}`,
      scriptTerm: `词${index}`,
      romanization: `cí ${index}`,
      definition: 'A vocabulary item.',
    }));
    const rows = collectPronunciationRows({
      deliverables: studyGuidesDeliverable([...manyTerms, ...manyTerms]),
    });
    expect(rows).toHaveLength(40);
  });

  it('non-language courses get NOTHING (geology stays untouched)', () => {
    expect(
      buildPronunciationReference({
        courseMap: geologyCourseMap(),
        deliverables: studyGuidesDeliverable([
          { term: 'Cleavage', definition: 'Breaking along planes of weak bonding.' },
        ]),
      }),
    ).toBeNull();
  });

  it('a language course with NO romanized vocabulary gets nothing (no empty chart, no wrong tone chart)', () => {
    const spanish = {
      courseName: 'Elementary Spanish I',
      lessons: [
        {
          title: 'Lesson 1: Saludos',
          sections: [
            {
              topicSection: 'greetings; pronunciation basics',
              learningObjectives: 'Exchange basic greetings with correct pronunciation.',
            },
          ],
        },
      ],
    };
    expect(classifyCourseAssetGenre({ courseMap: spanish })).toBe('language');
    expect(
      buildPronunciationReference({
        courseMap: spanish,
        deliverables: studyGuidesDeliverable([{ term: 'Hola', definition: 'A standard greeting.' }]),
      }),
    ).toBeNull();
  });

  it('a non-Mandarin script course gets the vocabulary table WITHOUT the four-tones chart', () => {
    const japanese = {
      courseName: 'Elementary Japanese I',
      lessons: [
        {
          title: 'Lesson 1: Greetings (あいさつ)',
          sections: [{ topicSection: 'hiragana; greetings', learningObjectives: 'Read basic hiragana greetings.' }],
        },
      ],
    };
    const reference = buildPronunciationReference({
      courseMap: japanese,
      deliverables: studyGuidesDeliverable([
        { term: 'こんにちは', scriptTerm: 'こんにちは', romanization: 'konnichiwa', definition: 'A daytime greeting.' },
        { term: 'ありがとう', scriptTerm: 'ありがとう', romanization: 'arigatō', definition: 'Thank you.' },
      ]),
    });
    expect(reference).toBeTruthy();
    expect(reference.mandarin).toBe(false);
    expect(reference.markdown).not.toContain('four Mandarin tones');
    expect(reference.markdown).toContain('| Term | Romanization | Gloss |');
    expect(reference.markdown).toContain('| こんにちは | konnichiwa |');
  });
});
