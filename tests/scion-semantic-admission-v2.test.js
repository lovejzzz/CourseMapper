import { describe, expect, it } from 'vitest';

import { repairScionMcItem } from '../src/lib/scionAnswerKeyAlignment.js';
import {
  assessScionKeyTerm,
  assessScionLessonKernel,
  assessScionMcItem,
  assessScionPreferencePair,
} from '../src/lib/scionPreferenceGate.js';
import { SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE } from './fixtures/scionLessonKernelAdmissionV01654.js';

const LIST_CLAIMS = [
  'A list is an ordered collection of values written in square brackets; each element has an index, beginning at 0.',
  'A list is written with square brackets holding comma-separated values.',
  'Individual elements are accessed directly using an index.',
];

describe('Scion strict semantic admission', () => {
  it('rejects copied compact-prompt stems and options before they reach the course', () => {
    const item = {
      q: 'Which option correctly distinguishes the two lesson concepts?',
      op: [
        'Plausible methodological claim or action A',
        'Plausible methodological claim or action B',
        'Plausible methodological claim or action C',
        'Plausible methodological claim or action D',
      ],
      ai: 0,
      ex: 'The first option wins because it states the intended distinction while the second option does not.',
    };

    expect(assessScionMcItem(item).issues).not.toContain('template-residue');
    expect(assessScionMcItem(item, { semanticProfile: 'source-strict-v3' }).issues).toContain('template-residue');
  });

  it('rejects a schema-ceiling option ending in a hard-truncated word fragment', () => {
    const item = {
      q: 'Which situation best fits a natural experiment?',
      op: [
        'A policy change affects one group but not another, letting you estimate a causal effect from-ob',
        'An experiment assigns people randomly and measures the result directly',
        'A survey asks people about their opinions after a change',
        'A group changes behavior for reasons unrelated to any external event',
      ],
      ai: 0,
      ex: 'A policy or external event affects one group, so comparable groups can support a causal estimate.',
    };

    expect(assessScionMcItem(item).issues).not.toContain('truncated-option');
    expect(assessScionMcItem(item, { semanticProfile: 'strict' }).issues).toContain('truncated-option');

    item.op[0] = 'The GDP figures give a partial indicator, but they may miss unpaid work, distribution, and';
    expect(assessScionMcItem(item, { semanticProfile: 'strict' }).issues).toContain('truncated-option');

    item.op[0] = 'Building a testable representation of the planned experience without every';
    expect(assessScionMcItem(item, { semanticProfile: 'strict' }).issues).toContain('truncated-option');
  });

  it('rejects trailing list labels without treating code indexing as a label', () => {
    const labeled = {
      q: 'If a string has length five, which option gives the right-most character index?',
      op: ['0 [1]', '4 [2]', '5 [3]', 'len(s) [0]'],
      ai: 1,
      ex: 'Index 4 is correct because positions begin at zero. Index 5 would be outside the string.',
    };
    const code = {
      q: 'A program needs the second score from scores = [72, 81, 90]. Which expression retrieves it?',
      op: ['scores[0]', 'scores[1]', 'scores[2]', 'scores[3]'],
      ai: 1,
      ex: 'scores[1] is correct because list indexes begin at zero. scores[2] retrieves the third score.',
    };

    expect(assessScionMcItem(labeled, { semanticProfile: 'strict' }).issues).toContain('option-label-suffixes');
    expect(assessScionMcItem(code, { semanticProfile: 'strict' }).issues).not.toContain('option-label-suffixes');
  });

  it('rejects an answer key contradicted by a uniquely supported affirmative explanation', () => {
    const item = {
      q: 'If range(n) is used with a for loop, which integer sequence is produced?',
      op: ['It yields 0 through n.', 'It yields 1 through n.', 'It yields 0 through n-1.', 'It yields n through 2n.'],
      ai: 3,
      ex: 'The correct choice is that it yields 0 through n-1. The upper bound n is excluded.',
    };

    expect(assessScionMcItem(item).eligible).toBe(true);
    expect(assessScionMcItem(item, { semanticProfile: 'strict' }).issues).toContain('explanation-key-conflict');
    expect(repairScionMcItem(item).repairs).toHaveLength(0);
    const repaired = repairScionMcItem(item, { strictSourceAlignment: true });
    expect(repaired).toEqual({ item, repairs: [] });
  });

  it('uses a two-token question-to-claim anchor only when strict source support uniquely contradicts the key', () => {
    const sourceClaims = [
      'Earth is layered into a thin outer crust, a thick rocky mantle, and a metallic core.',
      'The crust is much thinner than the mantle.',
    ];
    const item = {
      q: "Which description accurately reflects the structural arrangement of Earth's interior layers?",
      op: [
        'The core is the outermost layer, followed by the mantle, and then the crust.',
        'The mantle is the outermost layer, followed by the core, and then the crust.',
        'The crust is the outermost layer, followed by the core, and then the mantle.',
        'Earth is layered into a thin outer crust, a thick rocky mantle, and a metallic core.',
      ],
      ai: 0,
      ex: 'The correct option describes the layering as crust, mantle, and core.',
    };

    expect(assessScionMcItem(item, { sourceClaims }).issues).not.toContain('source-answer-conflict');
    expect(assessScionMcItem(item, { sourceClaims, semanticProfile: 'strict' }).issues).toContain(
      'source-answer-conflict',
    );
    const repaired = repairScionMcItem(item, { sourceClaims, strictSourceAlignment: true });
    expect(repaired.item.ai).toBe(3);
    expect(repaired.repairs).toEqual([
      expect.objectContaining({
        pass: 'sourceAnswerAlignment',
        action: 'realigned',
        preferenceEvidence: expect.objectContaining({ supportedIndex: 3, declaredIndex: 0 }),
      }),
    ]);
  });

  it('rejects independently source-supported distractors, display labels, and leaked claim markers', () => {
    const item = {
      q: 'How are the relationships between successive notes of a scale referred to in music theory?',
      op: [
        'A) Intervals between successive notes',
        'B) Scale steps',
        'C) Ratios between sonic frequencies',
        'D) Differences in pitch between sounds',
      ],
      ai: 0,
      ex: 'Intervals between successive notes is correct (Claim 1). Scale steps are a related label.',
    };

    const strict = assessScionMcItem(item, {
      sourceClaims: ['Intervals between successive notes of a scale are called scale steps.'],
      semanticProfile: 'strict',
    });
    expect(strict.issues).toEqual(
      expect.arrayContaining(['option-label-prefixes', 'claim-marker-residue', 'multiple-source-supported-options']),
    );

    const sourceStrict = assessScionMcItem(item, {
      sourceClaims: ['Intervals between successive notes of a scale are called scale steps.'],
      semanticProfile: 'source-strict',
    });
    expect(sourceStrict.issues).toEqual(expect.arrayContaining(strict.issues));
  });

  it('rejects broad source-bound questions with more than one defensible answer', () => {
    const taskFlow = {
      q: 'What is the primary function of a task flow analysis?',
      op: [
        'To build testable interactions',
        'To surface obstacles between users and goals',
        'To diagram steps and decision points for reaching a goal',
        'To combine conformance checks with observed user performance',
      ],
      ai: 2,
      ex: 'The correct choice diagrams how a user progresses through tasks to accomplish a goal.',
    };
    const taskFlowClaims = [
      'A task flow analysis diagrams the steps and decision points through which a user reaches a defined goal.',
      'Task flow analysis can validate the team understanding of user goals, common scenarios, and tasks.',
      'A task flow should show how a user progresses through tasks to accomplish a goal.',
      'Task flow analysis should surface obstacles that stand between users and their goals.',
      'The diagram may include multiple possible paths, task sequences, and decision points.',
    ];
    const list = {
      q: 'How is a list fundamentally structured according to the source claims?',
      op: [
        'A list is an ordered collection of values written in square brackets; each element has an index',
        'A list is written with square brackets holding comma-separated values',
        'Individual elements are accessed directly using an index',
        'A list is a mutable sequence where elements are accessed by their value',
      ],
      ai: 0,
      ex: 'The keyed statement combines the list ordering, bracket notation, and index structure.',
    };

    expect(
      assessScionMcItem(taskFlow, { sourceClaims: taskFlowClaims, semanticProfile: 'source-strict-v3' }).issues,
    ).toContain('multiple-source-supported-options');
    expect(
      assessScionMcItem(list, { sourceClaims: LIST_CLAIMS, semanticProfile: 'source-strict-v3' }).issues,
    ).toContain('multiple-source-supported-options');
    expect(
      assessScionMcItem(taskFlow, { sourceClaims: taskFlowClaims, semanticProfile: 'source-strict' }).issues,
    ).not.toContain('multiple-source-supported-options');
  });

  it('requires an explanation to teach the key instead of only eliminating every distractor', () => {
    const item = {
      q: 'What is the primary function of a task flow analysis?',
      op: [
        'To illustrate the emotional response to the system',
        'To validate understanding of user goals, scenarios, and tasks',
        'To show the aesthetic design of the final interface',
        'To document the historical development of the software',
      ],
      ai: 1,
      ex: 'Option 1 is incorrect because it concerns emotion. Option 3 is incorrect because it concerns visual design. Option 4 is incorrect because it concerns history.',
    };

    expect(assessScionMcItem(item, { semanticProfile: 'source-strict-v3' }).issues).toContain(
      'explanation-omits-key-support',
    );
    expect(
      assessScionMcItem(
        {
          ...item,
          ex: 'Option 2 is correct because task flow analysis validates user goals and common tasks. Option 1 is incorrect. Option 3 is incorrect. Option 4 is incorrect.',
        },
        { semanticProfile: 'source-strict-v3' },
      ).issues,
    ).not.toContain('explanation-omits-key-support');
    expect(assessScionMcItem(item, { semanticProfile: 'source-strict' }).issues).not.toContain(
      'explanation-omits-key-support',
    );
  });

  it('rejects source-grounded key terms with token examples or self-repeating corrections', () => {
    const terse = {
      tr: 'Lithification',
      df: 'The process that turns sediment into rock through compaction and cementation.',
      eg: 'Sandstone formation.',
      mi: 'Only compaction is needed to turn sediment into rock.',
      cx: 'Compaction and cementation are both involved in lithification.',
    };
    const repetitive = {
      tr: 'Index access',
      df: 'A retrieval method that locates one list element by its numerical position.',
      eg: 'A program reads the second score with scores[1].',
      mi: 'A list element must be retrieved with a descriptive key.',
      cx: 'Elements use an index because elements use an index.',
    };

    expect(assessScionKeyTerm(terse, { knownFacts: LIST_CLAIMS }).eligible).toBe(true);
    expect(assessScionKeyTerm(terse, { knownFacts: LIST_CLAIMS, semanticProfile: 'strict' }).issues).toContain(
      'example-underdeveloped',
    );
    expect(assessScionKeyTerm(repetitive, { knownFacts: LIST_CLAIMS, semanticProfile: 'strict' }).issues).toContain(
      'cx-repeats-itself',
    );
  });

  it('requires strict key-term names to use terminology present in the source packet', () => {
    const knownFacts = [
      'A dictionary stores key-value pairs and looks up each value by its key rather than by a numeric position.',
      'Dictionaries are written with curly braces in key: value form.',
    ];
    const generic = {
      tr: 'Key-value mapping',
      df: 'A process that associates a unique label with a stored piece of data.',
      eg: 'A roster associates each student identifier with one score.',
      mi: 'The records must be retrieved only by their numerical positions.',
      cx: 'Labels retrieve the stored values without requiring a numerical position.',
    };
    const disciplinary = { ...generic, tr: 'Dictionary' };

    expect(
      assessScionKeyTerm(generic, { knownFacts, sourceTerm: 'Dictionaries', semanticProfile: 'source-strict' }).issues,
    ).toContain('term-not-source-anchored');
    expect(
      assessScionKeyTerm(disciplinary, {
        knownFacts,
        sourceTerm: 'Dictionaries',
        semanticProfile: 'source-strict',
      }).issues,
    ).not.toContain('term-not-source-anchored');
  });

  it('accepts source terminology with harmless word-order and plural changes', () => {
    const term = {
      tr: 'Case-sensitive variable names',
      df: 'Names that are treated as different when their letters use different capitalization.',
      eg: 'total and Total can refer to two different variables in a program.',
      mi: 'Changing only capitalization leaves the variable name unchanged.',
      cx: 'Python distinguishes total from Total, so capitalization matters.',
    };
    const knownFacts = ['Variable names are case-sensitive, so total and Total are two different variables.'];

    expect(assessScionKeyTerm(term, { knownFacts, semanticProfile: 'source-strict' }).issues).not.toContain(
      'term-not-source-anchored',
    );
  });

  it('rejects tautological corrections, template examples, and dropped precision qualifiers', () => {
    const base = {
      tr: 'Binary form',
      df: 'A musical pattern built from two sections that are about equal in length.',
      eg: 'A dance movement contains one A section followed by one B section.',
      mi: 'It means any piece containing exactly two notes.',
      cx: 'The label describes two balanced sections rather than two individual notes.',
    };
    const knownFacts = ['Binary form describes a musical piece with two sections that are about equal in length.'];

    expect(
      assessScionKeyTerm(
        { ...base, cx: 'Binary form describes binary form as two sections of a piece.' },
        { knownFacts, semanticProfile: 'source-strict' },
      ).issues,
    ).toContain('correction-circular-term');
    expect(
      assessScionKeyTerm(
        { ...base, eg: 'As a user, I want X so that Y.' },
        { knownFacts, semanticProfile: 'source-strict' },
      ).issues,
    ).toContain('example-placeholder');
    expect(
      assessScionKeyTerm(
        { ...base, df: 'A musical pattern built from two sections of equal length.' },
        { knownFacts, semanticProfile: 'source-strict' },
      ).issues,
    ).toContain('source-precision-overstatement');
    expect(assessScionKeyTerm(base, { knownFacts, semanticProfile: 'source-strict' }).eligible).toBe(true);
  });

  it('rejects a compact source fact mislabeled as a misconception', () => {
    const knownFacts = [
      'In music, a triad is a set of three notes that can be stacked vertically in thirds.',
      'A seventh chord is a triad plus a note forming a seventh above the root.',
    ];
    const term = {
      tr: 'Seventh chord',
      df: 'A chord composed of a triad plus a note forming a seventh above the root.',
      eg: 'A dominant seventh chord adds a seventh above its root to a triad.',
      mi: 'A triad consists of three notes.',
      cx: 'A seventh chord includes a triad plus one additional note above the root.',
    };
    const contrasted = {
      ...term,
      mi: 'A seventh chord must contain seven notes.',
      cx: 'The name refers to the added seventh interval, not to seven total notes.',
    };
    const repeatedInCorrection = {
      ...term,
      mi: 'A triad, which consists of three notes.',
      cx: 'A triad is a set of three notes, whereas a seventh chord includes an additional note.',
    };

    expect(assessScionKeyTerm(term, { knownFacts, semanticProfile: 'source-strict-v3' }).issues).toContain(
      'misconception-repeats-known-fact',
    );
    expect(assessScionKeyTerm(term, { knownFacts, semanticProfile: 'source-strict-v6' }).issues).toContain(
      'misconception-repeats-known-fact',
    );
    expect(
      assessScionKeyTerm(repeatedInCorrection, { knownFacts, semanticProfile: 'source-strict-v6' }).issues,
    ).toContain('misconception-repeats-known-fact');
    expect(assessScionKeyTerm(contrasted, { knownFacts, semanticProfile: 'source-strict-v3' }).issues).not.toContain(
      'misconception-repeats-known-fact',
    );
    expect(assessScionKeyTerm(term, { knownFacts, semanticProfile: 'source-strict' }).issues).not.toContain(
      'misconception-repeats-known-fact',
    );
  });

  it('keeps corrected relation reversals and cross-concept swaps eligible in the V6 source profile', () => {
    const magneticFacts = [
      'A magnetic field determines magnetic forces on moving charges and currents.',
      'Currents produce magnetic fields.',
    ];
    const reversedRelation = {
      tr: 'Currents',
      df: 'Currents are distinguished here by their production of magnetic fields.',
      eg: 'A current produces a magnetic field.',
      mi: 'A magnetic field produces currents.',
      cx: 'Production runs from currents toward magnetic fields, not in the reversed direction.',
    };
    const anatomyFacts = [
      'A cell is the smallest independently functioning unit of a living organism.',
      'Organs are anatomically distinct structures made of two or more tissue types.',
    ];
    const swappedConcept = {
      tr: 'cell',
      df: 'A cell is the smallest independently functioning unit of a living organism.',
      eg: 'A cell represents an independently functioning unit within body structure.',
      mi: 'A cell is made of two or more tissue types.',
      cx: 'The independently functioning unit is the cell; the tissue-type description applies to organs.',
    };

    expect(
      assessScionKeyTerm(reversedRelation, {
        knownFacts: magneticFacts,
        semanticProfile: 'source-strict-v6',
      }).issues,
    ).not.toContain('misconception-repeats-known-fact');
    expect(
      assessScionKeyTerm(swappedConcept, { knownFacts: anatomyFacts, semanticProfile: 'source-strict-v6' }).issues,
    ).not.toContain('misconception-repeats-known-fact');
  });

  it('keeps a clean applied item eligible', () => {
    const clean = {
      q: 'A program needs the third score from scores = [72, 81, 90]. Which expression retrieves it?',
      op: ['scores[0]', 'scores[1]', 'scores[2]', 'scores[3]'],
      ai: 2,
      ex: 'scores[2] is correct because list indexes begin at zero. scores[3] would request a fourth element.',
    };
    expect(assessScionMcItem(clean, { sourceClaims: LIST_CLAIMS, semanticProfile: 'strict' })).toMatchObject({
      eligible: true,
      issues: [],
    });
  });

  it('threads strict source semantics through pair-level corpus admission', () => {
    const conflicted = {
      q: 'If range(n) is used with a for loop, which integer sequence is produced?',
      op: ['It yields 0 through n.', 'It yields 1 through n.', 'It yields 0 through n-1.', 'It yields n through 2n.'],
      ai: 3,
      ex: 'The correct choice is that it yields 0 through n-1. The upper bound n is excluded.',
    };
    const clean = {
      ...conflicted,
      ai: 2,
    };
    const pair = assessScionPreferencePair(
      {
        kind: 'mc-item',
        chosen: conflicted,
        rejected: clean,
        preferenceEvidence: { kind: 'unsupported', verified: true },
      },
      {
        semanticProfile: 'strict',
        sourceClaims: ['range(n) yields integers from 0 through n-1 because the upper bound is excluded.'],
      },
    );

    expect(pair.chosen.issues).toContain('explanation-key-conflict');
    expect(pair.issues).toContain('chosen:explanation-key-conflict');
  });
});

