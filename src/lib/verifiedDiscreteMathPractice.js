import { buildVerifiedLogicQuizAtoms, isPropositionalLogicLesson } from './propositionalLogicQuiz.js';

const textbook =
  'https://ocw.mit.edu/courses/6-042j-mathematics-for-computer-science-spring-2015/mit6_042js15_textbook.pdf';
const referenceFor = (kind) =>
  `Further reading: Lehman, Leighton and Meyer, Mathematics for Computer Science (2015), ${kind === 'two-valued-logic' ? '§3.1 Propositions' : kind === 'finite-function' ? '§§4.3–4.5 Functions, Relations and Finite Cardinality' : '§5.1 Ordinary Induction, Theorem 5.1.1'}. ${textbook}. The exercise inputs here are course-created; the text is a conceptual reference, not their source.`;

const provenance = 'Synthetic practice; definitions govern these constructed inputs.';
const finiteCases = [
  { domain: ['a', 'b', 'c'], codomain: [1, 2, 3, 4], outputs: [1, 2, 3] },
  { domain: ['a', 'b', 'c'], codomain: [1, 2], outputs: [1, 2, 2] },
  { domain: ['a', 'b', 'c'], codomain: [1, 2, 3], outputs: [3, 1, 2] },
  { domain: ['a', 'b', 'c'], codomain: [1, 2, 3], outputs: [1, 1, 2] },
  { domain: ['a', 'b'], codomain: [1, 2, 3], outputs: [2, 3] },
  { domain: ['a', 'b', 'c', 'd'], codomain: [1, 2, 3], outputs: [1, 2, 3, 1] },
  { domain: ['a', 'b'], codomain: [1, 2], outputs: [2, 1] },
  { domain: ['a', 'b', 'c'], codomain: [1, 2, 3, 4], outputs: [2, 2, 4] },
];
export function classifyFiniteFunction({ domain, codomain, outputs }) {
  if (
    !Array.isArray(domain) ||
    !domain.length ||
    new Set(domain).size !== domain.length ||
    !Array.isArray(codomain) ||
    new Set(codomain).size !== codomain.length ||
    !Array.isArray(outputs) ||
    outputs.length !== domain.length ||
    outputs.some((x) => !codomain.includes(x))
  ) {
    throw new Error('A finite function needs one codomain-valued output for each distinct domain element.');
  }
  const image = [...new Set(outputs)];
  return { image, injective: image.length === domain.length, surjective: codomain.every((x) => image.includes(x)) };
}
const set = (xs) => `{${xs.join(', ')}}`;
function functionProblem(input, name = 'f') {
  return `Let ${name}: ${set(input.domain)} → ${set(input.codomain)}, with ${input.domain.map((x, i) => `${name}(${x})=${input.outputs[i]}`).join(', ')}. Determine whether ${name} is injective and whether it is surjective.`;
}
function functionSolution(input) {
  const result = classifyFiniteFunction(input);
  const missing = input.codomain.filter((x) => !result.image.includes(x));
  const collision = input.outputs.findIndex((x, i) => input.outputs.indexOf(x) !== i);
  const steps = [
    `Domain = ${set(input.domain)}; codomain = ${set(input.codomain)}; image = ${set(result.image)}.`,
    result.injective
      ? 'All distinct inputs have different outputs, so the function is injective.'
      : `The inputs ${input.domain[input.outputs.indexOf(input.outputs[collision])]} and ${input.domain[collision]} are distinct inputs with the same output ${input.outputs[collision]}, so the function is not injective.`,
    result.surjective
      ? 'Every codomain element is attained, so the function is surjective.'
      : `The codomain element(s) ${missing.join(', ')} have no preimage, so the function is not surjective.`,
  ];
  return {
    ...result,
    steps,
    answer: `${result.injective ? 'Injective' : 'Not injective'} and ${result.surjective ? 'surjective' : 'not surjective'}.`,
  };
}
const term = (name, definition, example) => ({ term: name, definition, example });

