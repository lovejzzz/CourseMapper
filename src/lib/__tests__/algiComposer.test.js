// Algi V0 composes the Pass A skeleton from the uploaded source instead of
// sampling it. These tests pin the contract the pipeline admits downstream.
import { describe, expect, it } from 'vitest';
import {
  composeAlgiAdvisoryResponse,
  composeAlgiResponse,
  composeAlgiSkeleton,
  extractCourseName,
  extractExpectedSessions,
  extractSourceFromPrompt,
  planSessionTopics,
} from '../algiComposer.js';
import { skeletonSchemaProfile } from '../scionContracts.js';
import {
  algiModelOption,
  isAlgiModel,
  resolveAlgiEnrichmentBatchSize,
  supportsModelVoicePass,
} from '../algiIdentity.js';
import { publicScionProviderModelOptions } from '../publicScionIdentity.js';
import {
  composeLessonFromCandidateKernels,
  composeLessonFromKernels,
  constrainConceptIdsToDisciplines,
  fitSourceFact,
  fitSourceSentence,
  kernelTopicOverlapScore,
} from '../algiKernelComposer.js';
import { parseLessonKernelResponse } from '../blueprintEnrichmentPass.js';

const SYLLABUS = `Course: Introduction to Environmental Policy

Week 1: How environmental problems reach public agendas
Week 2: Common-pool resources and collective action
Week 3: Environmental justice and unequal exposure
Week 4: Risk assessment under uncertainty
Week 5: Command-and-control regulation
Week 6: Market instruments including carbon taxes`;

const promptFor = (source, sessions) =>
  [
    'Extract the typed course skeleton from the following source materials.',
    `The course has exactly ${sessions} sessions — return exactly that many entries in "sessions".`,
    '',
    'SOURCE MATERIALS:',
    source,
    '',
    'Return ONLY the skeleton JSON object now:',
  ].join('\n');

// Minimal structural validation against the shipped contract: the pipeline
// rejects a skeleton whose counts or field lengths fall outside these bounds.
function validateAgainstSchema(skeleton, sessionCount) {
  // skeletonSchemaProfile returns the json_schema envelope the provider sends.
  const { schema } = skeletonSchemaProfile({ sessionCount });
  const problems = [];
  const sessions = schema.properties.sessions;
  if (skeleton.sessions.length < sessions.minItems || skeleton.sessions.length > sessions.maxItems) {
    problems.push(`sessions ${skeleton.sessions.length} outside ${sessions.minItems}..${sessions.maxItems}`);
  }
  const assessments = schema.properties.assessments;
  if (skeleton.assessments.length < assessments.minItems || skeleton.assessments.length > assessments.maxItems) {
    problems.push(
      `assessments ${skeleton.assessments.length} outside ${assessments.minItems}..${assessments.maxItems}`,
    );
  }
  const titleRule = schema.properties.sessions.items.properties.title;
  for (const session of skeleton.sessions) {
    if (session.title.length < titleRule.minLength || session.title.length > titleRule.maxLength) {
      problems.push(`title "${session.title}" outside ${titleRule.minLength}..${titleRule.maxLength}`);
    }
    if (session.sectionTitles.length < 2 || session.sectionTitles.length > 4) {
      problems.push(`sectionTitles ${session.sectionTitles.length} outside 2..4`);
    }
  }
  const goals = schema.properties.course.properties.goals;
  if (skeleton.course.goals.length < goals.minItems) problems.push('too few goals');
  return problems;
}