describe('Scion strict-v5 definition precision', () => {
  const fields = {
    eg: 'A learner uses the concept in a concrete problem with observable evidence.',
    mi: 'The concept merely repeats its label without adding any usable distinction.',
    cx: 'A useful account states a broader category and the properties that distinguish it.',
  };

  it.each([
    [
      'key-value pairs',
      'A dictionary stores key-value pairs and looks up each value by its key rather than by numeric position.',
    ],
    [
      'magnetic force',
      'Magnetic force is the physical influence exerted by a magnetic field on a moving charge or current.',
    ],
    [
      'epidermis',
      'The epidermis is made of keratinized stratified squamous epithelium that protects underlying tissue.',
    ],
  ])('accepts a legitimate term-led genus/difference definition for %s', (tr, df) => {
    const assessment = assessScionKeyTerm(
      { tr, df, ...fields },
      { lessonTitle: 'A different lesson title', semanticProfile: 'strict-v5' },
    );
    expect(assessment.issues).not.toContain('circular-definition');
  });

  it('still rejects a true tautology made only from the term and generic definition words', () => {
    const assessment = assessScionKeyTerm(
      {
        tr: 'recursion',
        df: 'Recursion is the recursion concept, term, definition, method, process, and idea.',
        ...fields,
      },
      { lessonTitle: 'Recursive problem solving', semanticProfile: 'strict-v5' },
    );
    expect(assessment.issues).toContain('circular-definition');
  });

  it('rejects a multi-sentence or visibly truncated definition at the V5 boundary', () => {
    const multiple = assessScionKeyTerm(
      {
        tr: 'base case',
        df: 'A base case stops recursive calls. It supplies a direct result for the smallest input.',
        ...fields,
      },
      { lessonTitle: 'Recursive problem solving', semanticProfile: 'strict-v5' },
    );
    const truncated = assessScionKeyTerm(
      {
        tr: 'base case',
        df: 'A base case supplies a direct result and stops further recursive calls without',
        ...fields,
      },
      { lessonTitle: 'Recursive problem solving', semanticProfile: 'strict-v5' },
    );
    expect(multiple.issues).toContain('definition-multiple-sentences');
    expect(truncated.issues).toContain('truncated-definition');
  });
});