/** Only lesson-owned concepts select a module. Never route an entire course by its title. */
export function buildVerifiedDiscreteMathPractice(lesson, sourceBrief = '') {
  const context = [lesson.title, ...(lesson.keyConcepts || [])].join(' ');
  if (isPropositionalLogicLesson(lesson)) {
    const steps = [
      'For P implies Q, the rows (T,T), (T,F), (F,T), (F,F) give T, F, T, T.',
      'The converse is Q implies P. In the same row order its outputs are T, T, F, T.',
      'Counterexample to equivalence: P=T and Q=F makes P implies Q false but its converse true.',
      'Thus an implication does not license its converse. Reversing an implication requires a separate argument.',
    ];
    return {
      kind: 'two-valued-logic',
      provenance,
      workedExample: {
        problem: 'Compare P implies Q with its converse Q implies P using all four assignments of truth values.',
        steps,
        result: 'The implication and its converse differ on the (T,F) and (F,T) rows.',
      },
      terms: [
        term('Implication', 'P implies Q is false exactly when P is true and Q is false.', 'T implies F is false.'),
        term('Converse', 'The converse of P implies Q is Q implies P.', 'If P=F and Q=T, the converse is false.'),
        term(
          'Counterexample',
          'An instance satisfying the premises but falsifying the conclusion refutes a universal implication.',
          'P=T, Q=F refutes P implies Q.',
        ),
      ],
      practice: {
        question:
          'For P=F and Q=T, evaluate P implies Q and Q implies P separately. Does one imply the other in general?',
        answer: 'P implies Q is true; Q implies P is false. The two formulas are not equivalent.',
      },
    };
  }
  if (
    /\b(?:finite functions?|finite function mapping|sets and functions|injectiv(?:e|ity)|surjectiv(?:e|ity))\b/i.test(
      context,
    )
  ) {
    const input = finiteCases[0];
    const solved = functionSolution(input);
    return {
      kind: 'finite-function',
      provenance,
      workedExample: { problem: functionProblem(input), steps: solved.steps, result: solved.answer },
      terms: [
        term('Domain', 'The set of allowed inputs of a function.', set(input.domain)),
        term(
          'Codomain',
          'The declared set in which outputs must lie; it can be larger than the image.',
          set(input.codomain),
        ),
        term('Image', 'The set of outputs actually attained.', set(solved.image)),
        term('Injective', 'Distinct inputs have distinct outputs.', 'No two arrows end at the same output.'),
        term(
          'Surjective',
          'Every element of the codomain has at least one preimage.',
          'Changing only the codomain can change surjectivity.',
        ),
      ],
      practice: {
        question: functionProblem(finiteCases[1], 'g'),
        answer: functionSolution(finiteCases[1]).steps.join(' '),
      },
    };
  }
  // This bounded proof is available only when the requested theorem is the
  // triangular-number identity. An arbitrary induction lesson is not the same task.
  if (
    /\b(?:mathematical induction|induction proof|sum of (?:the first )?natural numbers)\b/i.test(context) &&
    /1\s*\+\s*2\s*\+\s*(?:\.{3}|…)\s*\+\s*n\s*=\s*n\s*\(\s*n\s*\+\s*1\s*\)\s*\/\s*2/.test(sourceBrief)
  ) {
    return {
      kind: 'triangular-number-induction',
      provenance,
      workedExample: {
        problem: 'Prove 1+2+...+n = n(n+1)/2 for every integer n ≥ 1 by mathematical induction.',
        steps: [
          'Base case n=1: the left side is 1, and 1(1+1)/2=1, so the statement holds.',
          'Induction hypothesis: fix an arbitrary integer k ≥ 1 and assume 1+2+...+k = k(k+1)/2.',
          'Induction step: 1+2+...+k+(k+1) = k(k+1)/2+(k+1), using the hypothesis only for the sum through k.',
          'Factor: k(k+1)/2+(k+1) = [k(k+1)+2(k+1)]/2 = (k+1)(k+2)/2.',
          'This is the required formula with n=k+1. The base case and the implication from k to k+1 prove the statement for every integer n ≥ 1.',
        ],
        result:
          'For all integers n ≥ 1, 1+2+...+n = n(n+1)/2. Checking finitely many values alone would not prove this universal claim.',
      },
      terms: [
        term('Base case', 'A verification at the first integer in the claimed range.', 'At n=1, both sides equal 1.'),
        term(
          'Induction hypothesis',
          'The statement at an arbitrary k, assumed temporarily when proving the next case.',
          'Assume the sum through k is k(k+1)/2.',
        ),
        term(
          'Induction step',
          'A proof that the statement at k entails the statement at k+1.',
          'Add k+1 to both the sum and its hypothesized value.',
        ),
      ],
      practice: {
        question:
          'A proposed induction step adds k to k(k+1)/2 to obtain the sum through k+1. Identify and repair the error, then factor the corrected expression.',
        answer: 'The next summand is k+1, not k. k(k+1)/2+(k+1)=(k+1)(k+2)/2.',
      },
    };
  }
  return null;
}

