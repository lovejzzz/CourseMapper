/**
 * v0.14.5 WS-A — the readings registry (A1 extraction, A2 inheritance,
 * A4 retrieval demotion, A5 receipts).
 *
 * The Grounding thesis: what the instructor already said outranks what we
 * can retrieve. Instructor-named works become first-class registry entities
 * (graph.readings) that every deliverable inherits VERBATIM — course-map
 * supportingResources cells, syllabus week rows and Required Texts,
 * lesson-plan MATERIALS, brief source cues, discussion anchors — with
 * retrieval demoted to supplement (OpenAlex only attaches to empty slots;
 * OpenLibrary may enrich a registry book's metadata but never its title).
 * Provenance order is instructor-named → genome-cited → retrieved-open →
 * nothing; a lower tier never displaces a higher one.
 *
 * The fusion lesson applies throughout: titles render verbatim on every
 * surface — no casing surgery, no truncation, no label shortening — and the
 * compiledLanguageFinalizer never registers reading titles as replacement
 * targets (asserted here through the full compile, which runs the finalizer).
 */
import { describe, expect, it, vi } from 'vitest';

import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler';
import {
  buildBlueprintFromGraph,
  classifyReadingKind,
  courseGraphStats,
  deriveCourseGraphFromCourseMap,
  parseReadingAuthor,
  renderCourseMapFromGraph,
  selectCompilerRegistryBridges,
  validateCourseGraph,
} from '../src/lib/courseGraph';
import { repairCourseMapReadiness } from '../src/lib/deliverableReadiness';
import { expandLeanCourseMap, expandLeanSectionField, leanSectionValueIsCorrupt } from '../src/lib/leanCourseMap';
import { buildUserPrompt } from '../src/lib/prompts';
import { attachOpenReadings } from '../src/lib/knowledge/readingListEngine';
import { grade } from '../src/lib/quality/deepQualityGrader';
import { createMemoryFileProvider } from '../src/lib/quality/fileProviders';

// ── Fixtures ────────────────────────────────────────────────────────────────

const NAMED_TITLE = 'Things Fall Apart';

const WORLD_LIT_TOPICS = [
  ['What Is World Literature', 'world literature debates'],
  ['The Oral Epic Tradition', 'oral epic formulas'],
  ['The Homeric Epic', 'homeric epithets'],
  ['Classical Drama', 'tragic conflict'],
  ['Tang Poetry', 'regulated verse'],
  ['Frame Narratives', 'frame narrative structure'],
  ['Comparative Reading Methods', 'comparative method'],
  ['Postcolonial Literature', 'postcolonial perspective'],
];

function makeSection(lessonIndex, title, concept, readings) {
  return {
    topicSection: `${lessonIndex + 1}.1: ${title}`,
    learningGoals: `1. Interpret ${concept} with textual evidence.`,
    learningObjectives: `Analyze ${concept} through close reading.\nEvaluate competing interpretations of ${concept}.`,
    weeklyAssessments: `Reading Response: ${concept}`,
    asyncActivities: `Read: the assigned selection on ${title.toLowerCase()}.`,
    syncActivities: `Seminar: discuss ${concept} with textual evidence.`,
    supportingResources: `Course anthology selection on ${title.toLowerCase()}`,
    ...(readings ? { readings } : {}),
  };
}

/** World-Lit-like 8-lesson map; Lesson 8 names "Things Fall Apart". */
function worldLitCourseMap({ lesson8Readings = [NAMED_TITLE] } = {}) {
  return {
    courseName: 'World Literature',
    semester: 'FA26',
    lessons: WORLD_LIT_TOPICS.map(([title, concept], index) => ({
      title: `Lesson ${index + 1}: ${title}`,
      sections: [makeSection(index, title, concept, index === 7 ? lesson8Readings : undefined)],
    })),
  };
}

function repairedWorldLitMap(options) {
  const fixture = worldLitCourseMap(options);
  return repairCourseMapReadiness({ courseMap: fixture }).courseMap || fixture;
}