describe('Scion strict-v6 canonical lesson-title admission', () => {
  const fields = {
    eg: 'A learner compares stored charge with potential difference for one capacitor.',
    mi: 'Capacitance is simply another label for stored charge by itself.',
    cx: 'The quantity is a ratio, so stored charge alone does not determine it.',
  };

  it('accepts the canonical title when its definition supplies real differentia', () => {
    const assessment = assessScionKeyTerm(
      {
        tr: 'Capacitance',
        df: 'Capacitance is the ratio of stored charge to potential difference for a conductor or capacitor.',
        ...fields,
      },
      { lessonTitle: 'Capacitance', semanticProfile: 'strict-v6' },
    );
    expect(assessment.issues).not.toContain('term-is-lesson-title');
    expect(assessment.issues).not.toContain('circular-definition');
  });

  it('keeps V5 behavior frozen and still rejects a title tautology in V6', () => {
    const legitimate = {
      tr: 'Capacitance',
      df: 'Capacitance is the ratio of stored charge to potential difference for a conductor or capacitor.',
      ...fields,
    };
    const tautology = {
      ...legitimate,
      df: 'Capacitance is the capacitance concept, term, definition, method, process, and idea.',
    };
    expect(
      assessScionKeyTerm(legitimate, { lessonTitle: 'Capacitance', semanticProfile: 'strict-v5' }).issues,
    ).toContain('term-is-lesson-title');
    expect(assessScionKeyTerm(tautology, { lessonTitle: 'Capacitance', semanticProfile: 'strict-v6' }).issues).toEqual(
      expect.arrayContaining(['term-is-lesson-title', 'circular-definition']),
    );
  });
});