export function buildVerifiedDiscreteMathQuiz(lesson, count) {
  const practice = lesson.verifiedMathPractice;
  if (!practice) return null;
  if (practice.kind === 'two-valued-logic')
    return buildVerifiedLogicQuizAtoms({ ...lesson, includeConverse: true }, [], count);
  const proofQuestions = [
    [
      'What is the base-case equality at n=1?',
      ['1 = 1(1+1)/2 = 1', '1 = 1(1-1)/2 = 0', '0 = 1(1+1)/2 = 1', '1 = (1+1)/2+1 = 2'],
      'Both sides must be evaluated at the first allowed integer, n=1.',
    ],
    [
      'Which is the induction hypothesis at an arbitrary integer k ≥ 1?',
      [
        '1+2+...+k = k(k+1)/2',
        '1+2+...+(k+1) = (k+1)(k+2)/2',
        'k = k(k+1)/2 for every k',
        'The formula is true because it holds at n=1',
      ],
      'Assume only the statement through k; the statement through k+1 is what must be proved.',
    ],
    [
      'Using the induction hypothesis, which expression is the sum through k+1?',
      ['k(k+1)/2+(k+1)', 'k(k+1)/2+k', 'k(k+1)/2+1', '(k+1)(k+1)/2'],
      'The sum through k+1 equals the sum through k plus the next summand k+1.',
    ],
    [
      'Factor k(k+1)/2+(k+1). Which expression is equal to it?',
      ['(k+1)(k+2)/2', 'k(k+2)/2', '(k+1)(k+1)/2', '(k+2)(k+3)/2'],
      'A common denominator gives [k(k+1)+2(k+1)]/2, then factor k+1.',
    ],
    [
      'Why does checking n=1, 2, and 3 alone not prove the identity for every n ≥ 1?',
      [
        'It does not establish the implication from arbitrary k to k+1',
        'The first three sums are undefined',
        'The base case must start at n=3',
        'No induction proof may use examples',
      ],
      'Finite checks leave infinitely many cases; induction requires a general step as well as the base case.',
    ],
    ['What is 1+2+3+4+5 according to the proved formula?', ['15', '10', '20', '25'], 'Substitute n=5: 5(5+1)/2=15.'],
    [
      'Where is the induction hypothesis used in the proof?',
      [
        'Replacing 1+2+...+k by k(k+1)/2',
        'Declaring the k+1 formula true before proving it',
        'Checking the case n=1',
        'Choosing the variable name n',
      ],
      'The hypothesis substitutes the known symbolic value of the sum through k.',
    ],
    [
      'What range of n has this proof established?',
      ['All integers n ≥ 1', 'All real numbers n', 'Only n=1', 'Only even positive integers'],
      'The base is 1 and the step advances by one integer, reaching every positive integer.',
    ],
  ];
  return Array.from({ length: count }, (_, i) => {
    let question, choices, explanation, verification;
    if (practice.kind === 'finite-function') {
      const input = finiteCases[i];
      const result = functionSolution(input);
      question = functionProblem(input);
      choices = [
        result.answer,
        ...[
          'Injective and surjective.',
          'Injective and not surjective.',
          'Not injective and surjective.',
          'Not injective and not surjective.',
        ].filter((x) => x !== result.answer),
      ];
      explanation = result.steps.join(' ');
      verification = {
        method: 'exhaustive-finite-function',
        input,
        image: result.image,
        injective: result.injective,
        surjective: result.surjective,
      };
    } else {
      [question, choices, explanation] = proofQuestions[i];
      verification = { method: 'reviewed-induction-proof-step', theorem: 'triangular-number-sum', step: i + 1 };
    }
    const answerIndex = (i + Number(lesson.lessonNumber || 1)) % 4;
    const ordered = [...choices];
    [ordered[0], ordered[answerIndex]] = [ordered[answerIndex], ordered[0]];
    return {
      id: `L${String(lesson.lessonNumber).padStart(2, '0')}-Q${String(i + 1).padStart(2, '0')}`,
      type: 'multiple_choice',
      question,
      options: ordered.map((x, j) => `${'ABCD'[j]}. ${x}`),
      answer: 'ABCD'[answerIndex],
      answerIndex,
      sampleAnswer: choices[0],
      explanation,
      scoringGuidance: `Award 2 points for ${'ABCD'[answerIndex]}. ${explanation}`,
      points: 2,
      estimatedMinutes: 3,
      difficulty: i < 2 ? 'easy' : 'medium',
      bloomsLevel: 'Apply',
      objectiveAligned: practice.workedExample.problem,
      enrichmentSource: 'compiler-verified-discrete-math',
      sourceReviewRequired: false,
      quizPlan: { role: 'verified-mathematics-practice', bloom: 'Apply', bloomSource: 'explicit mathematical task' },
      verification,
      practiceRecord: {
        protocol: 'coursemapper-verified-discrete-math-v1',
        title: 'Synthetic mathematics exercises',
        context: provenance,
        records: practice.terms.map((t) => `${t.term}: ${t.definition}`),
        studentUse: 'Use the definitions and the inputs stated in each question. Show your reasoning.',
      },
    };
  });
}

