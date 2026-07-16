import { describe, expect, it } from 'vitest';

import {
  findScionIncompleteExplanationTail,
  repairScionEnrichmentAnswerKeys,
  repairScionMcItem,
} from '../src/lib/scionAnswerKeyAlignment.js';

const TRUNCATED_CONFLICT = {
  q: 'How do teams translate stable user needs into actionable product work?',
  op: [
    'By modeling task flows before research',
    'By creating user stories that describe features',
    'By keeping needs separate from stories',
    'By focusing only on interface requests',
  ],
  ai: 3,
  ex: 'Creating user stories that describe features turns stable needs into actionable product work. Focusing only on interface requests is too narrow because',
};

describe('Scion MC contract recovery', () => {
  it('retains only complete model-authored sentences and then realigns a decisive key', () => {
    const repaired = repairScionMcItem(TRUNCATED_CONFLICT, { lessonId: 'lesson-2', itemIndex: 1 });
    expect(repaired.item).toMatchObject({
      ai: 1,
      ex: 'Creating user stories that describe features turns stable needs into actionable product work.',
    });
    expect(repaired.repairs.map((entry) => entry.pass)).toEqual([
      'incompleteExplanationTail',
      'explanationKeyAlignment',
    ]);
    expect(repaired.repairs[0]).toMatchObject({
      trainingEligible: false,
      action: 'trimmed-incomplete-tail',
      recoveryEvidence: {
        verified: true,
        removedTail: 'Focusing only on interface requests is too narrow because',
      },
    });
    expect(repaired.repairs[1]).toMatchObject({
      trainingEligible: true,
      rejected: { answerIndex: 3 },
      chosen: { answerIndex: 1 },
    });
  });

  it('does not invent a boundary when the model returned no complete sentence', () => {
    const explanation = 'Creating user stories that describe features turns stable needs into actionable product work';
    expect(findScionIncompleteExplanationTail(explanation)).toBeNull();
    expect(repairScionMcItem({ ...TRUNCATED_CONFLICT, ex: explanation }, { realignAnswerKey: false }).repairs).toEqual(
      [],
    );
  });

  it('does not mistake a common abbreviation for a recoverable sentence boundary', () => {
    const explanation = 'The Dr. Smith example continues without a completed sentence';
    expect(findScionIncompleteExplanationTail(explanation)).toBeNull();
  });

  it('preserves complete explanations byte-for-byte', () => {
    const complete = {
      ...TRUNCATED_CONFLICT,
      ai: 1,
      ex: 'Creating user stories turns stable needs into product work.',
    };
    const repaired = repairScionMcItem(complete);
    expect(repaired.item).toBe(complete);
    expect(repaired.repairs).toEqual([]);
  });

  it('persists both repairs and their provenance when an enrichment graph is reopened', () => {
    const enrichment = {
      lessonContent: {
        'lesson-2': {
          quizItems: [{ ...TRUNCATED_CONFLICT, type: 'multiple_choice' }],
        },
      },
    };
    const result = repairScionEnrichmentAnswerKeys(enrichment);
    expect(result.enrichment.lessonContent['lesson-2'].quizItems[0]).toMatchObject({
      ai: 1,
      ex: 'Creating user stories that describe features turns stable needs into actionable product work.',
    });
    expect(result.enrichment.semanticRepairs.map((entry) => entry.pass)).toEqual([
      'incompleteExplanationTail',
      'explanationKeyAlignment',
    ]);
    expect(enrichment.lessonContent['lesson-2'].quizItems[0]).toEqual({
      ...TRUNCATED_CONFLICT,
      type: 'multiple_choice',
    });
  });

  it('realigns a short answer when the explanation explicitly names the correct option text', () => {
    const repaired = repairScionMcItem({
      q: 'Which process transports sediment away from its source?',
      op: ['Mechanical weathering', 'Chemical weathering', 'Erosion', 'Deposition'],
      ai: 0,
      ex: 'Erosion is the correct choice because water, wind, gravity, or ice moves sediment away.',
    });
    expect(repaired.item.ai).toBe(2);
    expect(repaired.repairs[0]).toMatchObject({
      pass: 'explanationKeyAlignment',
      preferenceEvidence: {
        supportMethod: 'explicit-explanation-cue',
        declaredIndex: 0,
        supportedIndex: 2,
      },
    });
  });

  it('realigns when the exact option starts a non-negative affirmative explanation', () => {
    const repaired = repairScionMcItem({
      q: 'What combines different sounds to generate new musical ideas?',
      op: ['A. Musical form', 'B. Chord construction', 'C. Harmony', 'D. Rhythmic structure'],
      ai: 0,
      ex: 'Harmony is the concept of combining different sounds to create new musical ideas.',
    });
    expect(repaired.item.ai).toBe(2);
    expect(repaired.repairs[0].preferenceEvidence).toMatchObject({
      supportMethod: 'explicit-explanation-cue',
      explicitCues: [expect.objectContaining({ type: 'explicit-affirmative-lead' })],
    });
  });

  it('ignores an exact-option lead when it marks the option as a misconception', () => {
    const item = {
      q: 'What combines different sounds to generate new musical ideas?',
      op: ['Musical form', 'Chord construction', 'Harmony', 'Rhythmic structure'],
      ai: 2,
      ex: 'Chord construction is a misconception because harmony is the broader concept.',
    };
    expect(repairScionMcItem(item)).toEqual({ item, repairs: [] });
  });

  it('matches an explicitly correct option despite display punctuation', () => {
    const repaired = repairScionMcItem({
      q: 'Which activity belongs in usability evaluation?',
      op: [
        'Checking conformance alone.',
        'Observing users completing realistic tasks.',
        'Generalizing one participant.',
        'Skipping representative tasks.',
      ],
      ai: 0,
      ex: 'Observing users completing realistic tasks is correct because it reveals task-level barriers.',
    });
    expect(repaired.item.ai).toBe(1);
  });

  it('realigns from an explicit option label even when option wording has little lexical overlap', () => {
    const repaired = repairScionMcItem({
      q: 'What results when directed stress aligns mineral crystals?',
      op: ['Crystalline structure', 'Foliation', 'Melting', 'Erosion'],
      ai: 3,
      ex: 'Option B is correct because directed stress produces planar foliation.',
    });
    expect(repaired.item.ai).toBe(1);
    expect(repaired.repairs[0].preferenceEvidence).toMatchObject({
      supportMethod: 'explicit-explanation-cue',
      supportedIndex: 1,
    });
  });

  it('can replay the pre-explicit-cue historical contract without rewriting old receipts', () => {
    const item = {
      q: 'What results when directed stress aligns mineral crystals?',
      op: ['Crystalline structure', 'Foliation', 'Melting', 'Erosion'],
      ai: 3,
      ex: 'Option B is correct because directed stress produces planar foliation.',
    };
    expect(repairScionMcItem(item, { keyConflictOptions: { allowExplicitCues: false } })).toEqual({
      item,
      repairs: [],
    });
  });

  it('realigns when the exact displayed option is explicitly marked correct', () => {
    const repaired = repairScionMcItem({
      q: 'Which cooling scenario usually creates fine-grained igneous rock?',
      op: [
        'Slow cooling deep within the crust.',
        'Rapid cooling at or near the surface.',
        'Slow cooling at the surface.',
        'Rapid cooling deep within the crust.',
      ],
      ai: 3,
      ex: 'Rapid cooling at or near the surface. (Correct) This produces crystals too small to grow large.',
    });
    expect(repaired.item.ai).toBe(1);
    expect(repaired.repairs[0].preferenceEvidence.supportMethod).toBe('explicit-explanation-cue');
  });

  it.each([
    {
      name: 'morphological support for a returned file object',
      item: {
        q: 'What is the primary action performed by the open() function?',
        op: ['reading data from a file', 'writing information into files', 'closing a file', 'returning a file object'],
        ai: 1,
        ex: 'open() returns a file object that the program then reads from or writes to. The misconception is thinking open() immediately performs the read or write operation.',
      },
      supportedIndex: 3,
      scores: [2, 1, 1, 3],
    },
    {
      name: 'a short first-sentence position cue',
      item: {
        q: 'Which characteristic describes how elements within a list are accessed?',
        op: [
          'Elements are accessed via a key.',
          'Elements are accessed by their position.',
          'Elements are accessed by a label.',
          'Elements are accessed by a name.',
        ],
        ai: 2,
        ex: 'Accessing an element directly using its position in the sequence.',
      },
      supportedIndex: 1,
      scores: [2, 3, 2, 2],
    },
    {
      name: 'a unique two-token hazard cue',
      item: {
        q: 'What hazard is most characteristic of explosive high-silica volcanoes?',
        op: ['Lava flow', 'Pyroclastic flow', 'Gentle effusion', 'Syrup-like flow'],
        ai: 3,
        ex: 'The most dangerous volcanic hazard is the pyroclastic flow, a fast cloud of hot ash and gas typical of explosive high-silica volcanoes. (Misconception: Lava flow is the most dangerous hazard.)',
      },
      supportedIndex: 1,
      scores: [1, 2, 0, 1],
    },
  ])('realigns from $name without reading later distractor prose', ({ item, supportedIndex, scores }) => {
    const repaired = repairScionMcItem(item);
    expect(repaired.item.ai).toBe(supportedIndex);
    expect(repaired.repairs[0].preferenceEvidence).toMatchObject({
      supportMethod: 'first-sentence-lexical-margin',
      declaredIndex: item.ai,
      supportedIndex,
      scores,
      minimumBestScore: 2,
      minimumMargin: 1,
      evidenceSentence: expect.any(String),
    });
  });

  it('can replay the pre-first-sentence contract without rewriting historical receipts', () => {
    const item = {
      q: 'What is the primary action performed by the open() function?',
      op: ['reading data from a file', 'writing information into files', 'closing a file', 'returning a file object'],
      ai: 1,
      ex: 'open() returns a file object that the program then reads from or writes to.',
    };
    expect(repairScionMcItem(item, { keyConflictOptions: { allowFirstSentenceLexicalCue: false } })).toEqual({
      item,
      repairs: [],
    });
  });

  it.each([
    {
      name: 'generic correct-choice prose that does not identify an option',
      item: {
        q: 'When creating an experience map, what should be made visible?',
        op: [
          'Only the successful paths users take.',
          'Struggle points and candidate improvement areas.',
          'The exact technical specifications of the service.',
          'The final, desired outcome only.',
        ],
        ai: 2,
        ex: 'The correct choice highlights the need to identify areas for enhancement, unlike the misconception that the map only focuses on successful paths.',
      },
    },
    {
      name: 'an explicit label that must outrank lexical overlap',
      item: {
        q: 'Which signal arrives first at a seismic station?',
        op: ['Surface waves', 'Shear waves', 'Primary waves', 'Tsunami waves'],
        ai: 2,
        ex: 'Option C is correct. Shear waves arrive after the primary waves.',
      },
    },
    {
      name: 'a negative first sentence about a distractor',
      item: {
        q: 'Which process transports sediment away from its source?',
        op: ['Mechanical weathering', 'Chemical weathering', 'Erosion', 'Deposition'],
        ai: 2,
        ex: 'Chemical weathering is not the transport process. Erosion moves sediment away from its source.',
      },
    },
  ])('refuses $name', ({ item }) => {
    expect(repairScionMcItem(item)).toEqual({ item, repairs: [] });
  });

  it.each([
    {
      name: 'an experience-map key contradicted by its uniquely relevant source claim',
      item: {
        q: 'When creating an experience map, what should be made visible?',
        op: [
          'Only the successful paths users take.',
          'Struggle points and candidate improvement areas.',
          'The exact technical specifications of the service.',
          'The final, desired outcome only.',
        ],
        ai: 2,
        ex: 'The correct choice highlights the need to identify areas for enhancement.',
      },
      sourceClaims: [
        "Journey mapping represents an end-to-end experience from the user's perspective.",
        'An experience map should make struggle points and candidate improvement areas visible.',
        'A map can reveal dead ends where the user cannot continue toward the larger goal.',
      ],
      supportedIndex: 1,
    },
    {
      name: 'an absolute-dating key contradicted despite a related source distractor',
      item: {
        q: 'What does absolute dating provide regarding mineral grains in a rock?',
        op: [
          'A numerical age in years',
          'A relative order of events',
          "The span of Earth's history",
          'The sequence of deposition',
        ],
        ai: 1,
        ex: 'Absolute dating assigns specific ages in years to mineral grains within a rock.',
      },
      sourceClaims: [
        'Relative dating orders events by which is older or younger, while absolute dating assigns numerical ages.',
        'Absolute numerical dating assigns specific ages in years to mineral grains within a rock.',
        'The principle of superposition orders undisturbed layers from oldest to youngest.',
      ],
      supportedIndex: 0,
    },
  ])('realigns $name without changing model-authored text', ({ item, sourceClaims, supportedIndex }) => {
    const repaired = repairScionMcItem(item, { sourceClaims });
    expect(repaired.item).toEqual({ ...item, ai: supportedIndex });
    expect(repaired.repairs).toHaveLength(1);
    expect(repaired.repairs[0]).toMatchObject({
      pass: 'sourceAnswerAlignment',
      action: 'realigned',
      preferenceEvidence: {
        kind: 'deterministic-source-answer-conflict',
        supportMethod: 'source-question-option-alignment',
        declaredIndex: item.ai,
        supportedIndex,
        minimumQuestionClaimScore: 3,
        minimumOptionScore: 3,
        minimumOptionContainment: 0.6,
        maximumDeclaredOptionScore: 1,
        minimumMargin: 2,
      },
    });
  });

  it.each([
    {
      name: 'the caller supplies no source boundary',
      item: {
        q: 'When creating an experience map, what should be made visible?',
        op: ['Successful paths', 'Struggle points and improvement areas', 'Technical specifications', 'Final outcomes'],
        ai: 2,
        ex: 'The correct choice should reveal areas for enhancement.',
      },
      sourceClaims: [],
    },
    {
      name: 'the stem asks for the unsupported exception',
      item: {
        q: 'Which option is not provided by absolute dating?',
        op: ['A numerical age in years', 'A measured age', 'A date in years', 'A relative order of events'],
        ai: 0,
        ex: 'The question asks for an exception to the source-supported descriptions.',
      },
      sourceClaims: ['Absolute dating assigns a numerical age in years to mineral grains.'],
    },
    {
      name: 'two options receive equal source support',
      item: {
        q: 'What does absolute dating provide for a rock sample?',
        op: ['A numerical age in years', 'An age measured in years', 'A relative order', 'A depositional sequence'],
        ai: 2,
        ex: 'The source describes a measured numerical result.',
      },
      sourceClaims: ['Absolute dating provides a numerical age measured in years for a rock sample.'],
    },
    {
      name: 'a longer paraphrase competes with the short canonical term',
      item: {
        q: 'How are relationships between successive notes of a scale referred to?',
        op: ['Intervals between successive notes', 'Scale steps', 'Frequency ratios', 'Pitch differences'],
        ai: 2,
        ex: 'The source uses one of these two equivalent descriptions for the relationship.',
      },
      sourceClaims: ['Intervals between successive notes of a scale are also known as scale steps.'],
    },
  ])('refuses source-key repair when $name', ({ item, sourceClaims }) => {
    expect(repairScionMcItem(item, { sourceClaims })).toEqual({ item, repairs: [] });
  });

  it('never treats a sentence that marks an option incorrect as affirmative lexical support', () => {
    const item = {
      q: 'Before a research session, what should expose procedure problems?',
      op: [
        'Run test tasks with participants on the session day.',
        'Agree on broad goals without rehearsing.',
        'Conduct a practice session with a team member.',
        'Only test the prototype end-to-end.',
      ],
      ai: 3,
      ex: 'Running tasks on the day is incorrect because researchers should rehearse earlier. The correct choice involves a practice session to expose procedure problems.',
    };
    expect(repairScionMcItem(item)).toEqual({ item, repairs: [] });

    const sourceClaims = [
      'Conduct a practice session with a team member before research to expose procedure problems.',
    ];
    const repaired = repairScionMcItem(item, { sourceClaims });
    expect(repaired.item.ai).toBe(2);
    expect(repaired.repairs[0].pass).toBe('sourceAnswerAlignment');
  });

  it('lets a uniquely source-confirmed key block a contradictory explanation-only repair', () => {
    const item = {
      q: 'What defines the major silicate structures in rock-forming minerals?',
      op: [
        'Isolated tetrahedra',
        'Chains, sheets, or three-dimensional frameworks',
        "The silicon-oxygen tetrahedron's bonding pattern",
        'The abundance of silicon-oxygen atoms',
      ],
      ai: 2,
      ex: 'Chains, sheets, or three-dimensional frameworks',
    };
    const sourceClaims = [
      'Silicate minerals, built from the silicon-oxygen tetrahedron, are rock-forming minerals; the way tetrahedra link together defines the major silicate structures.',
      'Tetrahedra can link into chains, sheets, or three-dimensional frameworks.',
    ];
    expect(repairScionMcItem(item)).toMatchObject({ item: { ai: 1 } });
    expect(repairScionMcItem(item, { sourceClaims })).toEqual({ item, repairs: [] });
  });

  it('does not repair from an explicit cue that already supports the declared key', () => {
    const item = {
      q: 'Which layer lies below the crust and above the core?',
      op: ['Mantle', 'Crust', 'Inner core', 'Outer core'],
      ai: 0,
      ex: 'The correct choice is Mantle because it lies between the crust and the core.',
    };
    expect(repairScionMcItem(item)).toEqual({ item, repairs: [] });
  });

  it('does not treat a later misconception as affirmative answer support', () => {
    const item = {
      q: 'Which boundary creates new lithosphere as plates move apart?',
      op: ['Convergent boundary', 'Transform boundary', 'Divergent boundary', 'Subduction zone'],
      ai: 2,
      ex: 'Divergent boundary is the correct choice because the plates separate. Misconception: Transform boundary is correct whenever plates move.',
    };
    expect(repairScionMcItem(item)).toEqual({ item, repairs: [] });
  });

  it('refuses to guess when the affirmative explanation marks two options correct', () => {
    const item = {
      q: 'Which structure should the program use for a two-way branch?',
      op: ['if-else', 'for loop', 'while loop', 'function'],
      ai: 3,
      ex: 'Option A is correct. The correct choice is B.',
    };
    expect(repairScionMcItem(item)).toEqual({ item, repairs: [] });
  });
});