describe('Scion task-matched lesson-kernel admission', () => {
  it('admits the compact production contract without requiring historical full-package fields', () => {
    const sourceClaims = [
      'Plate boundaries are classified as divergent, convergent, or transform according to whether plates separate, approach, or slide alongside one another.',
      'Divergent boundaries move apart and form new crust, whereas convergent boundaries move together and can subduct crust.',
      'Transform boundaries accommodate plates moving side by side rather than creating or subducting crust.',
    ];
    expect(
      assessScionLessonKernel(SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE.lessons[0], {
        sourceClaims,
        sourceTerm: 'Plate-boundary processes',
      }),
    ).toEqual({ eligible: true, issues: [], score: 100 });
  });
});

describe('Scion source-strict-v4 key-term coherence', () => {
  it('rejects a true boolean rule mislabeled as a misconception', () => {
    const facts = [
      'A conditional statement chooses a block based on whether a condition is true; if-else takes exactly one branch.',
      'An if statement runs its body only when its condition is true.',
      'An else clause runs when the if condition is false.',
      'and returns True only if both conditions are true; or returns True if either is true; not inverts one condition.',
    ];
    const drifted = {
      tr: 'Compound condition operator',
      df: "Operators like 'and', 'or', and 'not' combine multiple tests into one condition.",
      eg: "Use 'and' to check whether a value is above five and below ten.",
      mi: "Believing 'and' always requires both parts to be true for the statement to be true.",
      cx: "The 'and' operator returns True only if both conditions are true.",
    };
    const coherent = {
      tr: 'Conditional statement',
      df: 'A control structure that selects a code path according to whether a condition is true or false.',
      eg: 'If a temperature is below freezing, print a warning; otherwise continue normally.',
      mi: 'It always runs both branches.',
      cx: 'Only one branch runs because if-else selects exactly one branch from the condition.',
    };

    expect(assessScionKeyTerm(drifted, { knownFacts: facts, semanticProfile: 'source-strict-v4' }).issues).toContain(
      'misconception-repeats-known-fact',
    );
    expect(
      assessScionKeyTerm(coherent, { knownFacts: facts, semanticProfile: 'source-strict-v4' }).issues,
    ).not.toContain('misconception-repeats-known-fact');
    expect(
      assessScionKeyTerm(drifted, { knownFacts: facts, semanticProfile: 'source-strict-v3' }).issues,
    ).not.toContain('misconception-repeats-known-fact');
  });

  it('requires a correction to repair a source-qualified scope that the misconception makes absolute', () => {
    const facts = [
      'Interactive prototyping builds a testable representation of how an experience looks and works.',
      'Functional prototypes allow a team to observe how users interact with a product.',
      'A prototype should show major interactions even when not every interaction is functional.',
    ];
    const drifted = {
      tr: 'Functional prototype',
      df: 'A working model that allows a team to observe user interaction.',
      eg: 'A clickable checkout lets users navigate through its main screens.',
      mi: 'A model must show every interaction even when not every interaction is functional.',
      cx: 'A functional prototype lets a team observe how users interact with a product.',
    };
    const coherent = {
      ...drifted,
      cx: 'It should show the major interactions, but it does not need every interaction to be functional.',
    };

    expect(assessScionKeyTerm(drifted, { knownFacts: facts, semanticProfile: 'source-strict-v4' }).issues).toContain(
      'correction-source-claim-drift',
    );
    expect(
      assessScionKeyTerm(coherent, { knownFacts: facts, semanticProfile: 'source-strict-v4' }).issues,
    ).not.toContain('correction-source-claim-drift');
  });

  it('accepts concise source-backed corrections that replace a false predicate', () => {
    const cases = [
      {
        facts: [
          'The epidermis is the outermost skin layer and is composed of keratinized stratified squamous epithelium.',
          'The dermis is connective tissue beneath the epidermis.',
        ],
        term: {
          tr: 'Epidermis',
          df: 'The outermost skin layer made of keratinized stratified squamous epithelium.',
          eg: 'The epidermis provides the primary barrier against external agents.',
          mi: 'The epidermis contains the dermal connective tissue.',
          cx: 'The epidermis is the outermost layer of keratinized stratified squamous epithelium.',
        },
      },
      {
        facts: [
          'Net electric flux is the total electric flow through a closed surface.',
          'Electric field strength describes the field at one location on the surface.',
        ],
        term: {
          tr: 'Net electric flux',
          df: 'The total electric flow through a closed surface, related to the enclosed charge.',
          eg: 'A surface enclosing no net charge has zero net electric flux.',
          mi: 'It is the electric field strength at one point on the surface.',
          cx: 'Flux summarizes the whole closed surface, while field strength describes one location.',
        },
      },
    ];

    for (const entry of cases) {
      expect(
        assessScionKeyTerm(entry.term, {
          knownFacts: entry.facts,
          semanticProfile: 'source-strict-v4',
        }).issues,
      ).not.toContain('correction-source-claim-drift');
    }
  });

  it('rejects a correction that borrows the predicate of a neighboring source concept', () => {
    const facts = [
      'A staff is a set of horizontal lines with spaces between them that represent different musical pitches.',
      'Which staff positions represent which notes is determined by a clef at the beginning of the staff.',
      'A clef is a musical symbol used to indicate which notes are represented by staff lines and spaces.',
    ];
    const drifted = {
      tr: 'Clef',
      df: 'A musical symbol that indicates which notes are represented by the lines and spaces on a staff.',
      eg: 'A treble clef at the beginning of a staff establishes how its notes are read.',
      mi: 'A clef is one specific musical pitch.',
      cx: 'A set of horizontal lines and spaces.',
    };
    const coherent = {
      ...drifted,
      cx: 'A clef maps the staff positions to notes; the lines and spaces together are the staff.',
    };

    expect(assessScionKeyTerm(drifted, { knownFacts: facts, semanticProfile: 'source-strict-v4' }).issues).toContain(
      'correction-borrows-unrelated-source-predicate',
    );
    expect(
      assessScionKeyTerm(coherent, { knownFacts: facts, semanticProfile: 'source-strict-v4' }).issues,
    ).not.toContain('correction-borrows-unrelated-source-predicate');
  });

  it('keeps a correction that refers back to the term head with a demonstrative', () => {
    const facts = [
      'With a negative externality, the price excludes the spillover cost.',
      'Correcting an externality makes decision-makers face the costs the market leaves out.',
    ];
    const term = {
      tr: 'spillover cost',
      df: 'A spillover cost is a cost excluded from the price in a negative externality.',
      eg: 'With pollution, the price excludes the spillover cost.',
      mi: 'A spillover cost is included in the market price.',
      cx: 'The market price leaves that cost out, so decision-makers do not face it.',
    };

    expect(assessScionKeyTerm(term, { knownFacts: facts, semanticProfile: 'source-strict-v6' }).issues).not.toContain(
      'correction-borrows-unrelated-source-predicate',
    );
  });

  it('requires a correction to name a technical API that the misconception misstates', () => {
    const facts = [
      'read() reads the entire file and returns one string.',
      'readline() returns the next line, while readlines() returns a list with every line.',
    ];
    const incomplete = {
      tr: 'readlines()',
      df: 'A file method that returns a list containing every line in a file.',
      eg: 'A program calls readlines() to store all lines as a list.',
      mi: 'Confusing readlines() with read(), which only returns the next single line.',
      cx: 'readlines() is useful when every file line should be processed as a list.',
    };
    const coherent = {
      ...incomplete,
      cx: 'read() returns one string for the whole file; readlines() instead returns a list of lines.',
    };

    expect(assessScionKeyTerm(incomplete, { knownFacts: facts, semanticProfile: 'source-strict-v4' }).issues).toContain(
      'correction-omits-technical-reference',
    );
    expect(
      assessScionKeyTerm(coherent, { knownFacts: facts, semanticProfile: 'source-strict-v4' }).issues,
    ).not.toContain('correction-omits-technical-reference');
  });

  it('rejects source-backed timing conflicts and missing explicit/implicit contrasts', () => {
    const researchFacts = [
      'Researchers should run through test tasks on the day before the research session.',
      'A practice session can expose procedure problems before participants arrive.',
    ];
    const timingConflict = {
      tr: 'Rehearsal setup',
      df: 'Preparation of the study environment and tasks before participants arrive.',
      eg: 'Run through the test tasks on the day of the research session.',
      mi: 'Only participants need to rehearse the tasks.',
      cx: 'Researchers should run through the tasks on the day before the research session.',
    };
    const conversionFacts = [
      'Conversion functions move a value from one data type to another.',
      'The interpreter performs implicit type conversion inside a mixed expression.',
      'int() converts a value to an integer and removes its fractional part.',
    ];
    const missingContrast = {
      tr: 'Type conversion',
      df: 'The process of changing a value from one data type to another.',
      eg: 'Using int(3.9) produces the integer value 3.',
      mi: 'All operations automatically maintain the original data type.',
      cx: 'Explicitly use conversion functions such as int() to change types.',
    };

    expect(
      assessScionKeyTerm(timingConflict, {
        knownFacts: researchFacts,
        semanticProfile: 'source-strict-v4',
      }).issues,
    ).toContain('example-correction-timing-conflict');
    expect(
      assessScionKeyTerm(missingContrast, {
        knownFacts: conversionFacts,
        semanticProfile: 'source-strict-v4',
      }).issues,
    ).toContain('correction-omits-implicit-contrast');
  });

  it('keeps source roles, interactive function, and defining labels aligned', () => {
    const researchFacts = [
      'A research plan turns a decision need into actionable learning objectives, participants, tasks, and evidence roles.',
      'The team should agree what it wants to learn before selecting study details.',
    ];
    const roleConfusion = {
      tr: 'Actionable learning objectives',
      df: 'Specific research goals derived from a need for learning.',
      eg: 'Define what a user should be able to accomplish during a usability test.',
      mi: 'Research objectives are only general ideas.',
      cx: 'Specific learning goals turn the decision need into a research plan.',
    };
    const prototypeFacts = [
      'Interactive prototyping builds a testable representation of how an experience looks and works.',
      'Functional prototypes allow a team to observe how users interact with a product.',
    ];
    const visualOnly = {
      tr: 'Testable representation',
      df: 'A visual model of an experience that is used for testing.',
      eg: 'A low-fidelity wireframe shows the main navigation flow.',
      mi: 'A static drawing requires no interaction to evaluate.',
      cx: 'The visual model can be tested for functionality and interaction.',
    };
    const scaleFacts = [
      'A scale is a consecutive series of notes from one pitch to its octave.',
      'A specific scale is defined by its interval pattern and first degree.',
      'The expression scale degree refers to the numerical labels assigned to notes within a scale.',
    ];
    const identityDrop = {
      tr: 'Scale degree',
      df: 'The numerical labels assigned to notes within a scale.',
      eg: 'In C major, the first scale degree is C.',
      mi: 'A scale degree is the scale itself.',
      cx: "The specific note that defines the scale's structure.",
    };

    expect(
      assessScionKeyTerm(roleConfusion, {
        knownFacts: researchFacts,
        semanticProfile: 'source-strict-v4',
      }).issues,
    ).toContain('example-confuses-research-learning-role');
    expect(
      assessScionKeyTerm(visualOnly, {
        knownFacts: prototypeFacts,
        semanticProfile: 'source-strict-v4',
      }).issues,
    ).toContain('definition-omits-interactive-function');
    expect(
      assessScionKeyTerm(identityDrop, {
        knownFacts: scaleFacts,
        semanticProfile: 'source-strict-v4',
      }).issues,
    ).toContain('correction-drops-defining-identity');
  });
});