describe('Algi V0 identity', () => {
  it('is offered inside the Scion provider, listed after the downloaded base', () => {
    const options = publicScionProviderModelOptions();
    expect(options).toHaveLength(2);
    expect(options[0].id).toBe('scion-public');
    expect(options[1].id).toBe('algi-v0');
    expect(options[1].name).toBe('Algi V0');
  });

  it('claims no sampling capability, because nothing is sampled', () => {
    const option = algiModelOption();
    expect(option.source).toBe('genome-local');
    expect(option.capabilities.streaming).toBe(false);
    expect(option.capabilities.temperature).toBe(false);
    expect(isAlgiModel('algi-v0')).toBe(true);
    expect(isAlgiModel('scion-public')).toBe(false);
  });

  it('composes enrichment in one course-wide batch instead of imitating Scion calls', () => {
    expect(resolveAlgiEnrichmentBatchSize('public', 'algi-v0', 14, 1)).toBe(14);
    expect(resolveAlgiEnrichmentBatchSize('public', 'scion-public', 14, 1)).toBe(1);
    expect(resolveAlgiEnrichmentBatchSize('openai', 'gpt-5.4-mini', 14, 4)).toBe(4);
  });

  it('does not schedule a sampled voice pass for the zero-model route', () => {
    expect(supportsModelVoicePass('algi-v0')).toBe(false);
    expect(supportsModelVoicePass('scion-public')).toBe(true);
    expect(supportsModelVoicePass('gpt-5.4-mini')).toBe(true);
  });
});

describe('Algi V0 prompt reading', () => {
  it('recovers the source and the pinned session count', () => {
    const prompt = promptFor(SYLLABUS, 6);
    expect(extractSourceFromPrompt(prompt)).toContain('Week 1: How environmental problems');
    expect(extractSourceFromPrompt(prompt)).not.toContain('Return ONLY the skeleton');
    expect(extractExpectedSessions(prompt)).toBe(6);
  });

  it('reads the course name from an explicit label', () => {
    expect(extractCourseName(SYLLABUS)).toBe('Introduction to Environmental Policy');
  });

  it('separates a concise course title from an inline quick-start brief', () => {
    expect(
      extractCourseName(
        'Environmental Microbiology — a five-lesson upper-division course for environmental science students.',
      ),
    ).toBe('Environmental Microbiology');
  });
});