// Project one shared, checked example into existing rendered/exported fields.
// Quiz answers stay in teacher-only fields; independent practice has no inline key.
export function projectVerifiedMathPractice(feature, data, blueprint) {
  const key = {
    lessonPlans: 'lessonPlans',
    studyGuides: 'studyGuides',
    slideDecks: 'decks',
    assignments: 'assignments',
    rubrics: 'rubrics',
  }[feature];
  if (!key || !data?.[key]) return data;
  return {
    ...data,
    [key]: data[key].map((row) => {
      const lesson = blueprint.lessons.find(
        (x) =>
          x.lessonNumber === Number(row.lessonNumber) ||
          x.title === row.lessonTitle ||
          row.relatedLessons?.includes(x.title),
      );
      const practice = lesson?.verifiedMathPractice;
      if (!practice) return row;
      const example = practice.workedExample;
      const reference = referenceFor(practice.kind);
      const objective =
        practice.kind === 'finite-function'
          ? 'Classify finite functions by checking distinct images and coverage of the declared codomain.'
          : practice.kind === 'two-valued-logic'
            ? 'Evaluate propositional formulas and distinguish an implication from its converse.'
            : 'Prove the triangular-number identity using a base case and a general inductive step.';
      const criteriaLabels =
        practice.kind === 'finite-function'
          ? [
              'Domain, codomain and image',
              'Injectivity test with an explicit input comparison',
              'Surjectivity test against every codomain element',
              'Justified classification and corrected reasoning',
            ]
          : practice.kind === 'two-valued-logic'
            ? [
                'Correct input assignments',
                'Connective evaluation in every row',
                'Implication and converse comparison',
                'Counterexample and bounded conclusion',
              ]
            : [
                'Valid base case',
                'Hypothesis at an arbitrary integer k',
                'Correct next summand and algebraic factorization',
                'Inductive conclusion and domain of validity',
              ];
      const rubricChecks =
        practice.kind === 'finite-function'
          ? [
              [
                'Lists domain, codomain and attained image separately.',
                'Correct sets, with one missing label.',
                'Confuses declared outputs with attained outputs.',
                'Provides no input or output sets.',
              ],
              [
                'Compares distinct inputs and exhibits any equal-output pair.',
                'Correct injectivity conclusion, with a terse comparison.',
                'Checks only one input pair or mistakes unequal outputs for a collision.',
                'Makes an injectivity claim without comparing inputs.',
              ],
              [
                'Checks every codomain element for a preimage.',
                'Correct surjectivity conclusion, with an incomplete written scan.',
                'Uses the image as if it were the original codomain.',
                'Does not test whether codomain elements are attained.',
              ],
              [
                'Combines both tests into a justified classification and repairs an identified mistake.',
                'Both classifications are correct; the revision rationale is brief.',
                'Only one of the two mapping properties is justified.',
                'States labels unsupported by either mapping test.',
              ],
            ]
          : practice.kind === 'two-valued-logic'
            ? [
                [
                  'Uses all four distinct assignments of P and Q in the stated order.',
                  'All input pairs appear, with a minor labeling omission.',
                  'Repeats an input pair and omits another.',
                  'Does not specify truth-value assignments.',
                ],
                [
                  'Applies each connective rule correctly to every row.',
                  'Outputs are correct but one intermediate evaluation is unstated.',
                  'Treats a false premise as automatically making an implication false.',
                  'Selects a column without evaluating its rows.',
                ],
                [
                  'Computes both directional formulas using the same assignments.',
                  'Both directions are evaluated, but their comparison is terse.',
                  'Reverses only the formula label without recomputing values.',
                  'Treats the converse as identical by definition.',
                ],
                [
                  'Gives an assignment on which the formulas differ and limits the conclusion to non-equivalence.',
                  'Uses a valid differing row but omits the final statement.',
                  'Chooses a row where both formulas agree as a counterexample.',
                  'Asserts equivalence or non-equivalence with no witness.',
                ],
              ]
            : [
                [
                  'Evaluates both sides at the initial positive integer and confirms equality.',
                  'The base equality is correct but not explicitly labeled.',
                  'Checks a later value without establishing the first allowed case.',
                  'Omits the base case.',
                ],
                [
                  'States the sum identity at arbitrary k and marks it as a temporary assumption.',
                  'The hypothesis is correct, but the arbitrariness of k is implicit.',
                  'Assumes the desired k+1 conclusion rather than the k case.',
                  'Provides no induction hypothesis.',
                ],
                [
                  'Adds the next summand and factors the expression to the successor formula.',
                  'The transformation is correct but skips an algebraic intermediate line.',
                  'Adds k instead of k+1 or distributes the denominator incorrectly.',
                  'States the successor formula without deriving it.',
                ],
                [
                  'Invokes the base and general step to conclude the identity for all positive integers.',
                  'Concludes the identity but leaves the integer range implicit.',
                  'Treats a finite list of checks as proof of the universal claim.',
                  'Does not connect the two proof obligations to a conclusion.',
                ],
              ];
      const shared = {
        verifiedPractice: { kind: practice.kind, provenance: practice.provenance },
        learningObjectives: [objective],
        references: [reference],
      };
      if (feature === 'studyGuides')
        return {
          ...row,
          ...shared,
          summary:
            practice.kind === 'finite-function'
              ? 'Separate allowed inputs, declared outputs and attained outputs before testing the two mapping properties.'
              : practice.kind === 'two-valued-logic'
                ? 'A four-row truth table tests every possible assignment. Compare the two directional statements row by row.'
                : 'An induction argument establishes the first case and proves that any established case entails its successor.',
          assignedReadings: [...(row.assignedReadings || []), reference],
          keyTerms: practice.terms,
          workedExample: example,
          objectivePractice: ['Before calculating, list the inputs and the exact conclusion you must establish.'],
          reviewQuestions: [
            practice.kind === 'finite-function'
              ? 'For h: {a,b} → {1,2,3}, h(a)=1 and h(b)=2, how does removing 3 from the codomain change surjectivity?'
              : practice.kind === 'two-valued-logic'
                ? 'With P=T and Q=F, why do an implication and its converse differ?'
                : 'Why does checking the formula at n=1 and n=2 not replace the general induction step?',
          ],
          practiceActivities: [practice.practice.question],
          conceptConnections: [example.result],
          sourceReviewRequired: true,
        };
      if (feature === 'lessonPlans')
        return {
          ...row,
          ...shared,
          objectives: [objective],
          workedExample: example,
          studentFacingSummary: example.problem,
          materials: [...(row.materials || []), reference],
          outline: row.outline.map((block, i) => ({
            ...block,
            activity:
              [
                'Recall definitions',
                'Worked mathematical example',
                'Check the reasoning',
                'Independent practice',
                'Compare and correct',
                'Exit check',
              ][i] || block.activity,
            type: i === 3 ? 'Practice' : 'Mathematical reasoning',
            description:
              i === 0
                ? practice.terms.map((t) => `${t.term}: ${t.definition}`).join(' ')
                : i === 1
                  ? example.problem
                  : i === 2
                    ? example.steps.join(' ')
                    : practice.practice.question,
            instructorNotes: i < 3 ? example.steps.join(' ') : practice.practice.answer,
            instructorRole: 'Ask students to justify each step using the stated definitions and inputs.',
          })),
          formativeCheck: {
            type: 'Mathematical practice',
            prompt: practice.practice.question,
            expectedAnswer: practice.practice.answer,
            instructorAction: 'Check the reasoning, then ask students to correct the first invalid step.',
          },
          readyToTeachSupport: {
            ...row.readyToTeachSupport,
            workedExample: [example.problem, ...example.steps, example.result].join(' '),
            studentHandout: practice.practice.question,
            instructorPrep: `${practice.provenance} Check the worked steps before teaching.`,
          },
        };
      if (feature === 'rubrics')
        return {
          ...row,
          ...shared,
          taskDirections: [practice.practice.question],
          submissionRequirements: ['Submit a labeled mathematical solution with reasoning.'],
          criteria: (row.criteria || []).map((c, i) => ({
            ...c,
            criterion: criteriaLabels[i % criteriaLabels.length],
            objectiveAligned: objective,
            evidenceSignal: `Show ${criteriaLabels[i % criteriaLabels.length].toLowerCase()} in the supplied mathematical task.`,
            exemplary: rubricChecks[i % rubricChecks.length][0],
            proficient: rubricChecks[i % rubricChecks.length][1],
            developing: rubricChecks[i % rubricChecks.length][2],
            beginning: rubricChecks[i % rubricChecks.length][3],
            feedbackUse: 'Identify the first invalid or missing step, explain why it fails, and revise it.',
          })),
          teacherNotes: practice.practice.answer,
        };
      if (feature === 'assignments')
        return {
          ...row,
          ...shared,
          objectives: [objective],
          gradingCriteria: criteriaLabels,
          highValueSuccessCriteria: criteriaLabels,
          overview: practice.practice.question,
          instructions: [
            practice.practice.question,
            'Show each reasoning step. State the definition or algebraic rule used. Check the domain of the claim before submitting.',
          ],
          expectedSubmissionFormat: 'A mathematical solution with labeled steps and a justified conclusion.',
          citationAndSourceUse: `${practice.provenance} ${reference}`,
          deliverables: ['A complete solution and one correction made after checking your reasoning.'],
        };
      const content = [
        { title: 'Definitions for the task', bullets: practice.terms.map((t) => `${t.term}: ${t.definition}`) },
        { title: 'Worked example: stated inputs', bullets: [example.problem, practice.provenance] },
        ...example.steps.map((step, i) => ({ title: `Worked reasoning — step ${i + 1}`, bullets: [step] })),
        { title: 'Independent practice', bullets: [practice.practice.question] },
        {
          title: 'Check the reasoning',
          bullets: ['Compare your steps with a partner. Find the first step you cannot justify and repair it.'],
        },
      ];
      // Keep the configured slide count and timing. Replace filler body slides,
      // packing longer derivations into the last available slot when necessary.
      const slides = row.slides.map((slide, i) => {
        const slots = Math.max(1, row.slides.length - 2);
        if (i === 0) return { ...slide, bullets: [objective] };
        if (i === row.slides.length - 1) return { ...slide, bullets: [example.result], notes: reference };
        const from = Math.floor(((i - 1) * content.length) / slots);
        const to = Math.max(from + 1, Math.floor((i * content.length) / slots));
        const chosen = content.slice(from, to);
        return {
          ...slide,
          title: chosen[0].title,
          bullets: chosen.flatMap((c) => c.bullets),
          notes: `${chosen.flatMap((c) => c.bullets).join(' ')} ${i >= row.slides.length - 3 ? practice.practice.answer : example.steps[(i - 1) % example.steps.length]}`,
          ...(i === 2 ? { type: 'content' } : {}),
          visual:
            i === 2
              ? {
                  kind: 'table',
                  tableLead:
                    practice.kind === 'two-valued-logic'
                      ? 'Row order: TT, TF, FT, FF.'
                      : 'Inspect the mathematical record.',
                  columnLabels:
                    practice.kind === 'finite-function'
                      ? ['Input', 'Output']
                      : ['Step or formula', 'Value or expression'],
                  rows:
                    practice.kind === 'finite-function'
                      ? [
                          ['a', '1'],
                          ['b', '2'],
                          ['c', '3'],
                        ]
                      : practice.kind === 'two-valued-logic'
                        ? [
                            ['P implies Q', 'T, F, T, T'],
                            ['Q implies P', 'T, T, F, T'],
                          ]
                        : [
                            ['Base n=1', '1 = 1(1+1)/2'],
                            ['Assume at k', 'S(k) = k(k+1)/2'],
                            ['Prove at k+1', 'S(k)+(k+1) = (k+1)(k+2)/2'],
                          ],
                  description: example.problem,
                  altText: example.steps.join(' '),
                }
              : {
                  kind: 'none',
                  description: '',
                  altText: 'Mathematical statements and steps are available as selectable text.',
                },
          objectiveLink: objective,
        };
      });
      return { ...row, ...shared, slides };
    }),
  };
}