/** Walk an entity and fail on any array-valued field (the Firestore rule). */
function expectFlatScalars(entity, label) {
  for (const [key, value] of Object.entries(entity)) {
    expect(Array.isArray(value), `${label}.${key} must not be an array — readings are flat scalars`).toBe(false);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// (1) A1 — lean parse: the wire format
// ════════════════════════════════════════════════════════════════════════════

describe('A1 wire format — lean readings array', () => {
  it('survives lean expansion as a verbatim atom array, never prose', () => {
    const map = {
      courseName: 'World Literature',
      lessons: [
        {
          title: 'Lesson 1: Postcolonial Literature',
          sections: [
            {
              topicSection: '1.1: Postcolonial Literature',
              learningObjectives: ['1a. Analyze narrative perspective'],
              readings: ['  Things  Fall Apart ', 'OpenStax Ch. 4: Cell Structure'],
            },
          ],
        },
      ],
    };
    const expanded = expandLeanCourseMap(map);
    const section = expanded.lessons[0].sections[0];
    // Whitespace collapses; titles stay otherwise verbatim, as an array.
    expect(section.readings).toEqual(['Things Fall Apart', 'OpenStax Ch. 4: Cell Structure']);
    // The expander never renders readings into numbered prose.
    expect(expandLeanSectionField('readings', [NAMED_TITLE])).toEqual([NAMED_TITLE]);
    // Objectives still expand to prose — the readings passthrough is scoped.
    expect(typeof section.learningObjectives).toBe('string');
  });

  it('rejects JSON-fragment corruption wholesale (key dropped, run unharmed)', () => {
    const corrupt = ['Things Fall Apart', '"weeklyAssessments": ["spliced'];
    expect(leanSectionValueIsCorrupt(corrupt)).toBe(true);
    const expanded = expandLeanCourseMap({
      courseName: 'C',
      lessons: [{ title: 'Lesson 1: X', sections: [{ topicSection: '1.1: X', readings: corrupt }] }],
    });
    expect('readings' in expanded.lessons[0].sections[0]).toBe(false);
  });

  it('drops malformed (non-array) and empty readings values — strictly additive', () => {
    for (const bad of ['Things Fall Apart', 42, { title: 'x' }, [], ['', '   ']]) {
      const expanded = expandLeanCourseMap({
        courseName: 'C',
        lessons: [{ title: 'Lesson 1: X', sections: [{ topicSection: '1.1: X', readings: bad }] }],
      });
      expect('readings' in expanded.lessons[0].sections[0], `readings=${JSON.stringify(bad)}`).toBe(false);
    }
  });

  it('absent readings stays absent everywhere — no key materializes', () => {
    const map = worldLitCourseMap({ lesson8Readings: null });
    const expanded = expandLeanCourseMap(map);
    for (const lesson of expanded.lessons) {
      for (const section of lesson.sections) expect('readings' in section).toBe(false);
    }
    const graph = deriveCourseGraphFromCourseMap(repairCourseMapReadiness({ courseMap: map }).courseMap || map);
    expect(graph.readings).toEqual([]);
    const rendered = renderCourseMapFromGraph(graph);
    for (const lesson of rendered.lessons) {
      for (const section of lesson.sections) expect('readings' in section).toBe(false);
    }
  });

  it('lean prompt carries the readings contract (traceability rule); verbose prompt does not', () => {
    const lean = buildUserPrompt('Week 1: read Things Fall Apart.', [], null, false, null, null, { lean: true });
    expect(lean).toContain('- readings:');
    expect(lean).toMatch(/VERBATIM/);
    expect(lean).toMatch(/Never invent/i);
    expect(lean).toMatch(/Omit the key when the source names none/i);
    expect(lean).toContain('"readings": ["One reading title exactly as the source names it"]');
    const verbose = buildUserPrompt('Week 1: read Things Fall Apart.', [], null, false, null, null, {});
    expect(verbose).not.toContain('- readings:');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// (2) A1 — derivation: graph.readings entities
// ════════════════════════════════════════════════════════════════════════════

describe('A1 derivation — graph.readings registry', () => {
  it('derives ids, kinds, dueSession, verbatim titles; flat scalars; stats count', () => {
    const map = {
      courseName: 'World Literature',
      lessons: [
        {
          title: 'Lesson 1: Foundations',
          sections: [
            {
              topicSection: '1.1: Foundations',
              learningObjectives: 'Analyze sources.',
              readings: ['course packet pp. 12-30', 'OpenStax Ch. 4: Cell Structure'],
            },
            {
              topicSection: '1.2: Methods',
              learningObjectives: 'Evaluate methods.',
              readings: ['Achebe, Chinua. Things Fall Apart'],
            },
          ],
        },
        {
          title: 'Lesson 2: Epics',
          sections: [
            {
              topicSection: '2.1: Epics',
              learningObjectives: 'Compare epics.',
              readings: ['Gilgamesh'],
            },
          ],
        },
      ],
    };
    const graph = deriveCourseGraphFromCourseMap(map);
    expect(graph.readings.map((reading) => reading.id)).toEqual(['R1.1', 'R1.2', 'R1.3', 'R2.1']);
    expect(graph.readings.map((reading) => reading.kind)).toEqual(['packet', 'chapter', 'book', 'other']);
    expect(graph.readings.map((reading) => reading.dueSession)).toEqual([1, 1, 1, 2]);
    expect(graph.readings.map((reading) => reading.title)).toEqual([
      'course packet pp. 12-30',
      'OpenStax Ch. 4: Cell Structure',
      'Achebe, Chinua. Things Fall Apart',
      'Gilgamesh',
    ]);
    expect(graph.readings[2].author).toBe('Achebe, Chinua');
    expect(graph.readings[3].author).toBe(''); // a bare work name never mints an author
    for (const reading of graph.readings) {
      expect(reading.instructorProvided).toBe(false);
      expect(reading.sourceText).toBe(reading.title);
      expectFlatScalars(reading, reading.id);
    }
    // Sections reference the registry through flat scalar id refs.
    expect(graph.sessions[0].sections[0].readingRefs).toEqual(['R1.1', 'R1.2']);
    expect(graph.sessions[0].sections[1].readingRefs).toEqual(['R1.3']);
    expect(graph.readings[0].sectionRef).toBe(graph.sessions[0].sections[0].id);
    expect(validateCourseGraph(graph).valid).toBe(true);
    expect(courseGraphStats(graph).readings).toBe(4);
  });

  it('classifies kinds by cheap signals only and parses authors conservatively', () => {
    expect(classifyReadingKind('course packet pp. 12-30')).toBe('packet');
    expect(classifyReadingKind('OpenStax Ch. 4: Cell Structure')).toBe('chapter');
    expect(classifyReadingKind('Inferno, Cantos I–V, pp. 3-44')).toBe('chapter');
    expect(classifyReadingKind('Journal article on translation')).toBe('article');
    expect(classifyReadingKind('Documentary: The Epic of Gilgamesh')).toBe('media');
    expect(classifyReadingKind('Achebe, Chinua. Things Fall Apart')).toBe('book');
    expect(classifyReadingKind('Things Fall Apart')).toBe('other');
    expect(classifyReadingKind('The Waste Land')).toBe('other');
    // Conservative author parse: only "Lastname, Firstname. Title" yields one.
    expect(parseReadingAuthor('Achebe, Chinua. Things Fall Apart')).toBe('Achebe, Chinua');
    expect(parseReadingAuthor('Gilgamesh, Tablets I–IV')).toBe('');
    expect(parseReadingAuthor('Things Fall Apart')).toBe('');
  });

  it('round-trips render→derive with stable ids and no duplicate resource entities', () => {
    const graph = deriveCourseGraphFromCourseMap(repairedWorldLitMap());
    const rendered = renderCourseMapFromGraph(graph);
    // The rendered section carries the verbatim readings array back.
    expect(rendered.lessons[7].sections[0].readings).toEqual([NAMED_TITLE]);
    const rederived = deriveCourseGraphFromCourseMap(rendered);
    expect(rederived.readings.map((reading) => [reading.id, reading.title])).toEqual(
      graph.readings.map((reading) => [reading.id, reading.title]),
    );
    // The leading supportingResources item (the reading title) must NOT mint
    // a duplicate syllabus Resource entity on re-derivation.
    expect(rederived.resources.length).toBe(graph.resources.length);
    const citations = rederived.resources.map((resource) => resource.citation.toLowerCase());
    expect(citations.some((citation) => citation.includes(NAMED_TITLE.toLowerCase()))).toBe(false);
    // Second round trip is fully stable.
    const renderedTwice = renderCourseMapFromGraph(rederived);
    expect(renderedTwice.lessons[7].sections[0].supportingResources).toBe(
      rendered.lessons[7].sections[0].supportingResources,
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// (3) A2 — inheritance: every surface names the work, verbatim
// ════════════════════════════════════════════════════════════════════════════

describe('A2 inheritance — verbatim on every surface', () => {
  const graph = deriveCourseGraphFromCourseMap(repairedWorldLitMap());
  const rendered = renderCourseMapFromGraph(graph);
  const blueprint = buildBlueprintFromGraph(graph);
  const compiled = compileBlueprintDeliverables(blueprint, ['syllabus', 'lessonPlans', 'discussions', 'assignments']);

  it('bridges a Course Map reading that native assembly omitted', () => {
    const nativeGraphWithoutReadings = {
      ...graph,
      readings: [],
      sessions: graph.sessions.map((session) => ({
        ...session,
        sections: session.sections.map((section) => ({ ...section, readingRefs: [] })),
      })),
    };
    const bridges = selectCompilerRegistryBridges(nativeGraphWithoutReadings, graph);
    expect(bridges.stats).toMatchObject({
      graphReadingCount: 0,
      mapReadingCount: 1,
      missingReadingCount: 1,
    });
    expect(bridges.readingsRegistry).toEqual(graph.readings);

    const bridged = compileBlueprintDeliverables(
      buildBlueprintFromGraph(nativeGraphWithoutReadings, bridges),
      ['lessonPlans', 'discussions', 'assignments'],
    );
    expect(bridged.lessonPlans.lessonPlans[7].materials[0]).toBe(NAMED_TITLE);
    expect(bridged.discussions.discussions[7].prompt).toContain(`Anchor your post in ${NAMED_TITLE}.`);
    expect(JSON.stringify(bridged.assignments)).toContain(NAMED_TITLE);
  });

  it('keeps a short canonical title as the lesson evidence source', () => {
    const shortTitle = 'Inferno';
    const shortGraph = deriveCourseGraphFromCourseMap(repairedWorldLitMap({ lesson8Readings: [shortTitle] }));
    const shortBlueprint = buildBlueprintFromGraph(shortGraph);
    const lesson = shortBlueprint.lessons[7];
    expect(lesson.readings[0]).toBe(shortTitle);
    expect(lesson.evidencePlan.sourceCue).toBe(shortTitle);
    expect(lesson.throughlineCase.evidencePacket).toBe(shortTitle);

    const shortCompiled = compileBlueprintDeliverables(shortBlueprint, [
      'lessonPlans',
      'discussions',
      'assignments',
      'quizBank',
      'studyGuides',
    ]);
    for (const featureId of ['lessonPlans', 'discussions', 'assignments', 'quizBank', 'studyGuides']) {
      expect(JSON.stringify(shortCompiled[featureId]), `${featureId} dropped the short registry title`).toContain(
        shortTitle,
      );
    }
  });

  it('course-map supportingResources cell leads with the verbatim title', () => {
    const cell = rendered.lessons[7].sections[0].supportingResources;
    expect(cell.split('\n')[0]).toBe(`1. ${NAMED_TITLE}`);
  });

  it('syllabus week row lists the title first; registry book seeds Required Texts only when unambiguous', () => {
    const week8 = compiled.syllabus.syllabus.weeklySchedule.find((row) => row.week === 'Week 8');
    expect(week8.readings.startsWith(NAMED_TITLE)).toBe(true);
    // Bare title (kind 'other', no author) must NOT seed Required Texts —
    // only an unambiguous registry book with an author does.
    const requiredTitles = compiled.syllabus.syllabus.requiredTexts.map((text) => text.title);
    expect(requiredTitles).not.toContain(NAMED_TITLE);

    const bookGraph = deriveCourseGraphFromCourseMap(
      repairedWorldLitMap({ lesson8Readings: ['Achebe, Chinua. Things Fall Apart'] }),
    );
    const bookCompiled = compileBlueprintDeliverables(buildBlueprintFromGraph(bookGraph), ['syllabus']);
    const bookTexts = bookCompiled.syllabus.syllabus.requiredTexts;
    expect(bookTexts[0].title).toBe('Achebe, Chinua. Things Fall Apart');
    expect(bookTexts[0].note).toMatch(/instructor-named/i);
  });

  it('lesson-plan MATERIALS lists the registry title first', () => {
    const plan = compiled.lessonPlans.lessonPlans[7];
    expect(plan.weekNumber).toBe('Week 8');
    expect(plan.materials[0]).toBe(NAMED_TITLE);
  });

  it('discussion prompt anchors the post in the named text', () => {
    const discussion = compiled.discussions.discussions[7];
    expect(discussion.prompt).toContain(`Anchor your post in ${NAMED_TITLE}.`);
    // Lessons without a registry reading get no anchor sentence.
    expect(compiled.discussions.discussions[0].prompt).not.toContain('Anchor your post in');
  });

  it('briefs reference the actual title where they reference readings', () => {
    const serialized = JSON.stringify(compiled.assignments);
    expect(serialized).toContain(NAMED_TITLE);
  });

  it('the title is NEVER shortened, fused, or re-cased — exact string on every compiled surface', () => {
    // The full compile runs compiledLanguageFinalizer; reading titles are
    // never registered as reference-shortening targets, so the exact string
    // must survive on every surface that mentions the work at all.
    for (const featureId of ['syllabus', 'lessonPlans', 'discussions', 'assignments']) {
      const serialized = JSON.stringify(compiled[featureId]);
      expect(serialized, `${featureId} must name the work verbatim`).toContain(NAMED_TITLE);
      // No case-mangled variant anywhere (exact-cased occurrences only).
      const caseInsensitive = serialized.match(/things fall apart/gi) || [];
      const exact = serialized.match(/Things Fall Apart/g) || [];
      expect(exact.length, `${featureId} carries a re-cased variant of the title`).toBe(caseInsensitive.length);
    }
  });

  it('map path with explicit registries compiles the same readings surfaces as the graph path', () => {
    const mapBlueprint = buildCourseBlueprint(rendered, {
      assessmentRegistry: graph.assessments,
      readingsRegistry: graph.readings,
    });
    const mapCompiled = compileBlueprintDeliverables(mapBlueprint, ['lessonPlans', 'syllabus']);
    expect(mapCompiled.lessonPlans.lessonPlans[7].materials).toEqual(compiled.lessonPlans.lessonPlans[7].materials);
    expect(mapCompiled.syllabus.syllabus.weeklySchedule[7].readings).toEqual(
      compiled.syllabus.syllabus.weeklySchedule[7].readings,
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// (4) A4 — retrieval demotion
// ════════════════════════════════════════════════════════════════════════════

describe('A4 retrieval demotion — instructor slots are never displaced', () => {
  function passingWorkFor(query) {
    return {
      title: `Open study of ${query}`,
      abstract: `A peer-reviewed open-access study of ${query}.`,
      authors: 'A. Researcher',
      year: 2021,
      url: 'https://doi.org/10.1234/example',
      license: 'cc-by',
      attribution: 'OpenAlex (CC0 metadata)',
    };
  }

  it('skips sessions whose registry slot is filled and records the decision', async () => {
    const graph = deriveCourseGraphFromCourseMap(repairedWorldLitMap());
    const providers = {
      searchScholarlyReadings: vi.fn(async (query) => [passingWorkFor(query)]),
      searchBookMetadata: vi.fn(async () => []),
    };
    await attachOpenReadings(graph, { providers });
    // Lesson 8's slot is filled by the instructor reading — never queried.
    const queries = providers.searchScholarlyReadings.mock.calls.map(([query]) => query);
    expect(queries).not.toContain('Postcolonial Literature');
    expect(providers.searchScholarlyReadings).toHaveBeenCalledTimes(7);
    const skip = (graph.readingListDecisions || []).find(
      (decision) => decision.type === 'slot-filled-by-instructor-reading',
    );
    expect(skip).toBeTruthy();
    expect(skip.lesson).toBe(8);
    expect(skip.message).toContain('slot filled by instructor reading');
    expect(skip.instructorReadings).toEqual([NAMED_TITLE]);
    // No retrieved reading attached to lesson 8's section.
    const lesson8Refs = graph.sessions[7].sections[0].resourceRefs || [];
    const openalexIds = graph.resources.filter((resource) => resource.origin === 'openalex').map((r) => r.id);
    expect(lesson8Refs.some((id) => openalexIds.includes(id))).toBe(false);
  });

  it('OpenLibrary ENRICHES a registry book (isbn/url) but never replaces the verbatim title', async () => {
    const verbatim = 'Achebe, Chinua. Things Fall Apart';
    const graph = deriveCourseGraphFromCourseMap(repairedWorldLitMap({ lesson8Readings: [verbatim] }));
    const providers = {
      searchScholarlyReadings: vi.fn(async () => []),
      searchBookMetadata: vi.fn(async () => [
        {
          title: 'Things Fall Apart (50th Anniversary Edition)', // metadata differs — must not win
          authors: 'Chinua Achebe',
          isbn: '9780385474542',
          url: 'https://openlibrary.org/works/OL1',
          publisher: 'Anchor Books',
        },
      ]),
    };
    await attachOpenReadings(graph, { providers });
    expect(providers.searchBookMetadata).toHaveBeenCalledWith(verbatim, expect.anything());
    const book = graph.readings.find((reading) => reading.kind === 'book');
    expect(book.title).toBe(verbatim); // verbatim forever
    expect(book.isbn).toBe('9780385474542');
    expect(book.url).toBe('https://openlibrary.org/works/OL1');
    // No separate retrieved book resource displaces the registry entry.
    expect(graph.resources.filter((resource) => resource.origin === 'openlibrary')).toHaveLength(0);
  });

  it('empty slots still retrieve without promoting generic OpenLibrary metadata as a trusted source', async () => {
    const graph = deriveCourseGraphFromCourseMap(repairedWorldLitMap({ lesson8Readings: null }));
    const providers = {
      searchScholarlyReadings: vi.fn(async (query) => [passingWorkFor(query)]),
      searchBookMetadata: vi.fn(async () => [
        { title: 'World Literature Anthology', authors: 'Various', url: 'https://openlibrary.org/works/OL2' },
      ]),
    };
    const attached = await attachOpenReadings(graph, { providers });
    expect(providers.searchScholarlyReadings).toHaveBeenCalledTimes(8);
    expect(providers.searchBookMetadata).not.toHaveBeenCalled();
    expect(graph.resources.filter((resource) => resource.origin === 'openlibrary')).toHaveLength(0);
    expect(attached).toBeGreaterThan(0);
    expect((graph.readingListDecisions || []).filter((d) => d.type === 'slot-filled-by-instructor-reading')).toEqual(
      [],
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// (5) Provenance order in rendered materials
// ════════════════════════════════════════════════════════════════════════════

describe('provenance order — instructor-named leads retrieved on rendered surfaces', () => {
  it('lesson-plan materials and syllabus week row list the registry title above a retrieved citation', () => {
    const graph = deriveCourseGraphFromCourseMap(repairedWorldLitMap());
    // Simulate a retrieved attachment on lesson 8 (as if the slot had been
    // empty in an earlier run) — the surfaces must still lead with the
    // instructor-named title.
    const retrievedCitation =
      'A. Researcher (2021). Postcolonial narrative study. Open-access via https://doi.org/10.1234/x (cc-by)';
    graph.resources.push({
      id: 'kr1',
      citation: retrievedCitation,
      kind: 'peer-reviewed reading',
      sessionRefs: [graph.sessions[7].id],
      origin: 'openalex',
      url: 'https://doi.org/10.1234/x',
      license: 'cc-by',
      attribution: 'OpenAlex (CC0 metadata)',
    });
    graph.sessions[7].sections[0].resourceRefs.push('kr1');

    const rendered = renderCourseMapFromGraph(graph);
    const cell = rendered.lessons[7].sections[0].supportingResources;
    expect(cell.indexOf(NAMED_TITLE)).toBeGreaterThan(-1);
    expect(cell.indexOf(NAMED_TITLE)).toBeLessThan(cell.indexOf('Open-access via'));

    const compiled = compileBlueprintDeliverables(buildBlueprintFromGraph(graph), ['lessonPlans', 'syllabus']);
    const materials = compiled.lessonPlans.lessonPlans[7].materials;
    const titleIndex = materials.findIndex((item) => item === NAMED_TITLE);
    const retrievedIndex = materials.findIndex((item) => /Open-access via/i.test(item));
    expect(titleIndex).toBe(0);
    if (retrievedIndex !== -1) expect(titleIndex).toBeLessThan(retrievedIndex);

    const week8 = compiled.syllabus.syllabus.weeklySchedule.find((row) => row.week === 'Week 8');
    expect(week8.readings.indexOf(NAMED_TITLE)).toBe(0);
    if (week8.readings.includes('Open-access via')) {
      expect(week8.readings.indexOf(NAMED_TITLE)).toBeLessThan(week8.readings.indexOf('Open-access via'));
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// (6) A5 — receipts: manifest readings[] + grader checks
// ════════════════════════════════════════════════════════════════════════════

describe('A5 receipts — manifest readings[] and grader checks', () => {
  it('PACKAGE_MANIFEST carries readings[] with provenance tags', async () => {
    const { buildCourseMaterialsZip } = await import('../src/lib/packageZipExporter');
    const graph = deriveCourseGraphFromCourseMap(repairedWorldLitMap());
    const rendered = renderCourseMapFromGraph(graph);
    const { manifest } = await buildCourseMaterialsZip({
      courseMap: rendered,
      courseGraph: graph,
      deliverables: {},
      featureIds: ['courseMap'],
      quality: false,
      assembleOnly: true,
    });
    expect(manifest.readings).toEqual([
      { id: 'R8.1', title: NAMED_TITLE, lesson: 8, kind: 'other', provenance: 'instructor-named' },
    ]);
  });

  const MANIFEST = {
    courseName: 'World Literature',
    lessonScope: 'all',
    readiness: { status: 'ready', blockers: 0, warnings: 0 },
    requestedFeatures: [],
    requiredAssets: [],
    files: [],
    readings: [{ id: 'R8.1', title: NAMED_TITLE, lesson: 8, kind: 'other', provenance: 'instructor-named' }],
  };
  const RETRIEVED_LINE = 'A. Researcher (2021). Narrative study. Open-access via https://doi.org/10.1234/x (cc-by)';
  const GOOD_PLAN = [
    'Lesson 8: Postcolonial Literature',
    'Materials & Resources',
    NAMED_TITLE,
    'Course site agenda and lesson handout',
    RETRIEVED_LINE,
    'Session Outline',
    'Warm-up retrieval and framing',
  ].join('\n');
  const GOOD_SYLLABUS = `Course Schedule\nWeek 8 | Postcolonial Literature | ${NAMED_TITLE}; ${RETRIEVED_LINE} | Reading Response`;
  const COURSE = { id: 'world-lit-readings', title: 'World Literature', expectReadings: true, featureIds: [] };

  async function gradeFixture(fileMap) {
    return grade({ fileProvider: createMemoryFileProvider(fileMap), course: COURSE });
  }

  it('stays quiet on the good fixture (penetration + provenance satisfied)', async () => {
    const result = await gradeFixture({
      'PACKAGE_MANIFEST.json': JSON.stringify(MANIFEST),
      'Lesson Plans/Lesson 08 - Postcolonial Literature.md': GOOD_PLAN,
      'Syllabus/World Literature - Syllabus.md': GOOD_SYLLABUS,
    });
    const readingsFindings = result.findings.filter((finding) =>
      /named reading|provenance order|readings registry/i.test(finding.detail),
    );
    expect(readingsFindings).toEqual([]);
    expect(result.stats.readingsCount).toBe(1);
  });

  it('rejects a named primary text copied only into the materials list', async () => {
    const result = await gradeFixture({
      'PACKAGE_MANIFEST.json': JSON.stringify(MANIFEST),
      'Lesson Plans/Lesson 08 - Postcolonial Literature.md': GOOD_PLAN,
      'Slide Decks/Lesson 08 - Postcolonial Literature.md': 'Postcolonial perspective\nGeneric concept review',
      'Assignment Briefs/Lesson 08 - Postcolonial Literature.md': 'Write a generic professional decision.',
      'Discussion Prompts/Lesson 08 - Postcolonial Literature.md': 'Discuss the lesson concept.',
      'Quiz & Exam Bank/Lesson 08 - Postcolonial Literature.md': 'Q1. Define postcolonial perspective.',
      'Study Guides/Lesson 08 - Postcolonial Literature.md': 'Review the lesson vocabulary.',
      'Syllabus/World Literature - Syllabus.md': GOOD_SYLLABUS,
    });
    const depthFindings = result.findings.filter((finding) => /primary text/i.test(finding.detail));
    expect(depthFindings).toHaveLength(2);
    expect(depthFindings.map((finding) => finding.severity)).toEqual(['P0', 'P0']);
    expect(depthFindings[0].dimension).toBe('substance');
    expect(depthFindings[0].evidence).toContain('1/6 surfaces');
    expect(depthFindings[1].detail).toMatch(/no assessed or discussed evidence task/i);
  });

  it('accepts a primary text that reaches instruction and an evidence task', async () => {
    const result = await gradeFixture({
      'PACKAGE_MANIFEST.json': JSON.stringify(MANIFEST),
      'Lesson Plans/Lesson 08 - Postcolonial Literature.md': GOOD_PLAN,
      'Slide Decks/Lesson 08 - Postcolonial Literature.md': `${NAMED_TITLE}\nTrace the novel's narrative perspective.`,
      'Assignment Briefs/Lesson 08 - Postcolonial Literature.md': `Close-read one passage from ${NAMED_TITLE} and cite two details.`,
      'Discussion Prompts/Lesson 08 - Postcolonial Literature.md': `Compare two interpretations of ${NAMED_TITLE}.`,
      'Quiz & Exam Bank/Lesson 08 - Postcolonial Literature.md': 'Q1. Define postcolonial perspective.',
      'Study Guides/Lesson 08 - Postcolonial Literature.md': 'Review the lesson vocabulary.',
      'Syllabus/World Literature - Syllabus.md': GOOD_SYLLABUS,
    });
    expect(result.findings.filter((finding) => /primary text/i.test(finding.detail))).toEqual([]);
  });

  it('fires P1 per missing surface on the missing-penetration fixture', async () => {
    const planWithoutTitle = GOOD_PLAN.replace(`${NAMED_TITLE}\n`, '');
    const result = await gradeFixture({
      'PACKAGE_MANIFEST.json': JSON.stringify(MANIFEST),
      'Lesson Plans/Lesson 08 - Postcolonial Literature.md': planWithoutTitle,
      'Syllabus/World Literature - Syllabus.md': GOOD_SYLLABUS,
    });
    const planFindings = result.findings.filter((finding) => /lesson plan materials/.test(finding.detail));
    expect(planFindings).toHaveLength(1);
    expect(planFindings[0].severity).toBe('P1');
    expect(planFindings[0].dimension).toBe('identity');
    // The syllabus still carries it — no syllabus finding.
    expect(result.findings.filter((finding) => /syllabus schedule$/.test(finding.detail))).toHaveLength(0);
  });

  it('fires the provenance-order P1 when a retrieved item lists above the named reading', async () => {
    const badPlan = [
      'Lesson 8: Postcolonial Literature',
      'Materials & Resources',
      RETRIEVED_LINE,
      NAMED_TITLE,
      'Session Outline',
    ].join('\n');
    const badSyllabus = `Course Schedule\nWeek 8 | Postcolonial Literature | ${RETRIEVED_LINE}; ${NAMED_TITLE} | Reading Response`;
    const result = await gradeFixture({
      'PACKAGE_MANIFEST.json': JSON.stringify(MANIFEST),
      'Lesson Plans/Lesson 08 - Postcolonial Literature.md': badPlan,
      'Syllabus/World Literature - Syllabus.md': badSyllabus,
    });
    const orderFindings = result.findings.filter((finding) => /provenance order violated/.test(finding.detail));
    expect(orderFindings.length).toBe(2); // lesson plan + syllabus row
    for (const finding of orderFindings) {
      expect(finding.severity).toBe('P1');
      expect(finding.dimension).toBe('citations');
    }
  });

  it('expectReadings fails the round when the registry never materialized', async () => {
    const { readings: _omitted, ...manifestWithout } = MANIFEST;
    const result = await gradeFixture({
      'PACKAGE_MANIFEST.json': JSON.stringify(manifestWithout),
      'Lesson Plans/Lesson 08 - Postcolonial Literature.md': GOOD_PLAN,
      'Syllabus/World Literature - Syllabus.md': GOOD_SYLLABUS,
    });
    const absent = result.findings.filter((finding) => /no readings registry/.test(finding.detail));
    expect(absent).toHaveLength(1);
    expect(absent[0].severity).toBe('P1');
  });

  it('the Crucible grounding fixture exists, arms the check, and stays out of all/extended', async () => {
    const courses = await import('../scripts/crucible/courses.mjs');
    const fixture = courses.getCourseById('world-lit-readings');
    expect(fixture).toBeTruthy();
    expect(fixture.expectReadings).toBe(true);
    expect(fixture.lessonCount).toBe(14);
    for (const canon of [
      'Gilgamesh',
      'The Odyssey',
      'Antigone',
      'Li Bai and Du Fu',
      'The Thousand and One Nights',
      'Inferno',
      'Things Fall Apart',
      'One Hundred Years of Solitude',
      'The Waste Land',
      'The Library of Babel',
    ]) {
      expect(fixture.prompt).toContain(canon);
    }
    expect(courses.resolveCourses('all').map((course) => course.id)).not.toContain('world-lit-readings');
    expect(courses.resolveCourses('extended').map((course) => course.id)).not.toContain('world-lit-readings');
    expect(courses.resolveCourses('world-lit-readings')[0].id).toBe('world-lit-readings');
  });
});