describe('Algi V0 skeleton composition', () => {
  it('transcribes the instructor’s own weekly topics', () => {
    const topics = planSessionTopics(SYLLABUS, 6);
    expect(topics).toHaveLength(6);
    expect(topics[0].toLowerCase()).toContain('environmental problems');
    expect(topics[1].toLowerCase()).toContain('common-pool');
    expect(new Set(topics.map((t) => t.toLowerCase())).size).toBe(6);
  });

  it('transcribes an explicit Session N outline from the quick-start brief', () => {
    const source = `Course: Introduction to Quantum Computing

Session 1: Qubits and quantum states
Session 2: Superposition and measurement
Session 3: Quantum gates and circuits
Session 4: Quantum entanglement
Session 5: Quantum algorithms
Session 6: Quantum error correction`;
    expect(planSessionTopics(source, 6)).toEqual([
      'Qubits and quantum states',
      'Superposition and measurement',
      'Quantum gates and circuits',
      'Quantum entanglement',
      'Quantum algorithms',
      'Quantum error correction',
    ]);
  });

  it('transcribes an inline numbered lesson sequence after a natural-language build request', () => {
    const source =
      'Environmental Microbiology — a five-lesson upper-division course. Build exactly five lessons: 1) Microbial ecology, 2) Waterborne pathogens, 3) Biofilms, 4) Bioremediation, and 5) Microbial risk assessment. Emphasize field evidence.';
    expect(planSessionTopics(source, 5)).toEqual([
      'Microbial ecology',
      'Waterborne pathogens',
      'Biofilms',
      'Bioremediation',
      'Microbial risk assessment',
    ]);
    const skeleton = JSON.parse(composeAlgiSkeleton(promptFor(source, 5)));
    expect(skeleton.course.name).toBe('Environmental Microbiology');
    expect(skeleton.sessions.map((session) => session.title)).toEqual([
      'Microbial ecology',
      'Waterborne pathogens',
      'Biofilms',
      'Bioremediation',
      'Microbial risk assessment',
    ]);
  });

  it('satisfies the same skeleton contract Scion is asked for', () => {
    const skeleton = JSON.parse(composeAlgiSkeleton(promptFor(SYLLABUS, 6)));
    expect(validateAgainstSchema(skeleton, 6)).toEqual([]);
    expect(skeleton.course.name).toBe('Introduction to Environmental Policy');
    expect(skeleton.sessions.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('fills a session count larger than the source outline without repeating a title', () => {
    const skeleton = JSON.parse(composeAlgiSkeleton(promptFor(SYLLABUS, 10)));
    expect(validateAgainstSchema(skeleton, 10)).toEqual([]);
    const titles = skeleton.sessions.map((s) => s.title.toLowerCase());
    expect(new Set(titles).size).toBe(10);
  });

  it('varies the opening section frame between consecutive sessions', () => {
    const skeleton = JSON.parse(composeAlgiSkeleton(promptFor(SYLLABUS, 6)));
    const openers = skeleton.sessions.map((s) => s.sectionTitles[0].replace(/\s.*$/, ''));
    // Repetition starts in the frame, not the noun: neighbours must differ.
    expect(openers[0]).not.toBe(openers[1]);
    expect(new Set(openers).size).toBeGreaterThan(1);
  });

  it('keeps a compound UX topic intact instead of ending a section title on a dangling conjunction', () => {
    const source = `Course: User Experience Design Studio
Lesson 1: User research
Lesson 2: Information architecture and interaction flows
Lesson 3: Iterative prototyping`;
    const skeleton = JSON.parse(composeAlgiSkeleton(promptFor(source, 3)));
    expect(skeleton.sessions[1].sectionTitles).toContain('How information architecture and interaction flows works');
    expect(skeleton.sessions[1].sectionTitles.join('\n')).not.toMatch(/\band (?:is|works)\b/i);
    expect(validateAgainstSchema(skeleton, 3)).toEqual([]);
  });

  it('survives a source with no recognizable outline', () => {
    const skeleton = JSON.parse(composeAlgiSkeleton(promptFor('A short course about soil.', 3)));
    expect(validateAgainstSchema(skeleton, 3)).toEqual([]);
    expect(skeleton.sessions).toHaveLength(3);
  });
});

describe('Algi V0 request routing', () => {
  it('composes the Pass A skeleton', async () => {
    const composed = await composeAlgiResponse({ task: 'nativeSkeleton', userPrompt: promptFor(SYLLABUS, 6) });
    expect(composed.text).toContain('"sessions"');
  });

  it('declines an unknown task so the compiler owns it, rather than inventing content', async () => {
    expect((await composeAlgiResponse({ task: 'voicePass', userPrompt: 'anything' })).text).toBe('');
    expect((await composeAlgiResponse({})).text).toBe('');
  });

  it('returns nothing for enrichment when no structured lessons are supplied', async () => {
    const composed = await composeAlgiResponse({ task: 'blueprintEnrichment', structuredPrompt: null });
    expect(composed.text).toBe('');
    // Coverage is reported even when it is zero, so a blocked package explains itself.
    // researched counts lessons the genome could not hold and the network did.
    expect(composed.coverage).toEqual({ covered: 0, requested: 0, uncovered: [], researched: 0, researchNote: '' });
  });
});

describe('Algi V0 workspace adviser', () => {
  const systemPrompt = `**Course Title:** Introduction to Quantum Computing

**Course Outline:**
1. Lesson 1: Qubits and quantum states
2. Lesson 2: Superposition and measurement
3. Lesson 3: Quantum gates and circuits`;

  it('explains the actual mapped assessment cadence instead of returning a connection notice', () => {
    const response = composeAlgiAdvisoryResponse({
      messages: [{ role: 'user', content: 'Explain the assessment strategy' }],
      systemPrompt: `## Tool rules
1. Inspect before acting
2. Verify after acting

${systemPrompt}

**User's Current View:** Course Map

## More rules
1. Never invent an edit`,
    });
    expect(response).toContain('uses one aligned checkpoint');
    expect(response).toContain('3 lessons');
    expect(response).toContain('Assignment Briefs');
    expect(response).toContain('moving from “Qubits and quantum states” to “Quantum gates and circuits”');
    expect(response).not.toContain('Inspect before acting');
    expect(response).not.toContain('I’m connected');
  });

  it('reads the Agent tool prompt’s dynamic course block without treating static rules as lessons', () => {
    const response = composeAlgiAdvisoryResponse({
      messages: [{ role: 'user', content: 'Explain the assessment strategy' }],
      systemPrompt: {
        staticPart: '## PROTOCOL\\n1. Inspect before acting\\n2. Verify after acting',
        dynamicPart: `## COURSE
**Introduction to Quantum Computing** | TBD | 3 lessons
**Lessons:**
  Lesson 1: "Qubits and quantum states" (toolIndex=0)
  Lesson 2: "Superposition and measurement" (toolIndex=1)
  Lesson 3: "Quantum gates and circuits" (toolIndex=2)
**Fields:** learningObjectives, weeklyAssessments`,
      },
    });
    expect(response).toContain('Introduction to Quantum Computing');
    expect(response).toContain('moving from “Qubits and quantum states” to “Quantum gates and circuits”');
    expect(response).not.toContain('Inspect before acting');
  });

  it('summarizes the mapped sequence without inventing subject facts', () => {
    const response = composeAlgiAdvisoryResponse({
      messages: [{ role: 'user', content: 'Summarize the course sequence' }],
      systemPrompt,
    });
    expect(response).toContain(
      'Qubits and quantum states → Superposition and measurement → Quantum gates and circuits',
    );
    expect(response).toContain('3 mapped lessons');
  });

  it('detects generic titles in an Algi structural audit', () => {
    const response = composeAlgiAdvisoryResponse({
      messages: [{ role: 'user', content: 'Audit this course for gaps' }],
      systemPrompt: `**Course Title:** Test

1. Lesson 1: Session 1 topic
2. Lesson 2: Specific topic`,
    });
    expect(response).toContain('1 generic title');
  });
});

describe('Algi V0 discipline boundary', () => {
  it('rejects a same-word genome hit from the wrong course discipline', () => {
    const index = {
      kernels: new Map([
        ['geo/superposition', { discipline: 'geo' }],
        ['physics/dc-circuits', { discipline: 'physics' }],
        ['cs/quantum-algorithm', { discipline: 'cs' }],
      ]),
    };
    expect(
      constrainConceptIdsToDisciplines(['geo/superposition', 'physics/dc-circuits', 'cs/quantum-algorithm'], index, [
        'cs',
      ]),
    ).toEqual(['cs/quantum-algorithm']);
    expect(constrainConceptIdsToDisciplines(['geo/superposition'], index, [])).toEqual(['geo/superposition']);
  });

  it('ranks the lesson head concept above a generic modifier match', () => {
    const diseaseTransmission = {
      term: 'Modes of disease transmission',
      aliases: ['pathogen transmission'],
      definition: { text: 'Pathogens can move between hosts through food, water, air, vectors, and contact.' },
    };
    const immunity = {
      term: 'Innate and adaptive immunity',
      aliases: ['immune defenses'],
      definition: { text: 'Adaptive immunity is specific for individual microbial pathogens.' },
    };
    const fluidBalance = {
      term: 'Fluid and electrolyte balance',
      aliases: ['body water balance'],
      definition: { text: 'Fluid balance regulates water and dissolved electrolytes in the body.' },
    };
    expect(kernelTopicOverlapScore(diseaseTransmission, 'Waterborne pathogens')).toBeGreaterThan(
      kernelTopicOverlapScore(immunity, 'Waterborne pathogens'),
    );
    expect(kernelTopicOverlapScore(immunity, 'Waterborne pathogens')).toBeGreaterThan(
      kernelTopicOverlapScore(fluidBalance, 'Waterborne pathogens'),
    );
    expect(
      kernelTopicOverlapScore(
        {
          term: 'Microbial mat',
          definition: { text: 'A microbial mat is a layered community of microorganisms.' },
        },
        'Microbial risk assessment',
      ),
    ).toBeLessThan(3);
  });
});

describe('Algi V0 source sentence compaction', () => {
  it('keeps complete source clauses and rejects arbitrary word cuts', () => {
    expect(
      fitSourceFact(
        'The measurement problem concerns how observations produce definite outcomes, while a much longer continuation explains several competing interpretations and their consequences for every possible experimental observation in detail.',
      ),
    ).toBe('The measurement problem concerns how observations produce definite outcomes.');
    expect(
      fitSourceFact(
        'If observers and their measuring apparatus are themselves described by a deterministic wave function, why can we not predict precise outcomes from every observation?',
      ),
    ).toBe('');
  });

  it('rejects detached pronouns and uses the longest self-contained source clause', () => {
    expect(fitSourceFact('This follows from an earlier claim that is not present in the exported lesson.')).toBe('');
    expect(fitSourceFact('It is a generalization of a state vector used by the surrounding article.')).toBe('');
    expect(
      fitSourceFact(
        'In quantum mechanics, the measurement problem is the problem of definite outcomes: quantum systems have superpositions but measurements give one definite result.',
      ),
    ).toBe('In quantum mechanics, the measurement problem is the problem of definite outcomes.');
  });

  it('does not let an overlong example become a dangling clause', () => {
    expect(
      fitSourceSentence(
        'They are different from other types of entangled states such as GHZ states or W states in that it is more difficult to eliminate quantum entanglement via projective measurements in.',
        [5, 30],
      ),
    ).toBe('');
    expect(
      fitSourceSentence(
        'Cluster states support measurement-based quantum computing; the remaining source sentence continues with details beyond the compact lesson contract.',
        [5, 12],
      ),
    ).toBe('Cluster states support measurement-based quantum computing.');
  });

  it('rejects a punctuated prepositional phrase with no finite predicate', () => {
    expect(fitSourceFact('In quantum computing and specifically the quantum circuit model of computation.')).toBe('');
    expect(fitSourceFact('Given a pure bipartite quantum state of the composite system.')).toBe('');
    expect(fitSourceFact('Together with quantum hypothesis testing, an important theoretical model.')).toBe('');
    expect(
      fitSourceFact(
        'In quantum information theory, a quantum circuit represents a sequence of gates and measurements.',
      ),
    ).toBe('In quantum information theory, a quantum circuit represents a sequence of gates and measurements.');
    expect(fitSourceFact('The toric code, and surface codes more generally.')).toBe('');
    expect(fitSourceFact('-qubit Hilbert space can be approximated by a sequence of universal gates.')).toBe('');
  });
});

describe('Algi V0 source receipts', () => {
  const kernel = (index, researched = false) => {
    const title = `Concept ${index}`;
    const sourceId = researched ? `wikipedia:${title}` : `openstax:test#${index}`;
    const anchor = (quote) => ({ src: sourceId, loc: title, quote, tier: 2 });
    const definition = `${title} is a source anchored idea with a distinct purpose in this instructional domain.`;
    return {
      id: researched ? `researched/concept-${index}` : `test/concept-${index}`,
      term: title,
      aliases: [],
      tags: ['test'],
      discipline: 'test',
      definition: { text: definition, anchor: anchor(definition), tier: 2 },
      facts: [1, 2].map((factIndex) => {
        const text = `${title} fact ${factIndex} explains a concrete relationship that learners can inspect in an applied case.`;
        return { text, anchor: anchor(text), tier: 2 };
      }),
      misconceptions: [
        {
          text: `Students stretch ${title} beyond the boundary this source draws around it.`,
          corrective: `${title} has a bounded source definition, so learners should distinguish its purpose, conditions, evidence, and consequences from neighbouring concepts.`,
        },
      ],
      examples: [
        { text: `${title} appears when a practitioner applies the source definition to a concrete decision.` },
      ],
      workedExamples: [],
      mcBank: [
        {
          stem: `A learner is comparing four source grounded descriptions before applying ${title} to a new case. Which option preserves the concept's defining boundary?`,
          options: [
            'The bounded source definition',
            'An unrelated neighbouring idea',
            'A generic workflow label',
            'An unsupported factual claim',
          ],
          answerIndex: 0,
          explanationFactRef: 0,
          rationaleRefs: [0],
        },
      ],
      edges: {},
      license: researched ? 'CC BY-SA 4.0' : 'CC BY 4.0',
      attribution: researched ? `Wikipedia contributors, “${title}”` : 'OpenStax contributors',
      provenance: researched
        ? {
            origin: 'algi-research',
            title,
            sourceUrl: `https://en.wikipedia.org/wiki/Concept_${index}`,
            revisionId: 1000 + index,
          }
        : { origin: 'genome' },
    };
  };

  it('carries researched attribution through the compact parser into the lesson overlay', () => {
    const payload = composeLessonFromKernels(
      { lessonId: 'lesson-1', title: 'Concepts in practice' },
      [kernel(1, true), kernel(2), kernel(3), kernel(4)],
      { factCount: 5 },
    );
    expect(payload.enrichmentSource).toBe('algi-researched');
    expect(payload.keyTerms.map((entry) => entry.mi).join(' ')).not.toMatch(/stretch|boundary this source/i);
    expect(payload.keyTerms[0].mi).toContain('Concept 1 and Concept 2');
    expect(payload.keyTerms[0].cx).toContain('not interchangeable');
    expect(payload.keyTerms[0].cx).toContain('Concept 1 refers to');
    expect(payload.keyTerms[0].cx).toContain('Concept 2 refers to');
    expect(payload.keyTerms[0].cx).not.toMatch(/^Not that/i);
    expect(payload.conceptProvenance.citations[0]).toMatchObject({
      sourceUrl: 'https://en.wikipedia.org/wiki/Concept_1',
      license: 'CC BY-SA 4.0',
      attribution: 'Wikipedia contributors, “Concept 1”',
      revisionId: '1001',
    });

    const parsed = parseLessonKernelResponse(JSON.stringify({ lessons: [payload] }), {
      prompt: { lessons: [{ lessonId: 'lesson-1', title: 'Concepts in practice' }] },
      expectedLessonIds: ['lesson-1'],
    });
    expect(parsed.lessons['lesson-1'].enrichmentSource).toBe('algi-researched');
    expect(parsed.lessons['lesson-1'].conceptProvenance.citations[0].sourceUrl).toBe(
      'https://en.wikipedia.org/wiki/Concept_1',
    );
    expect(parsed.lessons['lesson-1'].keyTerms).toHaveLength(3);
  });

  it('preserves a terminal pronoun when compacting a coordinated quiz option', () => {
    const kernels = [kernel(1), kernel(2), kernel(3)];
    kernels[0].mcBank[0].options[0] = 'Define the user goal and connect each interaction step to it';
    const payload = composeLessonFromKernels({ lessonId: 'lesson-1', title: 'Interaction decisions' }, kernels, {
      factCount: 5,
    });
    expect(payload.mc[0].op[0]).toBe('Define the user goal; connect each interaction step to it.');
    expect(payload.mc[0].op[0]).not.toMatch(/\bto\.$/i);
  });

  it('never fabricates a Wikipedia URL for a shipped genome source', () => {
    const sourceKernel = kernel(1);
    sourceKernel.definition.anchor.src = 'openstax:microbiology#16';
    sourceKernel.definition.anchor.loc = '16.3';
    sourceKernel.facts.forEach((fact) => {
      fact.anchor.src = 'openstax:microbiology#16';
      fact.anchor.loc = '16.3';
    });
    sourceKernel.attribution = ['OpenStax Microbiology, §16.3 Modes of Disease Transmission'];

    const withoutMetadata = composeLessonFromKernels(
      { lessonId: 'lesson-1', title: 'Waterborne pathogens' },
      [sourceKernel, kernel(2), kernel(3)],
      { factCount: 5 },
    );
    expect(withoutMetadata.conceptProvenance.citations[0]).toMatchObject({
      sourceUrl: '',
      attribution: 'OpenStax Microbiology, §16.3 Modes of Disease Transmission',
    });
    expect(withoutMetadata.conceptProvenance.citations[0].sourceUrl).not.toContain('wikipedia.org');

    const withMetadata = composeLessonFromKernels(
      { lessonId: 'lesson-1', title: 'Waterborne pathogens' },
      [sourceKernel, kernel(2), kernel(3)],
      {
        factCount: 5,
        sourceReferences: {
          'openstax:microbiology#16': {
            displayTitle: 'OpenStax Microbiology',
            sourceUrl: 'https://openstax.org/books/microbiology/pages/16-3-modes-of-disease-transmission',
          },
        },
      },
    );
    expect(withMetadata.conceptProvenance.citations[0]).toMatchObject({
      displayTitle: 'OpenStax Microbiology §16.3',
      sourceUrl: 'https://openstax.org/books/microbiology/pages/16-3-modes-of-disease-transmission',
    });
  });

  it('pins both named sides of a compound lesson before rotating support terms', () => {
    const kernels = [kernel(1, true), kernel(2, true), kernel(3, true), kernel(4, true)];
    ['Measurement problem', 'Linear combination', 'Quantum superposition', 'Measurement'].forEach((term, index) => {
      kernels[index].term = term;
      kernels[index].definition.text =
        `${term} is a source anchored concept with a distinct purpose in quantum mechanics.`;
    });
    const payload = composeLessonFromKernels(
      { lessonId: 'lesson-2', title: 'Superposition and measurement' },
      kernels,
      { factCount: 5, offset: 2 },
    );
    expect(payload.keyTerms.map((entry) => entry.tr)).toEqual(
      expect.arrayContaining(['Quantum superposition', 'Measurement']),
    );
  });

  it('keeps distinct researched subtypes instead of collapsing them into one broad term', () => {
    const kernels = [kernel(1, true), kernel(2, true), kernel(3, true)];
    ['Biofilm', 'Phototrophic biofilm', 'Moving-bed biofilm reactor'].forEach((term, index) => {
      kernels[index].term = term;
      kernels[index].definition.text =
        `${term} is a source anchored environmental microbiology concept with a distinct mechanism and scope.`;
    });
    const payload = composeLessonFromKernels({ lessonId: 'lesson-3', title: 'Biofilms' }, kernels, { factCount: 5 });
    expect(payload).not.toBeNull();
    expect(payload.keyTerms.map((entry) => entry.tr)).toEqual([
      'Biofilm',
      'Phototrophic biofilm',
      'Moving-bed biofilm reactor',
    ]);
  });

  it('skips an overlong researched title instead of exporting a clipped preposition', () => {
    const kernels = [kernel(1, true), kernel(2, true), kernel(3, true), kernel(4, true)];
    ['Biofilm', 'Application of biofilms in industry', 'Phototrophic biofilm', 'Floc'].forEach((term, index) => {
      kernels[index].term = term;
      kernels[index].definition.text =
        `${term} is a source anchored environmental microbiology concept with a distinct mechanism and scope.`;
    });
    const payload = composeLessonFromKernels({ lessonId: 'lesson-3', title: 'Biofilms' }, kernels, { factCount: 5 });
    expect(payload).not.toBeNull();
    expect(payload.keyTerms.map((entry) => entry.tr)).toEqual(['Biofilm', 'Phototrophic biofilm', 'Floc']);
    expect(JSON.stringify(payload)).not.toContain('Application of biofilms in.');
  });

  it('finds a composable grounded subset behind an uncomposable provider prefix', () => {
    const kernels = [1, 2, 3, 4, 5, 6].map((index) => kernel(index, true));
    for (const candidate of kernels.slice(0, 3)) {
      candidate.facts = candidate.facts.map((fact) => ({
        ...fact,
        text: 'A source fragment about a concept boundary without a finite instructional claim.',
      }));
    }
    expect(
      composeLessonFromKernels({ lessonId: 'lesson-1', title: 'Evidence families' }, kernels, { factCount: 5 }),
    ).toBeNull();
    const payload = composeLessonFromCandidateKernels({ lessonId: 'lesson-1', title: 'Evidence families' }, kernels, {
      factCount: 5,
    });
    expect(payload).not.toBeNull();
    expect(payload.keyTerms.map((entry) => entry.tr)).not.toEqual(['Concept 1', 'Concept 2', 'Concept 3']);
    expect(payload.keyTerms.map((entry) => entry.tr)).toContain('Concept 4');
  });

  it('composes microbial risk assessment only from risk-matched grounded concepts', () => {
    const kernels = [kernel(1, true), kernel(2, true), kernel(3, true), kernel(4, true)];
    const concepts = [
      {
        term: 'Quantitative microbial risk assessment',
        definition:
          'Quantitative microbial risk assessment has become a central framework for estimating infection risk from environmental exposure.',
        facts: [
          'Quantitative microbial risk assessment estimates infection risk by combining hazard, exposure, dose-response, and risk characterization evidence.',
          'Microbial risk estimates state assumptions and uncertainty so decision makers can interpret the resulting probability.',
        ],
      },
      {
        term: 'Biofilm',
        definition:
          'Biofilm is a microbial community attached to a surface and embedded within a self-produced matrix.',
        facts: [
          'Biofilms alter transport and microbial persistence on wet surfaces.',
          'Biofilm structure can protect embedded cells from environmental stress.',
        ],
      },
      {
        term: 'Risk assessment',
        definition:
          'Risk assessment is a structured process for identifying hazards and estimating the likelihood and consequences of harm.',
        facts: [
          'Risk assessment separates hazard identification from exposure and consequence estimates.',
          'A transparent risk assessment records evidence limits before supporting a management decision.',
        ],
      },
      {
        term: 'Exposure assessment',
        definition:
          'Exposure assessment is the process of estimating how often and how strongly people contact a microbial hazard.',
        facts: [
          'Exposure assessment links a microbial concentration with contact frequency, duration, and route.',
          'Exposure scenarios make the pathway from environmental measurement to estimated dose explicit.',
        ],
      },
    ];
    kernels.forEach((candidate, index) => {
      candidate.term = concepts[index].term;
      candidate.definition.text = concepts[index].definition;
      candidate.provenance.topic = index === 1 ? 'Biofilms' : 'Microbial risk assessment';
      candidate.facts = concepts[index].facts.map((text) => ({
        text,
        anchor: candidate.definition.anchor,
        tier: 2,
      }));
    });

    const payload = composeLessonFromCandidateKernels(
      { lessonId: 'lesson-5', title: 'Microbial risk assessment' },
      kernels,
      { factCount: 5 },
    );

    expect(payload).not.toBeNull();
    expect(payload.keyTerms.map((entry) => entry.tr)).toEqual([
      'Quantitative microbial risk assessment',
      'Risk assessment',
      'Exposure assessment',
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/\bbiofilm\b/i);
  });
});
