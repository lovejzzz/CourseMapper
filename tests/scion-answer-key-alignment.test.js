import { describe, expect, it } from 'vitest';

import {
  findScionCitedSourceKeyMismatch,
  findScionEquivalentComparisonOptionPair,
  findScionEquivalentEquationOptionPair,
  findScionExplanationKeyConflict,
  findScionIncompleteExplanationTail,
  findScionMultipleExplanationSupportedOptions,
  findScionMultipleSourceSupportedOptions,
  findScionNearDuplicateOptionPair,
  findScionSourceAnswerConflict,
  findScionSourceAnswerSupport,
  findScionUnsupportedScopeOption,
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
  it.each([
    {
      name: 'a high-overlap role-swapped mantle distractor',
      item: {
        q: 'Which proposition preserves the distinguishing behavior of the mantle rock?',
        op: [
          'Solid mantle rock can flow slowly',
          'Rigid lithospheric plates can flow slowly',
          'Mantle convection moves above rigid lithospheric plates',
          'Heat transfer sustains rigid lithospheric plates',
        ],
        ai: 0,
        ex: 'Mantle rock remains solid yet can flow slowly beneath moving rigid lithospheric plates.',
      },
      sourceClaims: [
        'Rigid lithospheric plates move above mantle rock that remains solid yet can flow slowly, while heat transfer sustains mantle convection.',
      ],
    },
    {
      name: 'equivalent no-base-case and without-base-case scope',
      item: {
        q: 'A trace states that no base case stops the self-calls; which classification follows?',
        op: [
          'Never terminates and overflows the call stack',
          'Terminates before overflowing the call stack',
          'Reaches a base case and then terminates',
          'Calls itself once on a smaller input',
        ],
        ai: 0,
        ex: 'Self-calls lacking a stopping base case never terminate and overflow the call stack.',
      },
      sourceClaims: [
        'Without a base case that stops the self-calls, recursion never terminates and overflows the call stack.',
      ],
    },
    {
      name: 'a negation-preserving duplicate-key claim',
      item: {
        q: 'A design uses duplicate keys; how should it be classified?',
        op: [
          'It cannot be a dictionary as presented',
          'It is a dictionary with duplicate keys',
          'It is ideal for naturally ordered data',
          'It looks up keys by each value',
        ],
        ai: 0,
        ex: 'A dictionary cannot hold duplicate keys because it looks up values using keys.',
      },
      sourceClaims: ['Because a dictionary looks up values using keys, it cannot hold duplicate keys.'],
    },
    {
      name: 'structural both language that binds two observed details',
      item: {
        q: 'A Python design presents duplicate keys in curly-brace form; how should students classify it while respecting both observed details?',
        op: [
          'It cannot be a dictionary as presented',
          'It is a dictionary with duplicate keys',
          'It is ideal for naturally ordered data',
          'It looks up keys by each value',
        ],
        ai: 0,
        ex: 'A dictionary cannot hold duplicate keys because it looks up values using keys.',
      },
      sourceClaims: ['Because a dictionary looks up values using keys, it cannot hold duplicate keys.'],
    },
  ])('does not overrule a source-and-explanation-supported key for $name', ({ item, sourceClaims }) => {
    expect(findScionCitedSourceKeyMismatch(item, { sourceClaims, strict: true })).toBeNull();
  });

  it('finds a wrong base-model key beneath its stock evidence preamble', () => {
    const item = {
      q: 'A monopoly produces less and charges more than a competitive market; what structural reason creates deadweight loss?',
      op: [
        'The firm is a price taker in a market with many substitutes.',
        'The firm is a price maker because it produces less and charges more.',
        'The firm has no barriers to entry, allowing it to compete effectively.',
        'The firm is a price taker because it produces more than the competitive market.',
      ],
      ai: 3,
      ex: 'The subject evidence supporting the answer is that because it produces less and charges more than a competitive market, a monopoly creates deadweight loss.',
    };

    expect(findScionExplanationKeyConflict(item)).toMatchObject({
      declaredIndex: 3,
      supportedIndex: 1,
    });
  });

  it('rejects an explicit fact citation with no anchor in the keyed answer', () => {
    const item = {
      q: 'A note records 你好 while a diagram marks pitch contours. Which interpretation fits the note?',
      op: [
        '你好 means hello in this greeting.',
        '你好 labels a Pinyin initial.',
        '你好 names a syllable ending.',
        '你好 identifies a writing exercise.',
      ],
      ai: 0,
      ex: '你好 is a greeting whose meaning is hello. A Pinyin initial is only one component of a syllable.',
    };
    expect(
      findScionCitedSourceKeyMismatch(item, {
        sourceClaims: ['Pinyin initials and finals are the two parts of the Pinyin system.'],
      }),
    ).toMatchObject({ supportMethod: 'cited-fact-key-zero-overlap' });
    expect(
      findScionCitedSourceKeyMismatch(item, {
        sourceClaims: ['你好 is a spoken Mandarin greeting whose meaning is hello.'],
      }),
    ).toBeNull();
  });

  it('rejects a wrong subject that copies the cited relation words', () => {
    const item = {
      q: 'Which minor variant raises both the sixth and seventh scale degrees?',
      op: [
        'Natural minor alters sixth and seventh degrees',
        'Harmonic minor raises only the seventh degree',
        'Melodic minor raises both sixth and seventh degrees',
        'Natural minor leaves both degrees unchanged',
      ],
      ai: 0,
      fi: [2],
      ex: 'Melodic minor raises both the sixth and seventh scale degrees.',
    };

    expect(
      findScionCitedSourceKeyMismatch(item, {
        sourceClaims: ['Melodic minor raises both the sixth and seventh scale degrees.'],
      }),
    ).toMatchObject({
      declaredIndex: 0,
      supportedIndex: 2,
      supportMethod: 'cited-fact-option-phrase-alignment',
    });
  });

  it('does not assemble a role-swapped alternative from two separate cited claims', () => {
    const item = {
      q: 'Which proposition distinguishes internal heat from the hydrological cycle?',
      op: [
        'Internal heat moves core and mantle material',
        'Hydrological cycle moves core and mantle material',
        'Internal heat moves water, ice, and air',
        'Sun is powered by the hydrological cycle',
      ],
      ai: 0,
      ex: "Earth's internal heat moves material through the core and mantle, while the hydrological cycle moves water, ice, and air at the surface.",
    };

    expect(
      findScionCitedSourceKeyMismatch(item, {
        sourceClaims: [
          "Earth's internal heat moves material through the core and mantle.",
          'The hydrological cycle moves water, ice, and air at the surface.',
        ],
        strict: true,
      }),
    ).toBeNull();
  });

  it('does not promote a both-variants distractor from one variant-specific claim', () => {
    const item = {
      q: 'Which statement distinguishes harmonic and melodic minor?',
      op: [
        'Harmonic raises seventh; melodic raises sixth and seventh',
        'Harmonic raises sixth and seventh; melodic raises seventh',
        'Both raise the sixth and seventh scale degrees',
        'Harmonic raises seventh; melodic raises the sixth',
      ],
      ai: 0,
      ex: 'Harmonic minor raises the seventh scale degree, while melodic minor raises both the sixth and seventh.',
    };
    expect(
      findScionCitedSourceKeyMismatch(item, {
        sourceClaims: [
          'Harmonic minor raises the seventh scale degree.',
          'Melodic minor raises both the sixth and seventh scale degrees.',
        ],
        strict: true,
      }),
    ).toBeNull();
  });

  it('rejects an unsupported scope qualifier under the strict ledger contract', () => {
    expect(
      findScionCitedSourceKeyMismatch(
        {
          q: 'Which system fits?',
          op: [
            'The system raises both sixth and seventh degrees',
            'The system raises the seventh scale degree',
            'The system lowers the seventh scale degree',
            'The system changes the third scale degree',
          ],
          ai: 0,
          ex: 'The system raises the seventh scale degree.',
        },
        {
          sourceClaims: ['Harmonic minor raises the seventh scale degree so it can function as a leading tone.'],
          strict: true,
        },
      ),
    ).toMatchObject({
      unsupportedScopeTokens: ['both'],
      supportMethod: 'cited-fact-key-unsupported-scope',
    });
  });

  it('rejects an unsupported exclusivity claim in the question or explanation', () => {
    expect(
      findScionCitedSourceKeyMismatch(
        {
          q: 'A passage raises only the seventh scale degree. Which variant fits?',
          op: ['Harmonic minor', 'Melodic minor', 'Natural minor', 'Minor key system'],
          ai: 0,
          ex: 'Harmonic minor raises the seventh scale degree, while the sixth remains unchanged.',
        },
        {
          sourceClaims: ['Harmonic minor raises the seventh scale degree so it can function as a leading tone.'],
          strict: true,
        },
      ),
    ).toMatchObject({
      unsupportedScopeTokens: expect.arrayContaining(['only', 'unchang']),
      supportMethod: 'cited-fact-context-unsupported-scope',
    });
  });

  it('detects two source-supported labels in a broad fits question', () => {
    expect(
      findScionMultipleSourceSupportedOptions(
        {
          q: 'A score marks a raised seventh. Which entry fits the first excerpt?',
          op: ['Leading tone', 'Natural minor', 'Harmonic minor', 'Melodic minor'],
          ai: 2,
          ex: 'Harmonic minor raises the seventh scale degree.',
        },
        {
          sourceClaims: [
            'Harmonic minor raises the seventh scale degree so it can function as a leading tone.',
            'Melodic minor raises both the sixth and seventh scale degrees.',
          ],
          allowBroadSourceContext: true,
        },
      ),
    ).toMatchObject({
      supportMethod: 'question-relevant-source-option-support',
      supported: expect.arrayContaining([expect.objectContaining({ index: 2 }), expect.objectContaining({ index: 3 })]),
    });
  });

  it('detects two source-supported artifacts in a relevant-artifact question', () => {
    expect(
      findScionMultipleSourceSupportedOptions(
        {
          q: 'When evaluating a competitor product, which artifact is relevant for examination during a usability test?',
          op: ['A sketch of the product design', 'A competitor product', 'A detailed test script', 'Observation roles'],
          ai: 0,
          ex: 'A usability test can examine a sketch, prototype, or competitor product.',
        },
        {
          sourceClaims: [
            'A usability test can examine a sketch, prototype, competitor product, or other artifact relevant to a user goal.',
          ],
          allowBroadSourceContext: true,
        },
      ),
    ).toMatchObject({
      supportMethod: 'question-relevant-source-option-support',
      supported: expect.arrayContaining([expect.objectContaining({ index: 0 }), expect.objectContaining({ index: 1 })]),
    });
  });

  it('treats an explicitly requested distinction as broad enough to expose an incomplete second answer', () => {
    expect(
      findScionMultipleSourceSupportedOptions(
        {
          q: 'A comparison records material moving through the core and mantle and water, ice, and air moving at the surface; which distinction between internal heat and hydrological cycle is supported?',
          op: [
            'Internal heat: core and mantle; hydrological: surface',
            'Internal heat: surface; hydrological: core and mantle',
            'Internal heat: water and ice; hydrological: mantle material',
            'Internal heat: core; hydrological: water at surface',
          ],
          ai: 0,
          ex: "Earth's internal heat moves material through the core and mantle, whereas the hydrological cycle moves water, ice, and air at the surface.",
        },
        {
          sourceClaims: [
            "Earth's internal heat moves material through the core and mantle and contributes to changes within the crust.",
            'The hydrological cycle moves water, ice, and air at the surface and is powered by the Sun.',
          ],
          allowBroadSourceContext: true,
        },
      ),
    ).toMatchObject({
      supportMethod: 'question-relevant-source-option-support',
      supported: expect.arrayContaining([expect.objectContaining({ index: 0 }), expect.objectContaining({ index: 3 })]),
    });
  });

  it('binds paired distinctions within source clauses instead of mixing broad lists or reversed roles', () => {
    const functionalHarmony = {
      q: 'A progression notation shows one chord on degree one and another on degree four; which comparison correctly distinguishes the exact tonic and pre-dominant relationships observed?',
      op: [
        'Tonic: degree one; pre-dominant: degree four',
        'Tonic: degree four; pre-dominant: degrees two and three',
        'Pre-dominant: degree six; tonic: degrees three and four',
        'Pre-dominant: degree one; tonic: degree four',
      ],
      ai: 0,
      ex: 'The degree-one chord is tonic, and degree four is among the degrees supporting pre-dominants.',
    };
    expect(
      findScionMultipleSourceSupportedOptions(functionalHarmony, {
        sourceClaims: [
          'Functional harmony classifies chords by the role they play in a progression, especially tonic, dominant, and pre-dominant functions.',
          'The tonic is built on scale degree one, while pre-dominants are built on degrees two, three, four, and six.',
        ],
        allowBroadSourceContext: true,
      }),
    ).toBeNull();

    const melting = {
      q: 'A comparison records magma generation at divergent boundaries and convergent boundaries. Which distinction matches the documented melting processes at these two tectonic settings?',
      op: [
        'Divergent: flux; convergent: decompression melting',
        'Divergent and convergent: decompression melting',
        'Divergent: decompression; convergent: flux melting',
        'Divergent and convergent: flux melting',
      ],
      ai: 2,
      ex: 'Divergent boundaries generate magma by decompression melting, while convergent boundaries use flux melting.',
    };
    expect(
      findScionMultipleSourceSupportedOptions(melting, {
        sourceClaims: [
          'Volcanic magma forms chiefly at divergent boundaries, convergent boundaries, and mantle plumes through decompression or flux melting.',
          'Divergent boundaries and mantle plumes generate magma by decompression melting, while convergent boundaries use flux melting.',
        ],
        allowBroadSourceContext: true,
      }),
    ).toBeNull();
  });

  it('binds semicolon relation subjects before source alignment can prefer a role-swapped distractor', () => {
    const sourceClaims = [
      "Simple carbohydrates provide readily available energy sources for the body's immediate needs.",
      'Major minerals and electrolytes maintain fluid balance and support nerve and muscle function effectively.',
    ];
    const item = {
      q: 'A comparison notes that simple carbohydrates provide readily available energy sources, while major minerals and electrolytes maintain fluid balance. Which distinction matches these observations?',
      op: [
        'Carbohydrates maintain fluid balance; minerals supply energy',
        'Carbohydrates supply energy; minerals support fluid balance',
        'Minerals maintain fluid balance; carbohydrates support nerve function',
        'Carbohydrates support energy; minerals supply fluid balance',
      ],
      ai: 1,
      ex: 'Simple carbohydrates provide immediate energy, while major minerals and electrolytes maintain fluid balance.',
    };

    expect(findScionSourceAnswerSupport(item, { sourceClaims, strict: true })).toMatchObject({
      declaredIndex: 1,
      supportedIndex: 1,
      supportMethod: 'source-paired-relation-alignment',
      scores: [0, 1, 0, 0],
    });
    expect(findScionSourceAnswerConflict(item, { sourceClaims, strict: true })).toBeNull();
  });

  it('uses the stated distinction basis instead of admitting role-swapped word overlap', () => {
    const sourceClaims = [
      'The review distinguishes between macronutrients and micronutrients based on their required quantities for bodily processes.',
    ];
    const item = {
      q: 'A review compares macronutrients and micronutrients using required quantities. Which distinction matches the observed comparison?',
      op: [
        'Quantities distinguish macronutrients from essential components',
        'Quantities distinguish macronutrients from micronutrients',
        'Macronutrients distinguish quantities from micronutrients',
        'Macronutrients and micronutrients distinguish quantities',
      ],
      ai: 1,
      ex: 'The review distinguishes macronutrients and micronutrients based on their required quantities for bodily processes.',
    };

    expect(findScionSourceAnswerSupport(item, { sourceClaims, strict: true })).toMatchObject({
      declaredIndex: 1,
      supportedIndex: 1,
      scores: [0, 1, 0, 0],
      supportMethod: 'source-distinction-relation-alignment',
    });
    expect(
      findScionMultipleSourceSupportedOptions(item, {
        sourceClaims,
        allowBroadSourceContext: true,
      }),
    ).toBeNull();
  });

  it('does not confuse source-supported distractor facts with answers to a narrower subject match', () => {
    expect(
      findScionMultipleSourceSupportedOptions(
        {
          q: 'Which description matches simple meter?',
          op: [
            'Each beat divides into two equal parts',
            'Each beat divides into three equal parts',
            'Beats are grouped in threes',
            'Measures are marked by recurring pulse',
          ],
          ai: 0,
          ex: 'Each beat divides into two equal parts in simple meter.',
        },
        {
          sourceClaims: [
            'A beat is a regularly recurring pulse, and meter organizes recurring beats into groups.',
            'Duple meter groups beats in twos, and triple meter groups them in threes.',
            'In simple meter, each beat divides into two equal parts; in compound meter, each beat divides into three equal parts.',
            'A measure contains one recurring beat group.',
          ],
          allowBroadSourceContext: true,
        },
      ),
    ).toBeNull();
  });

  it('detects an explanation that affirmatively endorses two separate options', () => {
    expect(
      findScionMultipleExplanationSupportedOptions({
        q: 'What is the distinction between binding a reference and copying a value?',
        op: [
          "Binding a reference points to the object's location.",
          'Copying a value creates an independent duplicate.',
          'Binding a reference tests mathematical equality.',
          'Copying a value changes the variable name.',
        ],
        ai: 0,
        ex: "Binding a reference points to the object's location, while copying a value creates an independent duplicate.",
      }),
    ).toMatchObject({
      supportMethod: 'multiple-affirmative-explanation-options',
      supported: expect.arrayContaining([expect.objectContaining({ index: 0 }), expect.objectContaining({ index: 1 })]),
    });
  });

  it('detects algebraically equivalent equation choices', () => {
    expect(
      findScionEquivalentEquationOptionPair([
        'Gross investment equals capital stock minus depreciation.',
        'Capital stock equals gross investment minus depreciation.',
        'Net investment equals gross investment minus depreciation.',
        'Depreciation equals gross investment minus net investment.',
      ]),
    ).toMatchObject({ left: 2, right: 3 });

    expect(
      findScionEquivalentEquationOptionPair([
        'Current is proportional to voltage.',
        'Voltage is proportional to current.',
        'Temperature is proportional to current.',
        'Resistance is proportional to temperature.',
      ]),
    ).toMatchObject({ left: 0, right: 1 });
  });

  it('detects an exact pair of semantic clauses when only their display order changes', () => {
    expect(
      findScionNearDuplicateOptionPair([
        'Natural minor matches the pattern; major has subtonic',
        'Major uses whole steps; natural minor uses half steps',
        'Major matches the pattern; natural minor has subtonic',
        'Major has subtonic; natural minor matches the pattern',
      ]),
    ).toMatchObject({ leftIndex: 0, rightIndex: 3, clauseOrderEquivalent: true });
  });

  it.each([
    [
      'a negated minimal pair',
      [
        'Keeps relevant features; assumptions do not hold exactly',
        'Discards relevant features; assumptions hold exactly',
        'Keeps relevant features; assumptions hold exactly',
        'Discards relevant features; assumptions do not hold exactly',
      ],
    ],
    [
      'a complete-versus-partial source member',
      [
        'Crust and mantle compose lithosphere; model explains features',
        'Crust and mantle explain features; model composes lithosphere',
        'Crust composes lithosphere; model explains features',
        'Crust and mantle compose lithosphere; features explain model',
      ],
    ],
    [
      'a critical ordinal member',
      [
        'Classify raised sixth and seventh as melodic minor',
        'Classify raised sixth and seventh as harmonic minor',
        'Classify raised seventh as melodic minor',
        'Classify raised sixth as melodic minor',
      ],
    ],
    [
      'a hyphenated function distinction',
      [
        'Classify it as major with strengthened dominant function',
        'Classify it as minor with strengthened dominant function',
        'Classify it as major with strengthened tonic function',
        'Classify it as major with strengthened pre-dominant function',
      ],
    ],
  ])('keeps $name distinct instead of treating content as filler', (_name, options) => {
    expect(findScionNearDuplicateOptionPair(options)).toBeNull();
  });

  it('does not call role-swapped tonal destinations independently source-supported', () => {
    const item = {
      q: 'A supertonic seventh chord pulls toward the dominant; which functional label fits?',
      op: [
        'Terminal pre-dominant pulling toward the dominant',
        'Dominant chord pulling toward the tonic',
        'Terminal pre-dominant pulling toward the tonic',
        'Dominant chord pulling toward the supertonic',
      ],
      ai: 0,
      ex: 'A supertonic seventh chord with strong pull toward the dominant functions as a terminal pre-dominant.',
    };
    expect(
      findScionMultipleSourceSupportedOptions(item, {
        sourceClaims: [
          'A seventh chord adds a seventh above a triad, and its function depends on its scale degree.',
          'The supertonic seventh chord functions as a terminal pre-dominant with a strong pull toward the dominant.',
          "Adding a seventh to the dominant increases the chord's pull toward the tonic.",
        ],
        allowBroadSourceContext: true,
      }),
    ).toBeNull();
  });

  it('does not let incidental notation context hide a second clef answer', () => {
    const result = findScionMultipleSourceSupportedOptions(
      {
        q: 'What is the primary function of a clef in Western musical notation?',
        op: [
          'To define the horizontal lines on the staff',
          'To indicate which notes are represented by the lines and spaces',
          'To determine the pitch represented by each space',
          'To show the relationship between different musical pitches',
        ],
        ai: 1,
        ex: 'A clef indicates which notes are represented by the lines and spaces on a musical staff.',
      },
      {
        sourceClaims: [
          'In Western musical notation, the staff is a set of horizontal lines with spaces between them that each represent a different musical pitch.',
          'Which staff positions represent which notes is determined by a clef placed at the beginning of the staff.',
          'A clef is a musical symbol used to indicate which notes are represented by the lines and spaces on a musical staff.',
          'The treble clef is the upper staff of the grand staff used for keyboard instruments.',
          'Bass clef is the bottom clef in the grand staff for keyboard instruments.',
        ],
        allowBroadSourceContext: true,
      },
    );
    expect(result).toMatchObject({
      supported: expect.arrayContaining([expect.objectContaining({ index: 1 })]),
    });
    expect(result.supported).toHaveLength(2);
  });

  it('detects inverse-worded duplicate comparisons', () => {
    expect(
      findScionEquivalentComparisonOptionPair([
        'The vein is younger than the beds',
        'The vein is older than the beds',
        'The beds are younger than the vein',
        'The vein and beds formed together',
      ]),
    ).toMatchObject({ left: 1, right: 2 });
  });

  it('rejects exclusivity and absence markers that the source never states', () => {
    const sourceClaims = [
      'A test script gives each session a repeatable structure without turning the moderator into a teacher.',
    ];
    expect(
      findScionUnsupportedScopeOption(
        [
          'A script gives the session repeatable structure',
          'The moderator always teaches every realistic task',
          'The script is only used for recruitment',
          'The script works without moderator teaching',
        ],
        { sourceClaims },
      ),
    ).toEqual({ index: 1, marker: 'always' });
    expect(
      findScionUnsupportedScopeOption(['A script works without turning the moderator into a teacher'], {
        sourceClaims,
      }),
    ).toBeNull();
  });

  it('does not treat an explicitly rejected distractor as explanation support', () => {
    expect(
      findScionMultipleExplanationSupportedOptions({
        q: 'Which name follows the supplied rule?',
        op: [
          'grade_total follows the naming rule',
          '3grade_total follows the naming rule',
          'Underscores are forbidden',
          'Case never matters',
        ],
        ai: 0,
        ex: 'grade_total follows the naming rule. The 3grade_total option is wrong because a name cannot start with a digit.',
      }),
    ).toBeNull();
  });

  it('does not treat a reversed comparison named as a correction as affirmative support', () => {
    expect(
      findScionMultipleExplanationSupportedOptions({
        q: 'Using superposition, which relative-age conclusion is supported for the lower layer?',
        op: [
          'The lower layer is older',
          'The lower layer is younger',
          'The two layers have equal ages',
          'The layer order leaves ages undecided',
        ],
        ai: 0,
        ex: 'Superposition places the older layer below the younger layer, so the lower layer is older. Saying the lower layer is younger reverses that supported order.',
      }),
    ).toBeNull();
  });

  it('does not infer a second relation from scattered explanation vocabulary', () => {
    expect(
      findScionMultipleExplanationSupportedOptions({
        q: 'Which statement correctly distinguishes net investment from the listed terms?',
        op: [
          'Net investment is gross investment minus depreciation.',
          'Gross investment is the capital stock change.',
          'Capital stock is gross investment minus depreciation.',
          'Depreciation is the total production equipment quantity.',
        ],
        ai: 0,
        ex: 'Net investment is gross investment minus depreciation and is the change in capital stock over a period. The gross-investment distractor is incorrect because the stated change is net investment.',
      }),
    ).toBeNull();
  });

  it('retains only complete model-authored sentences without trusting lexical key overlap', () => {
    const repaired = repairScionMcItem(TRUNCATED_CONFLICT, { lessonId: 'lesson-2', itemIndex: 1 });
    expect(repaired.item).toMatchObject({
      ai: 3,
      ex: 'Creating user stories that describe features turns stable needs into actionable product work.',
    });
    expect(repaired.repairs.map((entry) => entry.pass)).toEqual(['incompleteExplanationTail']);
    expect(repaired.repairs[0]).toMatchObject({
      trainingEligible: false,
      action: 'trimmed-incomplete-tail',
      recoveryEvidence: {
        verified: true,
        removedTail: 'Focusing only on interface requests is too narrow because',
      },
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

  it('persists only the safe sentence-boundary repair when an enrichment graph is reopened', () => {
    const enrichment = {
      lessonContent: {
        'lesson-2': {
          quizItems: [{ ...TRUNCATED_CONFLICT, type: 'multiple_choice' }],
        },
      },
    };
    const result = repairScionEnrichmentAnswerKeys(enrichment);
    expect(result.enrichment.lessonContent['lesson-2'].quizItems[0]).toMatchObject({
      ai: 3,
      ex: 'Creating user stories that describe features turns stable needs into actionable product work.',
    });
    expect(result.enrichment.semanticRepairs.map((entry) => entry.pass)).toEqual(['incompleteExplanationTail']);
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
  ])('can replay the historical lexical repair for $name', ({ item, supportedIndex, scores }) => {
    const repaired = repairScionMcItem(item, { allowUnverifiedLexicalRepair: true });
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

  it('does not flip a correct Hubble-law key from lexical overlap with a false directional distractor', () => {
    const item = {
      q: "Hubble's law implies the universe is expanding because",
      op: [
        'recession speed grows in proportion to distance for galaxies in every direction',
        'all galaxies have exactly the same speed',
        'nearby galaxies recede faster than distant ones',
        'the Milky Way is at the exact center of the cosmos',
      ],
      ai: 0,
      ex: 'Because nearly all galaxies recede, with the most distant receding fastest, the universe must be expanding. By contrast, “nearby galaxies recede faster than distant ones” does not address the same evidence or decision criterion.',
    };

    expect(repairScionMcItem(item)).toEqual({ item, repairs: [] });
    expect(repairScionMcItem(item, { allowUnverifiedLexicalRepair: true }).item.ai).toBe(2);
  });

  it('can replay the pre-first-sentence contract without rewriting historical receipts', () => {
    const item = {
      q: 'What is the primary action performed by the open() function?',
      op: ['reading data from a file', 'writing information into files', 'closing a file', 'returning a file object'],
      ai: 1,
      ex: 'open() returns a file object that the program then reads from or writes to.',
    };
    expect(
      repairScionMcItem(item, {
        allowUnverifiedLexicalRepair: true,
        keyConflictOptions: { allowFirstSentenceLexicalCue: false },
      }),
    ).toEqual({
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
    expect(repairScionMcItem(item)).toEqual({ item, repairs: [] });
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
