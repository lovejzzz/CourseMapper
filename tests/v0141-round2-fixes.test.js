/**
 * V0.14.1 round 2 — five production bugs found by deep-reading the Crucible
 * Round-1 LIVE outputs (verification-output/crucible/round-2026-06-11T06-39-33-774Z/).
 *
 *  1. CITATION RELEVANCE GATE LEAKED ON GENERIC TOKENS: World Lit Week 7
 *     attached "Knowledge translation of research findings" (implementation
 *     science) on the word "translation"; Week 9 attached "From solitude to
 *     solicitation…" on "solitude"; Week 14 attached "Prevalence of
 *     cardiovascular disease in type 2 diabetes: a systematic literature
 *     review of scientific evidence from across the world…" on
 *     literature/world/review/evidence. Fixed two ways: OpenAlex
 *     primary_topic field/domain gating + a hardened token fallback.
 *  2. FINALIZER REWROTE CANONICAL TITLES: the live geology syllabus grading
 *     table shipped "A1.1 — the Week 1 quiz" and "A7.1 — the Week 7
 *     artifact" — the keep-count rewrote registry NAME cells on their 3rd+
 *     document mention. (PACKAGE_MANIFEST.json and the course-map xlsx kept
 *     canonical titles — the leak was the requirements table only.)
 *  3. "EVIDENCE PACKET" LEAKED AS MATERIAL + CONCEPT: World Lit weeks
 *     5/7-12 listed "The Lesson N evidence packet" as the FIRST named
 *     syllabus material, and Week 5's criterion read "Names the relevant
 *     Lesson 5 evidence packet concept accurately" (the lesson's primary
 *     text "The Thousand and One Nights" was elected evidence packet, then
 *     the finalizer rewrote the work's title everywhere).
 *  4. MANDARIN STUDY GUIDES SHIPPED HANZI WITHOUT PINYIN: live key-term
 *     tables show "请给我" with no tone-marked romanization. Language-course
 *     kernel prompts now request an `rm` field; renders pair
 *     "term (romanization)".
 *  5. BACKTICK STRIP DESTROYED SHORT OPERATOR LISTS: live CS deck bullet
 *     "Compound conditions can combine tests with and or" (source
 *     "with `and` or `or`"). Short common-word code tokens now keep single
 *     quotes.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

import { searchScholarlyReadings } from '../src/lib/knowledge/providers.js';
import {
  attachGenomeResources,
  attachOpenReadings,
  scoreReadingRelevance,
  topicGateVerdict,
  allowedTopicNamesForCourse,
} from '../src/lib/knowledge/readingListEngine.js';
import {
  matchesKnownOffender,
  blacklistYieldsToTopicalOverlap,
  isTruncatedBulletLine,
} from '../src/lib/quality/artifactDefectPatterns.js';
import { finalizeCompiledDeliverableLanguage } from '../src/lib/compiledLanguageFinalizer.js';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverable,
  compileBlueprintDeliverables,
} from '../src/lib/courseBlueprintCompiler.js';
import {
  buildBlueprintFromGraph,
  deriveCourseGraphFromCourseMap,
  renderCourseMapFromGraph,
} from '../src/lib/courseGraph';
import { repairWorkspaceReadiness, scopeDeliverableDataToLessons } from '../src/lib/deliverableReadiness.js';
import {
  isRenderableQuizEntry,
  isUnsafeFullReplacement,
  mergeRegeneratedLessonItems,
} from '../src/lib/lessonRegenMerge.js';
import { buildDeliverableDocxBlob } from '../src/lib/exporters/bulkDocxExporter.js';
import {
  buildLessonKernelPrompt,
  buildLessonContentEnrichmentPrompt,
  courseUsesNonLatinScript,
  listLessonRomanizationGaps,
  mergeRomanizationRecovery,
  parseLessonKernelResponse,
} from '../src/lib/blueprintEnrichmentPass.js';

// ── Fix 1 fixtures: the live off-discipline leaks, with topic data ─────────

// Live Week 14 leak (quoted from the Round-1 world-lit syllabus): shares
// literature/world/review/evidence with the lesson — all generic.
const DIABETES_WORK = {
  title:
    'Prevalence of cardiovascular disease in type 2 diabetes: a systematic literature review of ' +
    'scientific evidence from across the world in 2007–2017',
  abstract:
    'A systematic literature review of global evidence on cardiovascular disease prevalence in ' +
    'people with type 2 diabetes, summarizing incidence and mortality estimates across the world.',
  url: 'https://cardiab.biomedcentral.com/track/pdf/10.1186/s12933-018-0728-6.pdf',
  citedBy: 2500,
  authors: 'Thomas R. Einarson, Annabel Acs, Craig Ludwig et al.',
  license: 'cc-by',
  primaryTopic: { name: 'Diabetes and Cardiovascular Outcomes', field: 'Medicine', domain: 'Health Sciences' },
};

// The genuinely relevant Week 5 attachment from the same live run.
const SCHEHERAZADE_WORK = {
  title: 'Metamorphoses of Scheherazade in literature and film',
  abstract:
    'Traces how the frame narrative of the Thousand and One Nights and the figure of Scheherazade ' +
    'are reworked across novels and cinema.',
  url: 'https://www.cambridge.org/core/services/aop-cambridge-core/content/view/scheherazade.pdf',
  citedBy: 60,
  authors: 'Wen-chin Ouyang',
  license: 'open access',
  primaryTopic: {
    name: 'World Literatures and Comparative Criticism',
    field: 'Arts and Humanities',
    domain: 'Social Sciences',
  },
};

// Live Week 7 leak, presented WITHOUT topic data to exercise the hardened
// token fallback: its only lesson overlap is the generic word "translation".
const KNOWLEDGE_TRANSLATION_WORK = {
  title: 'Knowledge translation of research findings',
  abstract:
    'Reviews strategies for moving research findings into clinical practice, including audit, ' +
    'feedback, and implementation interventions for health professionals.',
  url: 'https://implementationscience.biomedcentral.com/counter/pdf/10.1186/1748-5908-7-50',
  citedBy: 4000,
  authors: 'Jeremy Grimshaw, Martin Eccles, John N. Lavis et al.',
  license: 'cc-by',
};

// No-topic-data positive control: ≥2 distinct hits incl. a non-generic token.
const MEDIATION_WORK = {
  title: 'The translator as cultural mediator in cross-cultural fiction',
  abstract: 'Examines the mediation strategies translators use when carrying fiction across cultures.',
  url: 'https://example.org/mediator.pdf',
  citedBy: 40,
  authors: 'A. Translator',
  license: 'open access',
};

function worldLitGraph({ number, sessionTitle, conceptTerms }) {
  return {
    course: { name: 'World Literature' },
    sessions: [{ id: 's1', number, title: sessionTitle, sections: [{ topic: 'x' }] }],
    concepts: conceptTerms.map((term, index) => ({ id: `c${index + 1}`, term })),
    edges: { teaches: conceptTerms.map((_, index) => ({ from: 's1', to: `c${index + 1}` })) },
    resources: [],
  };
}

function stubReadings(works) {
  return {
    searchScholarlyReadings: vi.fn(async () => works),
    searchBookMetadata: vi.fn(async () => []),
  };
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('network call in round-2 proof — engine paths must be offline');
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── (1) topic-field rejection ───────────────────────────────────────────────

describe('fix 1 — OpenAlex topic gate rejects off-discipline papers regardless of token overlap', () => {
  it('maps a literature course onto the Arts and Humanities / Social Sciences fields', () => {
    const graph = worldLitGraph({
      number: 14,
      sessionTitle: 'Lesson 14: Comparative Essay and World Literature Review',
      conceptTerms: ['world literature review', 'comparative evidence'],
    });
    const allowed = allowedTopicNamesForCourse(graph);
    expect(allowed).toBeTruthy();
    expect(allowed.fields.has('arts and humanities')).toBe(true);
    expect(allowed.fields.has('social sciences')).toBe(true);
    // Domains stay EMPTY for lit: a Psychology-field paper (domain "Social
    // Sciences") must not slip in through the domain door.
    expect(allowed.domains.size).toBe(0);
    expect(topicGateVerdict(DIABETES_WORK, allowed)).toBe('off-discipline');
    expect(topicGateVerdict(SCHEHERAZADE_WORK, allowed)).toBe('on-discipline');
    expect(topicGateVerdict(KNOWLEDGE_TRANSLATION_WORK, allowed)).toBe('no-topic-data');
  });

  it('rejects the diabetes review for a lit course even though the TOKEN gate passes it', async () => {
    const graph = worldLitGraph({
      number: 14,
      sessionTitle: 'Lesson 14: Comparative Essay and World Literature Review',
      conceptTerms: ['world literature review', 'comparative evidence'],
    });
    // Prove the live leak: on tokens alone this paper PASSES (4 generic hits).
    const tokenScore = scoreReadingRelevance(DIABETES_WORK, {
      allTokens: new Set(['world', 'literature', 'review', 'evidence', 'comparative', 'essay']),
      strongConceptTokens: new Set(['literature', 'comparative']),
      phrases: ['world literature review'],
    });
    expect(tokenScore.pass).toBe(true);
    expect(tokenScore.specificHits).toBe(0); // …but every hit is generic.

    const providers = stubReadings([DIABETES_WORK]);
    const attached = await attachOpenReadings(graph, { providers });
    expect(attached).toBe(0);
    expect(graph.resources).toHaveLength(0);
    const decision = graph.readingListDecisions[0];
    expect(decision.type).toBe('no-relevant-reading');
    expect(decision.rejectedOffDiscipline).toBe(1);
  });

  it('accepts the Scheherazade paper (Arts and Humanities) and still rejects the diabetes paper alongside it', async () => {
    const graph = worldLitGraph({
      number: 5,
      sessionTitle: 'Lesson 5: The Thousand and One Nights',
      conceptTerms: ['frame narrative', 'Scheherazade storytelling'],
    });
    const providers = stubReadings([DIABETES_WORK, SCHEHERAZADE_WORK]);
    const attached = await attachOpenReadings(graph, { providers });
    expect(attached).toBe(1);
    expect(graph.resources).toHaveLength(1);
    expect(graph.resources[0].citation).toContain('Scheherazade');
    expect(graph.readingListDecisions || []).toHaveLength(0);
  });

  it('falls back to the HARDENED token gate when topic data is absent: generic-only overlap is rejected', async () => {
    const graph = worldLitGraph({
      number: 7,
      sessionTitle: 'Lesson 7: Translation and Cultural Mediation',
      conceptTerms: ['translation across cultures', 'cultural mediation'],
    });
    // The live leak passed the OLD gate via the strong concept token
    // "translation" alone.
    const oldScore = scoreReadingRelevance(KNOWLEDGE_TRANSLATION_WORK, {
      allTokens: new Set(['translation', 'cultural', 'mediation', 'culture']),
      strongConceptTokens: new Set(['translation', 'mediation', 'cultural']),
      phrases: ['cultural mediation'],
    });
    expect(oldScore.pass).toBe(true); // the pre-fix verdict
    expect(oldScore.specificHits).toBe(0);

    const providers = stubReadings([KNOWLEDGE_TRANSLATION_WORK]);
    const attached = await attachOpenReadings(graph, { providers });
    expect(attached).toBe(0);
    expect(graph.resources).toHaveLength(0);
    expect(graph.readingListDecisions[0].type).toBe('no-relevant-reading');
  });

  it('still attaches a no-topic-data paper with ≥2 distinct hits including a non-generic token', async () => {
    const graph = worldLitGraph({
      number: 7,
      sessionTitle: 'Lesson 7: Translation and Cultural Mediation',
      conceptTerms: ['translation across cultures', 'cultural mediation'],
    });
    const providers = stubReadings([MEDIATION_WORK]);
    const attached = await attachOpenReadings(graph, { providers });
    expect(attached).toBe(1);
    expect(graph.resources[0].citation).toContain('cultural mediator');
  });

  it('provider surfaces primary_topic/topics from the works payload and requests them in the select', async () => {
    const store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            display_name: 'Metamorphoses of Scheherazade in literature and film',
            authorships: [{ author: { display_name: 'Wen-chin Ouyang' } }],
            publication_year: 2003,
            open_access: { oa_url: 'https://example.org/scheherazade.pdf' },
            primary_topic: {
              display_name: 'World Literatures',
              field: { display_name: 'Arts and Humanities' },
              domain: { display_name: 'Social Sciences' },
            },
            topics: [
              {
                display_name: 'World Literatures',
                field: { display_name: 'Arts and Humanities' },
                domain: { display_name: 'Social Sciences' },
              },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const works = await searchScholarlyReadings('scheherazade frame narrative topic test');
    expect(fetchMock.mock.calls[0][0]).toContain('primary_topic,topics');
    expect(works[0].primaryTopic).toEqual({
      name: 'World Literatures',
      field: 'Arts and Humanities',
      domain: 'Social Sciences',
    });
    expect(works[0].topics).toHaveLength(1);
    expect(works[0].topics[0].field).toBe('Arts and Humanities');
  });
});

// ── (2) finalizer keeps canonical NAME cells ────────────────────────────────

describe('fix 2 — registry titles in "id — title" name cells never shorten', () => {
  const registryTitle = 'Diagnostic Quiz: course foundations';
  const blueprint = {
    lessons: [{ lessonNumber: 1, title: 'Lesson 1: Earth Systems', studentArtifact: registryTitle }],
    assessments: [{ registryId: 'A1.1', title: registryTitle, artifact: registryTitle, lessonNumbers: [1] }],
  };

  it('keeps the NAME cell verbatim on the 4th mention while prose and descriptions shorten', () => {
    const data = {
      syllabus: {
        overview:
          `Complete ${registryTitle} early in the week. ` +
          `Review ${registryTitle} with a partner. ` +
          `Revisit ${registryTitle} before Friday.`,
        courseRequirements: [
          {
            name: `A1.1 — ${registryTitle}`,
            weight: '2%',
            description: `${registryTitle}. Strong work: names the key ideas accurately.`,
          },
        ],
      },
    };
    finalizeCompiledDeliverableLanguage('syllabus', data, blueprint);

    // The live geology table shipped "A1.1 — the Week 1 quiz"; the NAME cell
    // now keeps the canonical registry title no matter the mention count.
    expect(data.syllabus.courseRequirements[0].name).toBe(`A1.1 — ${registryTitle}`);
    // In-prose shortening still works (3rd mention compresses)…
    expect(data.syllabus.overview).toContain(registryTitle);
    expect(data.syllabus.overview).toMatch(/the Week 1 quiz/);
    // …and the row DESCRIPTION may still shorten.
    expect(data.syllabus.courseRequirements[0].description).toMatch(/[Tt]he Week 1 quiz/);
    expect(data.syllabus.courseRequirements[0].description).not.toContain(registryTitle);
  });

  it('also protects bare title fields from artifact-short-ref rewrites', () => {
    const data = {
      rubrics: [
        {
          lessonNumber: 1,
          // Padding mentions exhaust the keep budget inside this scope.
          intro: `Use ${registryTitle}. Compare ${registryTitle}. Extend ${registryTitle}.`,
          title: `Rubric for ${registryTitle}`,
        },
      ],
    };
    finalizeCompiledDeliverableLanguage('rubrics', data, blueprint);
    expect(data.rubrics[0].title).toBe(`Rubric for ${registryTitle}`);
  });
});

// ── (3) evidence packet stays out of materials lead + concept slots ────────

describe('fix 3 — evidence packet never leads weekly materials and never binds a concept slot', () => {
  // Mirrors the live World Lit course: lessons 1-4 share course-wide
  // resources (→ minted packet); lesson 5's first reading IS the lesson
  // topic, the exact shape that produced "the Lesson 5 evidence packet" in
  // topic cells and success criteria.
  function worldLitCourseMap() {
    const shared = 'Course reader; Weekly reading-response guidelines';
    const baseTopics = [
      'Gilgamesh and Epic Memory',
      'Greek Tragedy and Fate',
      'The Aeneid and Empire',
      'Classical Chinese Poetry',
    ];
    const lessons = baseTopics.map((topic, index) => ({
      title: `Lesson ${index + 1}: ${topic}`,
      sections: [
        {
          topicSection: `${topic.toLowerCase()}; close reading`,
          learningObjectives: `Analyze ${topic.toLowerCase()} passages with textual evidence.\nEvaluate how form shapes meaning in ${topic.toLowerCase()}.`,
          weeklyAssessments: `Reading Response: ${topic.toLowerCase()}`,
          asyncActivities: `Read the assigned ${topic.toLowerCase()} selections.`,
          syncActivities: `Seminar: discuss ${topic.toLowerCase()} passages.`,
          supportingResources: shared,
        },
      ],
    }));
    lessons.push({
      title: 'Lesson 5: The Thousand and One Nights',
      sections: [
        {
          topicSection: 'frame narrative; storytelling as survival',
          learningObjectives:
            'Map the frame structure of The Thousand and One Nights.\nAnalyze suspense, delay, and narrative nesting.',
          weeklyAssessments: 'Reading Response: frame narrative and suspense',
          asyncActivities: 'Read: The Thousand and One Nights selections.',
          syncActivities: 'Diagram: frame and embedded tale structure.',
          supportingResources: 'The Thousand and One Nights; Narrative structure handout',
        },
      ],
    });
    return { courseName: 'World Literature', semester: 'Fall 2026', lessons };
  }

  const blueprint = buildCourseBlueprint(worldLitCourseMap());
  const compiled = compileBlueprintDeliverable('syllabus', blueprint); // finalizer ON — the live path

  it('never elects the lesson topic as the evidence packet', () => {
    const lessonFive = blueprint.lessons[4];
    expect(lessonFive.throughlineCase.evidencePacket.toLowerCase()).not.toBe('the thousand and one nights');
    // The work survives as a real reading.
    expect(lessonFive.readings.join('; ')).toContain('The Thousand and One Nights');
  });

  it('keeps the packet cue OUT of the lead material position in every blueprint readings list', () => {
    for (const lesson of blueprint.lessons) {
      const packet = lesson.throughlineCase?.evidencePacket || '';
      const minted = /\bfor Lesson \d+\s*:|:\s*Lesson \d+\b/i.test(packet);
      if (minted) {
        expect(lesson.readings[0], `L${lesson.lessonNumber} leads with the minted packet`).not.toBe(packet);
      }
    }
  });

  it('weekly syllabus materials never lead with (or even list) a minted packet descriptor', () => {
    for (const row of compiled.syllabus.weeklySchedule) {
      const lead = row.readings.split(';')[0] || '';
      expect(lead, `${row.week} leads with the packet: "${row.readings}"`).not.toMatch(
        /evidence packet|for Lesson \d+\s*:/i,
      );
      expect(row.readings).not.toMatch(/Instructor-provided course materials for Lesson \d+/i);
    }
    // Week 5 keeps its real materials, led by the actual text under study.
    const weekFive = compiled.syllabus.weeklySchedule.find((row) => row.week === 'Week 5');
    expect(weekFive.readings).toContain('The Thousand and One Nights');
  });

  it('no success criterion or topic cell contains "evidence packet"; Week 5 keeps the work title', () => {
    const criteriaSurfaces = [
      ...blueprint.lessons.flatMap((lesson) => lesson.successCriteria),
      ...compiled.syllabus.courseAtAGlance.map((row) => row.successCriteria),
      ...compiled.syllabus.weeklySchedule.map((row) => row.assignments),
    ].join(' ');
    expect(criteriaSurfaces).not.toMatch(/evidence packet/i);

    const topicCells = [
      ...compiled.syllabus.courseAtAGlance.map((row) => row.topic),
      ...compiled.syllabus.weeklySchedule.map((row) => row.topic),
    ];
    for (const topic of topicCells) expect(topic).not.toMatch(/evidence packet/i);
    expect(topicCells).toContain('The Thousand and One Nights');
  });
});

// ── (4) romanization for language courses ──────────────────────────────────

describe('fix 4 — language courses pair non-Latin terms with romanization', () => {
  function mandarinCourseMap() {
    return {
      courseName: 'Elementary Mandarin Chinese I',
      lessons: [
        {
          title: 'Lesson 1: Greetings and Self-Introductions',
          sections: [
            {
              topicSection: 'greetings; polite forms',
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

  it('adds the rm instruction to the kernel prompt for language courses only', () => {
    const mandarinPrompt = buildLessonKernelPrompt(mandarinCourseMap(), [0]);
    expect(mandarinPrompt.systemPrompt).toContain('romanization');
    expect(mandarinPrompt.systemPrompt).toContain('rm =');

    const geologyPrompt = buildLessonKernelPrompt(
      {
        courseName: 'Physical Geology',
        lessons: [
          {
            title: 'Lesson 1: Minerals',
            sections: [{ topicSection: 'mineral identification', learningObjectives: 'Analyze mineral properties.' }],
          },
        ],
      },
      [0],
    );
    expect(geologyPrompt.systemPrompt).not.toContain('romanization');
  });

  it('adds the same instruction to the lesson-content enrichment prompt, gated identically', () => {
    const mandarinPrompt = buildLessonContentEnrichmentPrompt(mandarinCourseMap(), [0]);
    expect(mandarinPrompt.userPrompt).toContain('romanization');
    const geologyPrompt = buildLessonContentEnrichmentPrompt(
      {
        courseName: 'Physical Geology',
        lessons: [
          {
            title: 'Lesson 1: Minerals',
            sections: [{ topicSection: 'mineral identification', learningObjectives: 'Analyze mineral properties.' }],
          },
        ],
      },
      [0],
    );
    expect(geologyPrompt.userPrompt).not.toContain('romanization');
  });

  it('parses rm off the kernel keyTerm and carries it through the projection', () => {
    const prompt = buildLessonKernelPrompt(mandarinCourseMap(), [0]);
    const response = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-1',
          facts: [
            'Mandarin greetings change with time of day and the relationship between speakers.',
            'The phrase 请给我 is a polite request used when asking for an item.',
          ],
          keyTerms: [
            {
              tr: '请给我',
              df: 'A polite request meaning please give me, used when asking for an object or for help.',
              eg: '请给我水。',
              mi: 'Students use it as a question phrase instead of a request.',
              cx: 'It introduces a request for an item, not a yes-no question.',
              rm: 'qǐng gěi wǒ',
            },
          ],
        },
      ],
    });
    const parsed = parseLessonKernelResponse(response, { prompt });
    expect(parsed).toBeTruthy();
    const term = parsed.lessons['lesson-1'].keyTerms[0];
    expect(term.term).toBe('请给我');
    expect(term.romanization).toBe('qǐng gěi wǒ');
  });

  it('renders "你好 (nǐ hǎo)" in the study-guide key-term table and the slide key-term row', () => {
    const blueprint = buildCourseBlueprint(mandarinCourseMap(), {
      enrichment: {
        source: 'test-enrichment',
        lessonContent: {
          'lesson-1': {
            quizItems: [],
            keyTerms: [
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
            ],
          },
        },
      },
    });
    const guides = compileBlueprintDeliverable('studyGuides', blueprint, { skipLanguageFinalizer: true });
    expect(guides.studyGuides[0].keyTerms[0].term).toBe('你好 (nǐ hǎo)');

    const decks = compileBlueprintDeliverable('slideDecks', blueprint, { skipLanguageFinalizer: true });
    const tableSlide = decks.decks[0].slides.find((slide) => Array.isArray(slide.visual?.rows));
    expect(tableSlide).toBeTruthy();
    expect(tableSlide.visual.rows[0][0]).toBe('你好 (nǐ hǎo)');
  });

  it('leaves Latin-script terms untouched (no rm → no parenthetical)', () => {
    const blueprint = buildCourseBlueprint(
      {
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
      },
      {
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
      },
    );
    const guides = compileBlueprintDeliverable('studyGuides', blueprint, { skipLanguageFinalizer: true });
    expect(guides.studyGuides[0].keyTerms[0].term).toBe('Cleavage');
  });
});

// ── (5) backtick seam fix ───────────────────────────────────────────────────

describe('fix 5 — backticked short operators render quoted, longer snippets render bare', () => {
  it("renders `and`/`or` as 'and'/'or' (the live CS deck shipped \"with and or\")", () => {
    const data = {
      decks: [
        {
          lessonTitle: 'Lesson 3: Conditionals and Boolean Logic',
          slides: [
            {
              title: 'Compound conditions',
              type: 'content',
              bullets: ['Key Takeaway: Compound conditions can combine tests with `and` or `or`.'],
              notes: 'Walk through one combined condition.',
            },
          ],
        },
      ],
    };
    finalizeCompiledDeliverableLanguage('slideDecks', data, {});
    const bullet = data.decks[0].slides[0].bullets[0];
    expect(bullet).toContain("with 'and' or 'or'");
    expect(bullet).not.toContain('`');
  });

  it('strips longer and symbol-only code spans bare, and leaves a lone backtick alone', () => {
    const data = {
      syllabus: {
        snippet: "Use `ages['Ava']` to read the record, compare with `==`, and loop with `not` done.",
        lone: 'The grave accent ` sits left of the 1 key.',
      },
    };
    finalizeCompiledDeliverableLanguage('syllabus', data, {});
    expect(data.syllabus.snippet).toContain("ages['Ava']");
    expect(data.syllabus.snippet).toContain('compare with ==');
    expect(data.syllabus.snippet).toContain("loop with 'not' done");
    expect(data.syllabus.snippet).not.toContain('`');
    expect(data.syllabus.lone).toContain('`');
  });
});

// ── (6 + 7) Round-1 LIVE bugs: decapitated registry exams + meta review quizzes

// Geology-like 8-lesson course whose Lesson 8 is the live run's review/exam
// week: a weekly quiz atom plus the registry midterm.
const ROUND2_TOPICS = [
  ['Minerals', 'mineral identification'],
  ['Igneous Rocks', 'igneous textures'],
  ['Sedimentary Rocks', 'sedimentary environments'],
  ['Metamorphic Rocks', 'metamorphic grade'],
  ['Weathering and Erosion', 'weathering rates'],
  ['Streams and Groundwater', 'stream discharge'],
  ['Geologic Time', 'relative dating'],
];

function reviewWeekCourseMap() {
  const lessons = ROUND2_TOPICS.map(([title, concept], index) => ({
    title: `Lesson ${index + 1}: ${title}`,
    sections: [
      {
        topicSection: `${index + 1}.1: ${title}`,
        learningGoals: `1. Build field-ready understanding of ${concept}.`,
        learningObjectives: `Analyze ${concept} using specimen evidence.\nEvaluate how ${concept} changes a field decision.`,
        weeklyAssessments: `Quiz: ${concept} problems`,
        asyncActivities: `Read the assigned chapter on ${title.toLowerCase()}.`,
        syncActivities: `Workshop: ${concept} case analysis.`,
        supportingResources: `OpenStax geology chapter on ${title.toLowerCase()}`,
      },
    ],
  }));
  lessons.push({
    title: 'Lesson 8: Midterm Review and Exam',
    sections: [
      {
        topicSection: '8.1: Midterm review',
        learningGoals: '1. Consolidate minerals through geologic time before the midterm.',
        learningObjectives:
          'Demonstrate understanding of minerals through geologic time.\nJustify answers with observable evidence.',
        weeklyAssessments: 'Quiz: review readiness\nMidterm Exam: minerals through geologic time',
        asyncActivities: 'Re-work one practice set per covered lesson.',
        syncActivities: 'Review stations: covered concepts.',
        supportingResources: 'Review guide',
      },
    ],
  });
  return { courseName: 'Physical Geology', semester: 'Fall 2026', lessons };
}

function compileReviewWeekQuizBank() {
  const graph = deriveCourseGraphFromCourseMap(reviewWeekCourseMap());
  const blueprint = buildBlueprintFromGraph(graph);
  const compiled = compileBlueprintDeliverables(blueprint, ['quizBank']);
  // The app's course-map STATE is the display render — exactly what the
  // finish-pass repair receives live.
  const displayMap = renderCourseMapFromGraph(graph, { assessmentReferences: true });
  return { graph, blueprint, compiled, displayMap };
}

describe('fix 6 — registry exams survive the finish-pass repair and export with their identity', () => {
  // The Round-1 live divergence: tests/v0141-phase3-registry.test.js proved
  // the COMPILER emits the exam, but the live finish pass then ran
  // repairWorkspaceReadiness → normalizeQuizAssessmentAlignment, whose
  // inferQuizLessonIndex read the exam's covered-lesson tags ("Lesson 1: …")
  // and retitled the exam entry to lesson 1's title — the exported geology
  // L8 docx contained all 16 exam items under the heading "Lesson 1:
  // Introduction to Physical Geology and Earth Systems" and zero hits for
  // "Midterm Exam".
  const { compiled, displayMap } = compileReviewWeekQuizBank();

  function repairedQuizBank() {
    const repair = repairWorkspaceReadiness({
      courseMap: displayMap,
      deliverables: { quizBank: { status: 'done', data: compiled.quizBank } },
      selectedFeatures: ['quizBank'],
    });
    return repair.deliverables?.quizBank?.data || compiled.quizBank;
  }

  it('the finish-pass repair never retitles or re-homes the exam entry', () => {
    const repaired = repairedQuizBank();
    const exam = repaired.quizzes.find((quiz) => quiz.kind === 'exam');
    expect(exam).toBeTruthy();
    expect(exam.lessonTitle).toBe('Midterm Exam — minerals through geologic time');
    expect(exam.lessonNumber).toBe(8);
    // The live decapitation shape — lesson 1's title — never again.
    expect(exam.lessonTitle).not.toMatch(/^Lesson 1:/);
    // Weekly entries still get their normal repair treatment.
    const weekly = repaired.quizzes.filter((quiz) => quiz.kind !== 'exam');
    expect(weekly).toHaveLength(8);
  });

  it('the exam ships INSIDE the per-lesson docx slice with its own heading, scope, and answer key', async () => {
    const repaired = repairedQuizBank();
    // The zip exporter's per-lesson slice for Lesson 8 (index 7).
    const scoped = scopeDeliverableDataToLessons('quizBank', repaired, [7]);
    expect(scoped.quizzes).toHaveLength(2);
    expect(scoped.quizzes.map((quiz) => quiz.kind === 'exam')).toEqual([false, true]);

    const blob = await buildDeliverableDocxBlob('quizBank', scoped, 'Physical Geology');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml').async('string');
    const text = xml
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ');
    // The exam exists AS AN EXAM in the rendered document — the exact check
    // the live geology L8 docx failed (grep "Midterm Exam" = 0 hits).
    expect(text).toContain('Midterm Exam — minerals through geologic time');
    expect(text).toContain('Answer Key — Midterm Exam — minerals through geologic time');
    expect(text).toContain('Covers Lessons 1–7');
    // The weekly quiz is still there too.
    expect(text).toContain('Lesson 8: Midterm Review and Exam');
  });
});

describe('fix 7 — review-week weekly quizzes draw from PRIOR lessons, not the review-lesson title', () => {
  const { compiled } = compileReviewWeekQuizBank();
  const quizzes = compiled.quizBank.quizzes;
  const weekly = quizzes.filter((quiz) => quiz.kind !== 'exam');
  const reviewQuiz = weekly[7];
  const exam = quizzes.find((quiz) => quiz.kind === 'exam');

  it('keeps the standard 6-item weekly shape under the review lesson identity', () => {
    expect(reviewQuiz.lessonTitle).toBe('Lesson 8: Midterm Review and Exam');
    expect(reviewQuiz.questions).toHaveLength(6);
    const types = reviewQuiz.questions.map((question) => question.type);
    expect(types.filter((type) => type === 'multiple_choice')).toHaveLength(4);
    expect(types).toContain('short_answer');
    expect(types).toContain('essay');
    // Ids live in the review lesson's namespace — no bank-index collision
    // with the source lessons' own quizzes.
    for (const question of reviewQuiz.questions) {
      expect(question.id).toMatch(/^lesson-8-q\d+$/);
    }
    const allIds = quizzes.flatMap((quiz) => quiz.questions.map((question) => question.id));
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('items reference covered-lesson content and never the live meta frame', () => {
    const paper = JSON.stringify(reviewQuiz.questions);
    // The live failure shape: every stem was a topic-name substitution on the
    // review lesson ("Which statement best explains why Midterm Review and
    // Exam matters for the Week 8 quiz?").
    expect(paper).not.toMatch(/why Midterm Review and Exam matters/i);
    expect(paper).not.toMatch(/applies Midterm Review and Exam from this lesson/i);
    // Items span the covered range: several covered concepts appear.
    const conceptHits = ROUND2_TOPICS.filter(([, concept]) => paper.includes(concept)).length;
    expect(conceptHits, `covered concepts on the review paper: ${conceptHits}`).toBeGreaterThanOrEqual(3);
    // Every multiple-choice stem names covered-lesson content.
    const foci = ROUND2_TOPICS.map(([title]) => title);
    for (const question of reviewQuiz.questions.filter((entry) => entry.type === 'multiple_choice')) {
      const named =
        foci.some((focus) => question.question.includes(focus)) ||
        ROUND2_TOPICS.some(([, concept]) => question.question.includes(concept));
      expect(named, `review MC stem names no covered content: ${question.question}`).toBe(true);
    }
  });

  it('duplicates no stem from the covered lessons’ own quizzes or the compiled exam', () => {
    const priorStems = new Set(
      weekly.slice(0, 7).flatMap((quiz) => quiz.questions.map((question) => question.question)),
    );
    const examStems = new Set(exam.questions.map((question) => question.question));
    for (const question of reviewQuiz.questions) {
      expect(priorStems.has(question.question), `duplicates a weekly stem: ${question.question}`).toBe(false);
      expect(examStems.has(question.question), `duplicates an exam stem: ${question.question}`).toBe(false);
    }
  });

  it('falls back to the standard frames when no prior teaching lesson exists', () => {
    const soloMap = {
      courseName: 'Capstone Review Seminar',
      semester: 'Fall 2026',
      lessons: [
        {
          title: 'Lesson 1: Final Review Workshop',
          sections: [
            {
              topicSection: '1.1: Review workshop',
              learningGoals: '1. Consolidate course material.',
              learningObjectives: 'Demonstrate understanding of the course material.',
              weeklyAssessments: 'Quiz: readiness check',
              asyncActivities: 'Re-work prior practice sets.',
              syncActivities: 'Review stations.',
              supportingResources: 'Review guide',
            },
          ],
        },
      ],
    };
    const graph = deriveCourseGraphFromCourseMap(soloMap);
    const blueprint = buildBlueprintFromGraph(graph);
    const bank = compileBlueprintDeliverables(blueprint, ['quizBank']).quizBank;
    const quiz = bank.quizzes[0];
    expect(quiz.questions.length).toBeGreaterThanOrEqual(5);
    // With nothing earlier to draw from, the standard frames stand.
    expect(JSON.stringify(quiz.questions)).toContain('Final Review Workshop');
  });
});

// ── (8 + 9) Crucible Round-2 LIVE bugs: all-D review keys + regen nuking ────
// the compiled bank (verification-output/crucible/round-2026-06-11T16-11-11-692Z/cs-python).

// The live CS Python configuration: 15 lessons, review week at Lesson 11,
// and the exact Lesson 11 map atoms from the Round-2 run (including the
// "Practice Set: midterm preparation" atom the registry misclassified as a
// second exam).
const CS_TOPICS = [
  ['Orientation and Python Environment Setup', 'the Python interpreter'],
  ['Variables, Expressions, and Types', 'variable binding'],
  ['Conditionals and Boolean Logic', 'boolean evaluation'],
  ['While Loops', 'loop invariants'],
  ['For Loops and Range', 'iteration patterns'],
  ['Functions and Scope', 'function scope'],
  ['Lists', 'list operations'],
  ['Strings and Text Processing', 'string slicing'],
  ['Dictionaries and Nested Data', 'key lookup'],
  ['File Input and Output', 'file handles'],
];

function csReviewCourseMap() {
  const lesson = (index, title, concept, weeklyAssessments) => ({
    title: `Lesson ${index}: ${title}`,
    sections: [
      {
        topicSection: `${index}.1: ${title}`,
        learningGoals: `1. Build working command of ${concept}.`,
        learningObjectives: `Apply ${concept} in a short program.\nEvaluate how ${concept} changes a design decision.`,
        weeklyAssessments,
        asyncActivities: `Read the assigned chapter on ${title.toLowerCase()}.`,
        syncActivities: `Lab: ${concept} practice.`,
        supportingResources: `Open textbook chapter on ${title.toLowerCase()}`,
      },
    ],
  });
  const lessons = CS_TOPICS.map(([title, concept], index) =>
    lesson(index + 1, title, concept, `Quiz: ${concept} problems`),
  );
  lessons.push(
    lesson(
      11,
      'Midterm Review and Midterm Exam',
      'cumulative concepts',
      'Review Quiz: cumulative concepts\nPractice Set: midterm preparation\nMidterm Exam: cumulative assessment\nPost-Exam Reflection: strengths and gaps',
    ),
    lesson(12, 'Recursion', 'recursive cases', 'Quiz: recursion problems'),
    lesson(13, 'Classes and Objects', 'object state', 'Quiz: classes problems'),
    lesson(14, 'Debugging and Testing', 'test cases', 'Quiz: debugging problems'),
    lesson(
      15,
      'Introduction to Algorithms and Final Project Integration',
      'algorithmic thinking',
      'Quiz: algorithms problems\nFinal Project: integrated program',
    ),
  );
  return { courseName: 'Introduction to Computer Science with Python', semester: 'Fall 2026', lessons };
}

function compileCsReviewBank() {
  const courseMap = csReviewCourseMap();
  const graph = deriveCourseGraphFromCourseMap(courseMap);
  const blueprint = buildBlueprintFromGraph(graph);
  const compiled = compileBlueprintDeliverables(blueprint, ['quizBank', 'assignments']);
  return { courseMap, graph, blueprint, compiled };
}

describe('fix 8 — the live CS L11 configuration yields varied review-quiz answer keys', () => {
  const { graph, compiled } = compileCsReviewBank();
  const quizzes = compiled.quizBank.quizzes;

  it('registry: the practice set is a graded artifact, the midterm is the only L11 exam (live A11.2/A11.3)', () => {
    const lessonEleven = graph.assessments.filter((assessment) => assessment.dueSession === 11);
    const byTitle = new Map(lessonEleven.map((assessment) => [assessment.title, assessment]));
    expect(byTitle.get('Practice Set: midterm preparation').kind).toBe('graded-artifact');
    expect(byTitle.get('Midterm Exam: cumulative assessment').kind).toBe('exam');
    expect(byTitle.get('Review Quiz: cumulative concepts').kind).toBe('graded-artifact');
    // Exactly ONE exam compiles for lesson 11 — the live run shipped two.
    const exams = quizzes.filter((quiz) => quiz.kind === 'exam');
    expect(exams).toHaveLength(1);
    expect(exams[0].lessonTitle).toMatch(/^Midterm Exam/);
    expect(exams[0].lessonNumber).toBe(11);
    // The practice set becomes an assignment brief instead of an exam paper.
    expect(compiled.assignments.assignments.some((brief) => /midterm preparation/i.test(brief.title))).toBe(true);
  });

  it('the Lesson 11 weekly review quiz never keys nearly all MC answers to one letter (live: all D)', () => {
    const reviewQuiz = quizzes[10];
    expect(reviewQuiz.lessonTitle).toBe('Lesson 11: Midterm Review and Midterm Exam');
    const letters = reviewQuiz.questions
      .filter((question) => question.type === 'multiple_choice')
      .map((question) => question.answer);
    expect(letters).toHaveLength(4);
    const counts = {};
    for (const letter of letters) counts[letter] = (counts[letter] || 0) + 1;
    expect(Math.max(...Object.values(counts)), `answer letters: ${letters.join('')}`).toBeLessThanOrEqual(2);
    expect(new Set(letters).size).toBeGreaterThanOrEqual(3);
  });

  it('every review-style weekly quiz in the bank keeps the spread invariant and a consistent key', () => {
    for (const quiz of quizzes.filter((entry) => entry.kind !== 'exam')) {
      const mc = quiz.questions.filter((question) => question.type === 'multiple_choice');
      if (mc.length < 3) continue;
      const counts = {};
      for (const question of mc) counts[question.answer] = (counts[question.answer] || 0) + 1;
      expect(
        Math.max(...Object.values(counts)),
        `${quiz.lessonTitle} keys: ${mc.map((question) => question.answer).join('')}`,
      ).toBeLessThan(mc.length);
      // The keyed option exists and the explanation cites the same letter.
      for (const question of mc) {
        expect(question.options.some((option) => option.startsWith(`${question.answer}. `))).toBe(true);
        expect(question.options).toHaveLength(4);
        expect(new Set(question.options.map((option) => option.slice(0, 1))).size).toBe(4);
        expect(question.explanation.startsWith(question.answer)).toBe(true);
      }
    }
  });

  it('geology-style review weeks (the Round-2 pass case) stay varied too', () => {
    const { compiled: geoCompiled } = compileReviewWeekQuizBank();
    const geoWeekly = geoCompiled.quizBank.quizzes.filter((quiz) => quiz.kind !== 'exam')[7];
    const letters = geoWeekly.questions
      .filter((question) => question.type === 'multiple_choice')
      .map((question) => question.answer);
    expect(new Set(letters).size).toBeGreaterThanOrEqual(3);
  });
});

describe('fix 9 — a lesson regen merges into the bank without destroying exams or accepting stubs', () => {
  const { courseMap, compiled } = compileCsReviewBank();
  const bank = compiled.quizBank.quizzes;
  const weeklyEleven = bank[10];
  const examEntry = bank.find((quiz) => quiz.kind === 'exam');
  // The live registry had TWO L11 exam-kind entries (A11.2 + A11.3); keep that
  // shape for the merge-level regression even though FIX 3 now prevents it.
  const examB = { ...examEntry, assessmentId: 'A11.2', lessonTitle: 'Practice Exam — cumulative assessment' };

  const validRegen = {
    ...weeklyEleven,
    regenerated: true,
    questions: weeklyEleven.questions.map((question) => ({ ...question })),
  };
  const stubRegen = { lessonTitle: 'Lesson 11: Midterm Review and Midterm Exam', questions: [] };

  it('replaces ONLY the weekly entry for the lesson — both exam entries survive', () => {
    const existing = [weeklyEleven, examEntry, examB];
    const merged = mergeRegeneratedLessonItems('quizBank', existing, [validRegen], 10, courseMap);
    expect(merged).toHaveLength(3);
    expect(merged[0].regenerated).toBe(true);
    expect(merged[0].lessonNumber).toBe(11);
    expect(merged[1]).toBe(examEntry);
    expect(merged[2]).toBe(examB);
  });

  it('replaces the weekly entry inside the FULL 17-entry live bank shape without touching anything else', () => {
    const existing = [...bank, examB];
    const merged = mergeRegeneratedLessonItems('quizBank', existing, [validRegen], 10, courseMap);
    expect(merged).toHaveLength(existing.length);
    expect(merged[10].regenerated).toBe(true);
    expect(merged.filter((quiz) => quiz.kind === 'exam')).toHaveLength(2);
    for (let i = 0; i < existing.length; i += 1) {
      if (i !== 10) expect(merged[i]).toBe(existing[i]);
    }
  });

  it('rejects an unrenderable regen entry (the live empty-docx stub) and keeps the original', () => {
    const existing = [weeklyEleven, examEntry, examB];
    const reasons = [];
    const merged = mergeRegeneratedLessonItems('quizBank', existing, [stubRegen], 10, courseMap, {
      onReject: (reason) => reasons.push(reason),
    });
    expect(merged).toEqual(existing);
    expect(merged[0]).toBe(weeklyEleven);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/not renderable/i);
  });

  it('rejects a regen result that contains only exam-shaped entries', () => {
    const existing = [weeklyEleven, examEntry];
    const reasons = [];
    const merged = mergeRegeneratedLessonItems('quizBank', existing, [{ ...examEntry }], 10, courseMap, {
      onReject: (reason) => reasons.push(reason),
    });
    expect(merged).toEqual(existing);
    expect(reasons[0]).toMatch(/no weekly/i);
  });

  it('validation: a renderable entry needs >=4 questions with keyed multiple choice', () => {
    expect(isRenderableQuizEntry(weeklyEleven)).toBe(true);
    expect(isRenderableQuizEntry(stubRegen)).toBe(false);
    expect(isRenderableQuizEntry(null)).toBe(false);
    expect(
      isRenderableQuizEntry({
        questions: [
          { type: 'multiple_choice', options: ['A. x', 'B. y', 'C. z', 'D. w'], answer: '' },
          { type: 'short_answer', answer: 'model' },
          { type: 'essay', rubricHints: 'hints' },
          { type: 'multiple_choice', options: ['A. x', 'B. y', 'C. z', 'D. w'], answer: 'B' },
        ],
      }),
    ).toBe(false);
    expect(
      isRenderableQuizEntry({
        questions: [
          { type: 'multiple_choice', options: ['A. x', 'B. y', 'C. z', 'D. w'], answer: 'C' },
          { type: 'multiple_choice', options: ['A. x', 'B. y', 'C. z', 'D. w'], answer: 'B' },
          { type: 'short_answer', answer: 'model' },
          { type: 'essay', rubricHints: 'hints' },
        ],
      }),
    ).toBe(true);
  });

  it('refuses a single-lesson result as FULL deliverable data for a multi-lesson course', () => {
    expect(isUnsafeFullReplacement('quizBank', { quizzes: [validRegen] }, courseMap)).toBe(true);
    expect(isUnsafeFullReplacement('quizBank', { quizzes: bank }, courseMap)).toBe(false);
    expect(
      isUnsafeFullReplacement('quizBank', { quizzes: [validRegen] }, { lessons: [{ title: 'Lesson 1: Only' }] }),
    ).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Round-3 polish — the final A+ wave over the round-2026-06-11T16-55-45-448Z
// live artifacts. Four P2-class residuals:
//   R3.1 pinyin coverage 8/15: language courses now spend the SAME 2-call
//        kernel recovery budget on lessons whose parsed CJK keyTerms came
//        back without rm (missing lessons keep priority).
//   R3.3 study guides chanted the lesson title (world-lit L4: 5 mentions in
//        two paragraphs) — keep-2-per-document compression over PROSE only.
//   R3.4 "X: X" echo chains: the slide practice-label prepend ("Practice:
//        Creating and Accessing Lists: Lists adapts…") and the prerequisite
//        primer citation ("Close reading: Close reading interprets…").
// (R3.2, the grader dev-noise allowlist, is proven in
// tests/crucible-grader-proof.test.js.)
// ════════════════════════════════════════════════════════════════════════════

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

describe('round-3 polish 1 — romanization recovery shares the kernel recovery budget', () => {
  function mandarinFiveLessonMap() {
    const titles = ['Greetings', 'Family', 'Classroom Phrases', 'Food', 'Shopping'];
    return {
      courseName: 'Elementary Mandarin Chinese I',
      lessons: titles.map((topic, index) => ({
        title: `Lesson ${index + 1}: ${topic}`,
        sections: [
          {
            topicSection: `${topic.toLowerCase()}; tones`,
            learningObjectives: `Use ${topic.toLowerCase()} vocabulary with correct tones.`,
            weeklyAssessments: `Oral drill: ${topic.toLowerCase()} exchange`,
            asyncActivities: `Listen to the ${topic.toLowerCase()} audio set.`,
            syncActivities: `Pair drill: ${topic.toLowerCase()}.`,
            supportingResources: `${topic} audio packet`,
          },
        ],
      })),
    };
  }

  it('detects CJK terms with no usable rm; Latin payloads never trigger', () => {
    expect(
      listLessonRomanizationGaps({
        keyTerms: [
          { term: '请坐', definition: 'Please sit.' },
          { term: '再说一遍', definition: 'Say it again.', romanization: '' },
          { term: '你好', definition: 'Hello.', romanization: 'nǐ hǎo' },
        ],
      }),
    ).toEqual(['请坐', '再说一遍']);
    // rm that still carries the original script is unusable → still a gap.
    expect(listLessonRomanizationGaps({ keyTerms: [{ term: '请坐', romanization: '请坐 qing zuo' }] })).toEqual([
      '请坐',
    ]);
    // Latin terms (the non-language-course payload shape) never report gaps.
    expect(
      listLessonRomanizationGaps({ keyTerms: [{ term: 'Cleavage', definition: 'Breaks along weak planes.' }] }),
    ).toEqual([]);
    expect(listLessonRomanizationGaps(null)).toEqual([]);
    // And the course-level gate is closed for non-language courses.
    expect(
      courseUsesNonLatinScript({ courseName: 'Physical Geology', lessons: [{ title: 'Lesson 1: Minerals' }] }),
    ).toBe(false);
  });

  it('the focused retry prompt names the exact terms needing rm, per lesson', () => {
    const prompt = buildLessonKernelPrompt(mandarinFiveLessonMap(), [2, 4], {
      includeCourseLevel: false,
      romanizationFocus: { 'lesson-3': ['请坐', '再说一遍'], 'lesson-5': ['多少钱'] },
    });
    expect(prompt.userPrompt).toContain(
      'Romanization recovery — these lessons returned non-Latin keyTerms without rm:',
    );
    expect(prompt.userPrompt).toContain(
      '- lesson-3: return the same lesson with rm (tone-marked romanization) added for: 请坐, 再说一遍',
    );
    expect(prompt.userPrompt).toContain(
      '- lesson-5: return the same lesson with rm (tone-marked romanization) added for: 多少钱',
    );
    // The language-course rm instruction still rides in the system prompt.
    expect(prompt.systemPrompt).toContain('rm =');
    // A normal recovery prompt (no focus option) carries no recovery section.
    const plain = buildLessonKernelPrompt(mandarinFiveLessonMap(), [2, 4], { includeCourseLevel: false });
    expect(plain.userPrompt).not.toContain('Romanization recovery');
  });

  it('merge adopts rm for matching terms and never loses original content', () => {
    const original = {
      quizItems: [{ question: 'Which phrase asks the price?' }],
      keyTerms: [
        { term: '请坐', definition: 'Please sit.', example: '请坐！' },
        { term: '再说一遍', definition: 'Say it again.' },
        { term: '你好', definition: 'Hello.', romanization: 'nǐ hǎo' },
      ],
      slideContent: [{ heading: 'keep me' }],
      kernel: { facts: ['Tones change meaning.'], scenario: null },
    };
    const retry = {
      quizItems: [],
      keyTerms: [
        { term: '请坐', definition: 'A DIFFERENT definition that must not win.', romanization: 'qǐng zuò' },
        { term: '再说一遍', romanization: 'zài shuō yī biàn' },
        {
          term: '新词',
          definition: 'A new term that must NOT be adopted — the original has 3.',
          romanization: 'xīn cí',
        },
      ],
    };
    const merged = mergeRomanizationRecovery(original, retry);
    // The original payload wins everywhere except rm.
    expect(merged.quizItems).toEqual(original.quizItems);
    expect(merged.slideContent).toEqual(original.slideContent);
    expect(merged.kernel).toEqual(original.kernel);
    expect(merged.keyTerms.map((term) => term.term)).toEqual(['请坐', '再说一遍', '你好']);
    expect(merged.keyTerms[0].definition).toBe('Please sit.');
    expect(merged.keyTerms[0].romanization).toBe('qǐng zuò');
    expect(merged.keyTerms[1].romanization).toBe('zài shuō yī biàn');
    expect(merged.keyTerms[2].romanization).toBe('nǐ hǎo');
    // The gap list is now clear — the recovery loop's exit condition.
    expect(listLessonRomanizationGaps(merged)).toEqual([]);
  });

  it('adopts NEW terms only when the original parsed thin (< 3 keyTerms)', () => {
    const thin = { keyTerms: [{ term: '请坐', definition: 'Please sit.' }] };
    const retry = {
      keyTerms: [
        { term: '请坐', romanization: 'qǐng zuò' },
        { term: '谢谢', definition: 'Thank you.', romanization: 'xièxie' },
      ],
    };
    expect(mergeRomanizationRecovery(thin, retry).keyTerms.map((term) => term.term)).toEqual(['请坐', '谢谢']);
    // A missing lesson keeps the plain adopt path; a useless retry changes nothing.
    expect(mergeRomanizationRecovery(null, retry)).toBe(retry);
    const untouched = { keyTerms: [{ term: '请坐', definition: 'Please sit.' }] };
    expect(mergeRomanizationRecovery(untouched, { keyTerms: [] })).toBe(untouched);
  });

  it('the hook wires the recovery into the SAME 2-call budget, missing lessons first', () => {
    // The recovery loop lives inside the useDeliverables hook (not importable
    // without a React harness) — this contract pins the wiring: the gap scan
    // is language-gated, the shared cap stays at 2 calls, romanization
    // lessons only fill batch slots missing lessons leave open, and returns
    // merge instead of overwriting.
    const source = fs.readFileSync(path.join(TEST_DIR, '../src/hooks/useDeliverables.js'), 'utf8');
    expect(source).toContain('const languageCourse = courseUsesNonLatinScript(blueprintCourseMap);');
    expect(source).toMatch(/listRomanizationGapIndices = \(\) =>\s*\n\s*languageCourse\s*\n?\s*\?/);
    expect(source).toContain('enrichmentRecoveryCalls < 2 &&');
    expect(source).toContain('(listMissingLessonIndices().length > 0 || listRomanizationGapIndices().length > 0)');
    expect(source).toMatch(
      /listRomanizationGapIndices\(\)\.slice\(\s*0,\s*Math\.max\(0,\s*chunkSize - missingChunk\.length\),?\s*\)/,
    );
    expect(source).toContain("'Enrich lesson kernels (romanization recovery)'");
    expect(source).toContain('mergeRomanizationRecovery(original, payload)');
  });
});

describe('round-3 polish 3 — study guides stop chanting the lesson title', () => {
  const TITLE = 'Lesson 4: Tang Poetry and Lyrical Precision';
  const TOPIC = 'Tang Poetry and Lyrical Precision';

  // The live world-lit L4 study guide shape (round-2026-06-11T16-55-45-448Z):
  // five full-title mentions in the first two paragraphs, including the
  // "Lesson 4: X focuses on X, …" echo.
  function l4Guide() {
    return {
      studyGuides: [
        {
          lessonTitle: TITLE,
          examScope: `Use this guide to prepare for Week 4 checks on ${TOPIC}, Li Bai and poetic immediacy, Du Fu and historical witness and later assessments.`,
          summary: `${TITLE} focuses on ${TOPIC}, Li Bai and poetic immediacy, Du Fu and historical witness. Students should connect those ideas to the weekly activity pattern, use textual evidence about ${TOPIC}, and explain the interpretive judgment for ${TOPIC}.`,
          keyTerms: [
            {
              term: 'imagery',
              definition: `Language that creates sensory impressions and organizes meaning in ${TOPIC}.`,
              example: 'Moonlight, river, and mountain images in a short lyric.',
            },
          ],
          conceptConnections: [
            `${TITLE} connects to the assessment artifact: Reading Response and Close-Reading Check.`,
            `Compare the strong and partial Week 4 check anchor examples before you submit, and self-check your ${TOPIC} evidence, reasoning, limitation, and revision quality against them.`,
            `The lesson prepares students to meet this success criterion: Uses ${TOPIC} terminology precisely and in context.`,
          ],
          reviewQuestions: [
            {
              question: `How would you explain the central idea of ${TOPIC} using textual evidence?`,
              bloomsLevel: 'Analyze',
              hint: `Name ${TOPIC}, Li Bai and poetic immediacy, Du Fu and historical witness, cite evidence, and explain why it matters.`,
            },
          ],
          practiceActivities: [`Create a three-column note with concept, textual evidence, and decision for ${TOPIC}.`],
        },
      ],
    };
  }

  const blueprint = {
    lessons: [{ lessonNumber: 4, title: TITLE, studentArtifact: 'Reading Response and Close-Reading Check' }],
  };

  function proseStrings(guide) {
    const prose = [guide.summary, ...guide.conceptConnections, ...guide.practiceActivities];
    for (const question of guide.reviewQuestions) prose.push(question.question, question.hint);
    return prose;
  }

  it('compresses the L4 fixture to ≤2 full-title mentions in prose', () => {
    const data = finalizeCompiledDeliverableLanguage('studyGuides', l4Guide(), blueprint);
    const guide = data.studyGuides[0];
    const mentions = proseStrings(guide).join('\n').split(TOPIC).length - 1;
    expect(mentions, JSON.stringify(proseStrings(guide), null, 1)).toBeLessThanOrEqual(2);
  });

  it('drops the "Lesson 4: X focuses on X" echo while keeping the rest of the focus list', () => {
    const data = finalizeCompiledDeliverableLanguage('studyGuides', l4Guide(), blueprint);
    const summary = data.studyGuides[0].summary;
    expect(summary).not.toMatch(/focuses on Tang Poetry and Lyrical Precision/);
    expect(summary).toContain('focuses on Li Bai and poetic immediacy, Du Fu and historical witness');
    // The sentence subject (the document's first full-title mention) stays.
    expect(summary).toContain(`${TITLE} focuses on`);
  });

  it('never touches the heading, the exam-scope line, or the key-term table', () => {
    const fixture = l4Guide();
    const expectedExamScope = fixture.studyGuides[0].examScope;
    const expectedKeyTerms = JSON.parse(JSON.stringify(fixture.studyGuides[0].keyTerms));
    const data = finalizeCompiledDeliverableLanguage('studyGuides', fixture, blueprint);
    const guide = data.studyGuides[0];
    expect(guide.lessonTitle).toBe(TITLE);
    expect(guide.examScope).toBe(expectedExamScope);
    expect(guide.keyTerms).toEqual(expectedKeyTerms);
  });

  it('compressed prose reads clean: no "the this lesson", no doubled articles, possessives kept', () => {
    const data = finalizeCompiledDeliverableLanguage('studyGuides', l4Guide(), blueprint);
    const text = JSON.stringify(data.studyGuides[0]);
    expect(text).not.toMatch(/\b(?:the|a|an) this lesson\b/i);
    expect(text).not.toMatch(/\bthe the\b/i);
    expect(text).not.toMatch(/\byour this lesson\b/i);
    // "self-check your <title> evidence" compresses to a topic-specific
    // possessive, not a generic "this lesson" placeholder.
    expect(data.studyGuides[0].conceptConnections[1]).toContain("self-check Tang Poetry's evidence");
  });

  it('non-study-guide deliverables keep the existing behavior (no document budget)', () => {
    const lessonPlans = {
      lessonPlans: [
        {
          lessonTitle: TITLE,
          openingHook: `${TOPIC} begins with a single image. ${TOPIC} rewards slow reading. ${TOPIC} returns in the final paper.`,
        },
      ],
    };
    const data = finalizeCompiledDeliverableLanguage('lessonPlans', lessonPlans, blueprint);
    // All three mentions survive — the compressor is scoped to study guides.
    expect(data.lessonPlans[0].openingHook.split(TOPIC).length - 1).toBe(3);
  });
});

describe('round-3 polish 4 — "X: X" echo chains are gone from labels and primers', () => {
  // The v0.12.1 output-gate pattern the Crucible grader flags.
  const ECHO_RE = /\b([A-Z][\w &'-]{3,50}): \1\b/;

  function csCourseMap() {
    // Lesson titles are the TAIL word of the lesson's first concept — the
    // exact shape that produced "Practice: Creating and Accessing Lists:
    // Lists adapts the course pattern: run…" on the live cs-python L7 deck.
    const lessons = [
      ['Lists', 'Creating and Accessing Lists'],
      ['Loops', 'Iterating with For Loops'],
      ['Functions', 'Defining and Calling Functions'],
    ];
    return {
      courseName: 'Introduction to Programming with Python',
      lessons: lessons.map(([short, concept], index) => ({
        title: `Lesson ${index + 1}: ${short}`,
        sections: [
          {
            topicSection: `${concept}; ${short.toLowerCase()} patterns`,
            learningObjectives: `Write programs using ${concept.toLowerCase()}.\nDebug ${short.toLowerCase()} errors with evidence.`,
            weeklyAssessments: `Quiz: ${short.toLowerCase()} basics`,
            asyncActivities: `Read the chapter on ${short.toLowerCase()}.`,
            syncActivities: `Programming lab: ${concept.toLowerCase()}.`,
            supportingResources: `Course notes: ${short.toLowerCase()}`,
          },
        ],
      })),
    };
  }

  it('practice labels never echo: when the bullet leads with the topic tail, only the label prepends', () => {
    const blueprint = buildCourseBlueprint(csCourseMap());
    const decks = compileBlueprintDeliverable('slideDecks', blueprint, { skipLanguageFinalizer: true });
    const allBullets = decks.decks.flatMap((deck) => deck.slides.flatMap((slide) => slide.bullets || []));
    expect(allBullets.length).toBeGreaterThan(0);
    const echoes = allBullets.filter((bullet) => ECHO_RE.test(bullet));
    expect(echoes, JSON.stringify(echoes, null, 1)).toEqual([]);
  });

  it('the full finalized deck surface (titles, subtitles, notes) is echo-free too', () => {
    const blueprint = buildCourseBlueprint(csCourseMap());
    const decks = compileBlueprintDeliverable('slideDecks', blueprint);
    for (const deck of decks.decks) {
      for (const slide of deck.slides) {
        for (const text of [slide.title, slide.subtitle, ...(slide.bullets || [])]) {
          if (typeof text !== 'string') continue;
          expect(ECHO_RE.test(text), text).toBe(false);
        }
      }
    }
  });

  it('prerequisite primer citations drop the term label when the definition already leads with it', () => {
    const graph = {
      course: { name: 'World Literature' },
      sessions: [{ id: 's14', number: 14, title: 'Final Paper and Closing Synthesis', sections: [{}] }],
      resources: [],
      enrichmentOverlay: {
        lessonContent: {
          'lesson-14': {
            prerequisitePrimers: [
              {
                prerequisiteTerm: 'Close reading',
                definition:
                  'Close reading interprets a literary work by moving between its parts and the whole: each text rewards attention to detail.',
                source: 'Writing About Literature (open textbook)',
              },
              {
                prerequisiteTerm: 'Meter',
                definition: 'The patterned rhythm of stressed and unstressed syllables in verse.',
                source: 'Poetry Handbook (open textbook)',
              },
            ],
          },
        },
      },
    };
    const attached = attachGenomeResources(graph);
    expect(attached).toBe(2);
    const citations = graph.resources.map((resource) => resource.citation);
    // The live echo shape is gone…
    expect(citations[0]).toContain('Prerequisite primer — Close reading interprets a literary work');
    expect(citations[0]).not.toMatch(/Close reading: Close reading/);
    expect(citations.some((citation) => ECHO_RE.test(citation))).toBe(false);
    // …and definitions that do NOT lead with the term keep the "term: definition" label.
    expect(citations[1]).toContain('Prerequisite primer — Meter: The patterned rhythm');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// v0.14.3 round-2 surgical fixes (verification-output/crucible/
// round-2026-06-11T20-21-08-130Z) — stats-intro P0 + P1.
//   FIX 1: known-offender blacklist goes product-side — the engine rejects the
//          famous offender at ATTACH time off the SAME shared list + yield rule
//          the grader uses, with a generic/discipline-name-token refinement.
//   FIX 2: one unpunctuated verbatim-passthrough slide-bullet path gains the
//          ≥60-char terminal-punctuation rule.
// ════════════════════════════════════════════════════════════════════════════

describe('round-2 FIX 1 — known-offender blacklist is single-sourced and enforced at attach time', () => {
  // The exact stats-intro offender from the round: "Global Cancer Statistics,
  // 2002" (Parkin et al.) — a Medicine/Health-Science topic field (legal for an
  // intro-stats course per the v0.14.3 calibration) whose only tie to a
  // sampling lesson is the generic word "statistics".
  const CANCER_STATS_2002 = {
    title: 'Global Cancer Statistics, 2002',
    abstract:
      'Estimates of worldwide cancer incidence and mortality for the year 2002, by site and region, ' +
      'from population-based cancer registries.',
    url: 'https://onlinelibrary.wiley.com/doi/pdfdirect/10.3322/canjclin.55.2.74',
    citedBy: 40000,
    authors: 'Donald Maxwell Parkin, Freddie Bray, Jacques Ferlay et al.',
    license: 'open access',
    // The legitimate stats topic field that the v0.14.3 calibration allows.
    primaryTopic: { name: 'Cancer Epidemiology', field: 'Medicine', domain: 'Health Sciences' },
  };

  // A genuinely on-topic stats reading (STROBE) to prove the gate still lets
  // real Medicine-field stats readings through.
  const STROBE_WORK = {
    title: 'The Strengthening the Reporting of Observational Studies in Epidemiology (STROBE) statement',
    abstract:
      'Reporting guidelines for observational studies: sampling frame, confounding, p-values, ' +
      'confidence intervals, and significance testing in cohort and case-control designs.',
    url: 'https://www.equator-network.org/strobe.pdf',
    citedBy: 30000,
    authors: 'Erik von Elm, Douglas G. Altman et al.',
    license: 'cc-by',
    primaryTopic: { name: 'Epidemiological Methods', field: 'Medicine', domain: 'Health Sciences' },
  };

  // The nursing FP-1 keeper: a paper whose title shares the lesson's REAL
  // concept ("innate immunity") despite carrying the "Alzheimer" blacklist key.
  const NURSING_IMMUNITY_WORK = {
    title: 'Microglial-mediated innate immunity and inflammation in Alzheimer disease',
    abstract:
      'Rare coding variants implicate microglial innate immune signalling and neuroinflammation in ' +
      'the pathogenesis of late-onset disease.',
    url: 'https://doi.org/10.1038/ng.3916',
    citedBy: 1200,
    authors: 'Rebecca Sims, GERAD/PERADES et al.',
    license: 'cc-by',
    primaryTopic: { name: 'Neuroimmunology', field: 'Immunology and Microbiology', domain: 'Life Sciences' },
  };

  function courseGraph({ courseName, number, sessionTitle, conceptTerms }) {
    return {
      course: { name: courseName },
      sessions: [{ id: 's1', number, title: sessionTitle, sections: [{ topic: 'x' }] }],
      concepts: conceptTerms.map((term, index) => ({ id: `c${index + 1}`, term })),
      edges: { teaches: conceptTerms.map((_, index) => ({ from: 's1', to: `c${index + 1}` })) },
      resources: [],
    };
  }

  it('the shared matcher + list live in artifactDefectPatterns and the grader/engine import them', () => {
    // The matcher identifies the exact round offender and the historical class.
    expect(matchesKnownOffender('Global Cancer Statistics, 2002')).toBe('Global cancer statistics');
    expect(matchesKnownOffender('Gradient-Based Learning Applied to Document Recognition (MNIST)')).toBeTruthy();
    expect(matchesKnownOffender('A close reading of Tang poetry')).toBe(null);
  });

  it('the yield rule ignores generic + discipline-name tokens: cancer-stats never yields to a stats lesson', () => {
    // The ONLY overlap between "Global Cancer Statistics" and a sampling lesson
    // is the generic, discipline-name token "statistics" → no yield.
    const titleTokens = new Set(['global', 'cancer', 'statistics']);
    const samplingConcept = new Set(['sampling', 'distribution', 'statistics', 'estimator']);
    expect(
      blacklistYieldsToTopicalOverlap(titleTokens, samplingConcept, {
        disciplineNameTokens: ['statistics', 'statistical'],
      }),
    ).toBe(false);
    // …but a nursing immunity lesson KEEPS its Alzheimer-innate-immunity paper:
    // the overlap tokens ("innate","immunity") are neither generic nor the name.
    const immunityTitle = new Set(['microglial', 'innate', 'immunity', 'inflammation', 'alzheimer']);
    const immunityConcept = new Set(['innate', 'adaptive', 'immunity', 'inflammation']);
    expect(blacklistYieldsToTopicalOverlap(immunityTitle, immunityConcept, { disciplineNameTokens: ['nursing'] })).toBe(
      true,
    );
  });

  it('REJECTS the cancer-statistics paper for a stats sampling lesson at attach time', async () => {
    const graph = courseGraph({
      courseName: 'Introductory Statistics',
      number: 5,
      sessionTitle: 'Lesson 5: P-Values and Significance',
      conceptTerms: ['sampling distribution', 'significance testing'],
    });
    const attached = await attachOpenReadings(graph, { providers: stubReadings([CANCER_STATS_2002]) });
    expect(attached).toBe(0);
    expect(graph.resources).toHaveLength(0);
    const decision = graph.readingListDecisions[0];
    expect(decision.type).toBe('no-relevant-reading');
    expect(decision.rejectedKnownOffender).toBe(1);
    expect(decision.knownOffenderMessage).toContain('rejected known-offender: Global Cancer Statistics, 2002');
  });

  it('still attaches a genuinely on-topic Medicine-field stats reading (STROBE) — the calibration survives', async () => {
    const graph = courseGraph({
      courseName: 'Introductory Statistics',
      number: 5,
      sessionTitle: 'Lesson 5: Significance Testing and Reporting',
      conceptTerms: ['significance testing', 'observational study reporting'],
    });
    const attached = await attachOpenReadings(graph, { providers: stubReadings([STROBE_WORK, CANCER_STATS_2002]) });
    expect(attached).toBe(1);
    expect(graph.resources[0].citation).toContain('STROBE');
    expect(graph.readingListDecisions || []).toHaveLength(0);
  });

  it('a nursing immunity lesson KEEPS its Alzheimer-innate-immunity paper (the yield case)', async () => {
    const graph = courseGraph({
      courseName: 'Foundations for Nursing Practice',
      number: 8,
      sessionTitle: 'Lesson 8: Innate versus Adaptive Immunity',
      conceptTerms: ['innate immunity', 'inflammation'],
    });
    const attached = await attachOpenReadings(graph, { providers: stubReadings([NURSING_IMMUNITY_WORK]) });
    expect(attached).toBe(1);
    expect(graph.resources[0].citation).toContain('innate immunity');
    expect(graph.readingListDecisions || []).toHaveLength(0);
  });
});

describe('round-2 FIX 2 — verbatim-passthrough slide bullets gain the ≥60-char punctuation rule', () => {
  // The live stats-intro deck (Lesson 06 — Logic of Hypothesis Testing) shipped
  // four anchor-fact bullets verbatim via the enriched-slide passthrough; the
  // second was a ≥60-char complete clause with NO terminal punctuation.
  const STATS_BULLET = 'The test direction must match the claim: two-sided, greater than, or less than';

  function statsEnrichedCourseMap() {
    return {
      courseName: 'Introductory Statistics',
      lessons: [
        {
          title: 'Lesson 6: Logic of Hypothesis Testing',
          sections: [
            {
              topicSection: 'hypothesis testing; significance',
              learningObjectives:
                'State null and alternative hypotheses precisely.\nInterpret a p-value in the context of a claim.',
              weeklyAssessments: 'Quiz: hypothesis logic',
              asyncActivities: 'Read the hypothesis-testing chapter.',
              syncActivities: 'Workshop: frame three claims as hypotheses.',
              supportingResources: 'OpenStax statistics chapter on hypothesis testing',
            },
          ],
        },
      ],
    };
  }

  it('the exact stats bullet shape gains a terminal period when it ships via an enriched slide', () => {
    const blueprint = buildCourseBlueprint(statsEnrichedCourseMap(), {
      enrichment: {
        source: 'test-enrichment',
        lessonContent: {
          'lesson-1': {
            quizItems: [],
            keyTerms: [],
            // The slideContent passthrough — the exact live shape (a title +
            // a list of complete-clause anchor facts, unpunctuated).
            slideContent: [
              {
                title: 'Anchor facts: hypothesis logic',
                bullets: [
                  'The parameter under study is the population quantity being tested',
                  STATS_BULLET,
                  'A conclusion should be stated in context, not as proof',
                ],
              },
            ],
          },
        },
      },
    });
    const decks = compileBlueprintDeliverable('slideDecks', blueprint, { skipLanguageFinalizer: true });
    const allBullets = decks.decks.flatMap((deck) => deck.slides.flatMap((slide) => slide.bullets || []));
    const punctuated = allBullets.find((bullet) => bullet.startsWith('The test direction must match the claim'));
    expect(punctuated, JSON.stringify(allBullets, null, 1)).toBeTruthy();
    expect(punctuated.endsWith('.')).toBe(true);
    // No ≥60-char bullet leaves the deck unpunctuated (the grader's check).
    for (const bullet of allBullets) {
      expect(isTruncatedBulletLine(bullet), bullet).toBe(false);
    }
  });

  it('short labels stay bare and relationship-arrow pairs stay unpunctuated', () => {
    const blueprint = buildCourseBlueprint(statsEnrichedCourseMap(), {
      enrichment: {
        source: 'test-enrichment',
        lessonContent: {
          'lesson-1': {
            quizItems: [],
            keyTerms: [],
            slideContent: [
              {
                title: 'Mix of bullet shapes',
                bullets: [
                  'Null vs alternative', // short label (< 60 chars) → stays bare
                  'Sampling distribution ↔ the population the samples are drawn from', // arrow pair → bare
                ],
              },
            ],
          },
        },
      },
    });
    const decks = compileBlueprintDeliverable('slideDecks', blueprint, { skipLanguageFinalizer: true });
    const allBullets = decks.decks.flatMap((deck) => deck.slides.flatMap((slide) => slide.bullets || []));
    const shortLabel = allBullets.find((bullet) => bullet === 'Null vs alternative');
    expect(shortLabel, JSON.stringify(allBullets, null, 1)).toBe('Null vs alternative');
    const arrowPair = allBullets.find((bullet) => bullet.includes('↔'));
    expect(arrowPair).toBeTruthy();
    expect(arrowPair.endsWith('.')).toBe(false);
  });
});
