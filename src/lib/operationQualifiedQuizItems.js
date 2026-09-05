// Operation-qualified quiz frames live in a focused compiler leaf so the
// large course compiler remains within its frozen ownership and bundle ratchets.
export function createOperationQualifiedQuizBinding({
  OPERATION_QUALIFIED_EVIDENCE_PROTOCOL,
  QUIZ_ANSWER_LETTERS,
  cleanText,
  compactLessonFocusReference,
  labelQuizOption,
  lessonVariant,
  operationQualifiedWorkedExampleForLesson,
  quizQuestionId,
  stripTerminalPunctuation,
  unique,
  withQuizPlan,
}) {
  function buildRandomizedExperimentQuizItems(items, lesson, example) {
    const lessonFocus = compactLessonFocusReference(lesson);
    const objective = lesson.outcomes?.[0] || '';
    const planFor = (index, role, bloom, use) => ({
      ...(items[index]?.quizPlan || {}),
      source: 'source-grounded-quiz-plan',
      role,
      bloom,
      difficulty: index < 2 ? 'Medium' : 'Hard',
      use,
      questionIndex: index,
      bloomSource: 'compiler-verified randomized-experiment design',
      sourceSignal: example.curriculumAdmission?.demandSurface || example.problem,
      objectiveAlignmentStrategy: 'operation-curriculum-admission',
      objectiveAlignmentRationale:
        'Question assesses a named component of the randomized-experiment operation admitted by the lesson curriculum node.',
    });
    const common = (index, role, bloom, use, question) => ({
      id: items[index]?.id || quizQuestionId(lesson, index),
      bloomsLevel: bloom,
      difficulty: index < 2 ? 'Medium' : 'Hard',
      objectiveAligned: objective,
      intendedUse: `${use} for ${lessonFocus}; the item uses the compiler-verified synthetic experiment rather than topic-level recall.`,
      question,
      enrichmentSource: 'compiler-verified-operation-assessment',
      tags: unique(['quiz', 'operation-qualified', 'randomized experiment', lessonFocus, role.replace(/-/g, ' ')], 8),
      operationQualifiedEvidence: {
        protocol: OPERATION_QUALIFIED_EVIDENCE_PROTOCOL,
        operation: example.operation,
        authority: example.authority,
        verification: example.verification,
        curriculumAdmission: example.curriculumAdmission,
      },
      quizPlan: planFor(index, role, bloom, use),
    });
    const mc = (index, role, bloom, use, question, options, answer, explanation) => ({
      ...common(index, role, bloom, use, question),
      type: 'multiple_choice',
      estimatedMinutes: 2,
      points: 2,
      options: options.map((option, optionIndex) => labelQuizOption(QUIZ_ANSWER_LETTERS[optionIndex], option)),
      answer,
      sampleAnswer: `${answer}. ${explanation}`,
      explanation,
      scoringGuidance: `Award 2 points only for ${answer}; the keyed choice correctly identifies the requested experimental-design component.`,
    });
    const short = (index, role, bloom, use, question, answer, scoringGuidance) => ({
      ...common(index, role, bloom, use, question),
      type: 'short_answer',
      estimatedMinutes: 5,
      points: 4,
      answer,
      sampleAnswer: answer,
      explanation: `This item makes the ${role.replace(/-/g, ' ')} step of the randomized experiment inspectable.`,
      scoringGuidance,
    });
    return [
      mc(
        0,
        'identify-experimental-units',
        'Understand',
        'experimental-unit check',
        'In the seedling light experiment, what are the experimental units?',
        [
          'The 24 individual seedlings',
          'The two light schedules',
          'The day-14 measurements',
          'The four controlled conditions',
        ],
        'A',
        'Treatments are applied separately to each of the 24 seedlings, so each seedling is an experimental unit.',
      ),
      mc(
        1,
        'identify-treatment-and-response',
        'Apply',
        'variable-role check',
        'Which pairing correctly identifies the treatment and response in the synthetic design?',
        [
          'Treatment: initial height; response: seedling ID',
          'Treatment: 6 or 12 hours of daily light; response: height change from day 0 to day 14',
          'Treatment: day 14; response: watering schedule',
          'Treatment: container size; response: shuffled ID order',
        ],
        'B',
        'The manipulated factor is daily light duration, and the predeclared outcome is change in height over 14 days.',
      ),
      short(
        2,
        'replay-random-assignment',
        'Apply',
        'random-assignment trace',
        'The recorded shuffled order begins 07, 19, 02, 14, 23, 05. The design assigns the first 12 IDs to the 6-hour treatment. Which first three seedlings enter that treatment, and why is this trace auditable?',
        'Seedlings 07, 19, and 02 enter the 6-hour treatment. The answer follows the pre-recorded shuffled order and assignment rule, so another reviewer can replay the allocation without choosing units after seeing outcomes.',
        'Full credit names 07, 19, and 02 and explains that the stored order plus predeclared cutoff makes assignment reproducible and protects against discretionary placement.',
      ),
      mc(
        3,
        'explain-control',
        'Analyze',
        'control-condition analysis',
        'Why should soil amount, container size, watering schedule, and measurement timing be held constant across light groups?',
        [
          'To make the seedlings a probability sample of all plants',
          'To guarantee both groups have identical height changes',
          'To reduce alternative explanations for a difference attributed to light duration',
          'To replace the need for random assignment',
        ],
        'C',
        'Holding other conditions constant makes them less plausible explanations for a group difference; it does not create population representativeness or replace randomization.',
      ),
      short(
        4,
        'audit-response-measurement',
        'Analyze',
        'response-measurement audit',
        'Write the exact response calculation for seedling 07 and name one measurement rule that must be identical across groups.',
        'Response for seedling 07 = its day-14 height minus its day-0 height, measured in centimeters. A valid shared rule is to measure at the same time of day, from the same base point, with the same instrument and procedure in both groups.',
        'Full credit states day-14 minus day-0 height in centimeters and names one concrete measurement rule applied equally to both groups.',
      ),
      mc(
        5,
        'bound-causal-claim',
        'Evaluate',
        'causal-claim check',
        'Assume the assignment and measurement protocol were followed and attrition was not differential. Which conclusion is strongest without overclaiming?',
        [
          'The 12-hour schedule causes the same growth change for every plant species and setting',
          'Any observed group difference proves light is the only influence on seedling growth',
          'The experiment estimates a causal contrast between these two light schedules for these experimental units under the stated conditions',
          'The experiment proves the 24 seedlings represent the population of all plants',
        ],
        'C',
        'Random assignment supports a causal comparison inside the experiment, while the nonprobability set of seedlings limits population generalization.',
      ),
      short(
        6,
        'diagnose-validity-threat',
        'Evaluate',
        'validity-threat diagnosis',
        'Suppose five seedlings leave the 12-hour group because they overheat, while none leave the 6-hour group. Explain the threat and the honest next step.',
        'The treatment-dependent loss creates differential attrition: the remaining 12-hour seedlings may no longer be comparable with the 6-hour group. Report attrition by group, preserve an intention-to-treat analysis when outcomes are available, examine sensitivity to the missing outcomes, and qualify the causal conclusion rather than silently dropping the units.',
        'Full credit names differential attrition, explains how it breaks the original comparison, and proposes transparent reporting plus a defensible analysis or limitation.',
      ),
      short(
        7,
        'revise-with-blocking',
        'Create',
        'design-transfer task',
        'Revise the experiment to block on initial seedling height before random assignment. State the assignment procedure, the benefit, and one problem blocking cannot solve.',
        'Group seedlings into predeclared initial-height bands, then randomize within each band so both light treatments receive units from every band. Blocking can reduce chance imbalance and improve precision when initial height predicts growth. It cannot turn the seedlings into a probability sample, repair differential attrition, or justify claims beyond the tested treatments and conditions.',
        'Full credit gives a replayable within-block randomization, identifies precision or balance as the benefit, and names at least one causal or generalization limit that blocking does not remove.',
      ),
    ].slice(0, items.length);
  }

  function buildSimpleLinearRegressionQuizItems(items, lesson, example) {
    const lessonFocus = compactLessonFocusReference(lesson);
    const objective = lesson.outcomes?.[0] || example.curriculumAdmission?.demandSurface || '';
    const planFor = (index, role, bloom, use) => ({
      ...(items[index]?.quizPlan || {}),
      source: 'source-grounded-quiz-plan',
      role,
      bloom,
      difficulty: index < 2 ? 'Medium' : 'Hard',
      use,
      questionIndex: index,
      bloomSource: 'compiler-verified simple-linear-regression operation',
      sourceSignal: example.curriculumAdmission?.demandSurface || example.problem,
      objectiveAlignmentStrategy: 'operation-curriculum-admission',
      objectiveAlignmentRationale:
        'Question assesses a named component of the simple-linear-regression operation admitted by the lesson curriculum node.',
    });
    const common = (index, role, bloom, use, question) => ({
      id: items[index]?.id || quizQuestionId(lesson, index),
      bloomsLevel: bloom,
      difficulty: index < 2 ? 'Medium' : 'Hard',
      objectiveAligned: objective,
      intendedUse: `${use} for ${lessonFocus}; the item measures the admitted least-squares operation rather than a neighboring regression family.`,
      question,
      enrichmentSource: 'compiler-verified-operation-assessment',
      tags: unique(
        ['quiz', 'operation-qualified', 'simple linear regression', lessonFocus, role.replace(/-/g, ' ')],
        8,
      ),
      operationQualifiedEvidence: {
        protocol: OPERATION_QUALIFIED_EVIDENCE_PROTOCOL,
        operation: example.operation,
        authority: example.authority,
        verification: example.verification,
        curriculumAdmission: example.curriculumAdmission,
      },
      quizPlan: planFor(index, role, bloom, use),
    });
    const short = (index, role, bloom, use, question, answer, scoringGuidance) => ({
      ...common(index, role, bloom, use, question),
      type: 'short_answer',
      estimatedMinutes: index === 1 || index === 7 ? 8 : 5,
      points: index === 1 || index === 7 ? 8 : 4,
      answer,
      sampleAnswer: answer,
      explanation: `This item makes the ${role.replace(/-/g, ' ')} step of the fitted-line analysis inspectable.`,
      scoringGuidance,
    });
    const mc = (index, role, bloom, use, question, options, answer, explanation) => ({
      ...common(index, role, bloom, use, question),
      type: 'multiple_choice',
      estimatedMinutes: 3,
      points: 2,
      options: options.map((option, optionIndex) => labelQuizOption(QUIZ_ANSWER_LETTERS[optionIndex], option)),
      answer,
      sampleAnswer: `${answer}. ${explanation}`,
      explanation,
      scoringGuidance: `Award 2 points only for ${answer}; the keyed response applies the admitted least-squares operation and its stated evidence boundary.`,
    });
    return [
      short(
        0,
        'compute-slope-components',
        'Apply',
        'calculation setup check',
        'For x = [1, 2, 3] and y = [2, 4, 5], compute x-bar, y-bar, Sxx, and Sxy before fitting the line.',
        'x-bar = 2; y-bar = 11/3; Sxx = 2; Sxy = 3.',
        'Full credit reports all four quantities and shows enough centered-value work for another reader to reproduce them.',
      ),
      short(
        1,
        'fit-line',
        'Apply',
        'least-squares fit check',
        'Use Sxx = 2 and Sxy = 3 to fit the least-squares line for x = [1, 2, 3] and y = [2, 4, 5]. Show the slope and intercept calculations.',
        'b1 = Sxy/Sxx = 3/2 = 1.50. b0 = y-bar - b1(x-bar) = 11/3 - 1.50(2) = 2/3. The fitted line is predicted y = 0.67 + 1.50x.',
        'Full credit shows both formulas, obtains slope 1.50 and intercept about 0.67, and states the fitted equation.',
      ),
      short(
        2,
        'check-residuals',
        'Analyze',
        'residual trace check',
        'For the fitted line predicted y = 0.67 + 1.50x, calculate the fitted values and residuals for the three observed pairs (1, 2), (2, 4), and (3, 5). What check do the residuals satisfy?',
        'Fitted values are about 2.17, 3.67, and 5.17. Residuals y - predicted y are about -0.17, 0.33, and -0.17; they sum to approximately zero, allowing for rounding.',
        'Full credit gives all three fitted values and residuals with the correct sign convention and verifies their approximately zero sum.',
      ),
      mc(
        3,
        'interpret-slope',
        'Analyze',
        'coefficient interpretation check',
        'Which interpretation of the fitted slope 1.50 stays within the synthetic data?',
        [
          'For every possible population, increasing x by one causes y to rise exactly 1.50.',
          'Within these three observed pairs, the fitted outcome increases by 1.50 units for each one-unit increase in x.',
          'The intercept proves y can never be below 0.67.',
          'The line guarantees every future observation will lie on the fitted equation.',
        ],
        'B',
        'The slope describes the fitted association in these supplied observations; it does not establish causation or universal prediction.',
      ),
      mc(
        4,
        'bound-extrapolation',
        'Evaluate',
        'extrapolation boundary check',
        'A student extrapolates from the fitted line at observed x values 1 through 3 to predict y at x = 100. What is the most defensible response?',
        [
          'Accept the prediction because a regression equation is valid for every x.',
          'Reject all fitted values because three points can never be analyzed.',
          'Calculate it and report it as a guaranteed future outcome.',
          'Mark it as extreme extrapolation and require evidence that the linear pattern persists far beyond the observed x range.',
        ],
        'D',
        'The arithmetic is possible, but the evidence does not justify extending the fitted relationship far outside x = 1 to 3.',
      ),
      short(
        5,
        'diagnose-influence',
        'Evaluate',
        'influence diagnosis',
        'Replace the point (3, 5) with (3, 20). Without treating the new fit as final, explain what should be recomputed and why the changed point may be influential.',
        'Recompute the means, Sxy, slope, intercept, fitted values, and residuals, then compare them with the original fit. The large y value at the highest observed x can strongly change the slope and residual pattern, so the conclusion should report that sensitivity rather than hide it.',
        'Full credit names the refit and residual comparison, explains why the point can change the line, and treats influence as a diagnostic rather than an automatic deletion rule.',
      ),
      short(
        6,
        'compare-fits',
        'Analyze',
        'model comparison check',
        'Dataset A has fitted line predicted y = 0.67 + 1.50x. Dataset B has fitted line predicted y = 2.00 + 0.50x over the same x range. Compare the slopes and state one fact still needed before deciding which line fits its data better.',
        'Dataset A has the steeper fitted increase: 1.50 y-units per x-unit versus 0.50 for Dataset B. Slope alone does not show fit quality; inspect residuals or another declared fit diagnostic for each dataset before deciding which line fits better.',
        'Full credit compares the two slopes correctly and asks for residual-based or equivalent fit evidence instead of equating steepness with quality.',
      ),
      short(
        7,
        'transfer-and-bound',
        'Create',
        'replayable transfer task',
        'For the new pairs (1, 3), (2, 3), and (3, 6), write a replayable plan to fit and interpret a simple linear regression. Include the required calculations, one diagnostic, and the final claim boundary.',
        'Compute x-bar and y-bar, then Sxx and Sxy; calculate b1 = Sxy/Sxx and b0 = y-bar - b1(x-bar); report the fitted equation; calculate fitted values and residuals and inspect their pattern; interpret the slope only for these observations and x range; do not claim causation or unsupported extrapolation.',
        'Full credit gives the input-to-equation sequence, names a residual diagnostic, interprets the coefficient in context, and states both causal and extrapolation limits.',
      ),
    ].slice(0, items.length);
  }

  function applyOperationQualifiedQuizBinding(items, lesson, { machineScored = false } = {}) {
    if (!Array.isArray(items) || items.length === 0 || machineScored) return items;
    const example = operationQualifiedWorkedExampleForLesson(lesson);
    if (
      example?.protocol !== OPERATION_QUALIFIED_EVIDENCE_PROTOCOL ||
      example?.verification?.checked !== true ||
      !cleanText(example?.problem) ||
      !Array.isArray(example?.steps) ||
      example.steps.filter((step) => cleanText(step)).length < 2 ||
      !cleanText(example?.result)
    ) {
      return items;
    }
    if (example.operation === 'design-and-audit-randomized-experiment') {
      return buildRandomizedExperimentQuizItems(items, lesson, example);
    }
    if (example.operation === 'fit-and-interpret-simple-linear-regression') {
      return buildSimpleLinearRegressionQuizItems(items, lesson, example);
    }
    const targetIndex = items.findIndex((item) =>
      /source-application|artifact-analysis/i.test(cleanText(item?.quizPlan?.role)),
    );
    if (targetIndex < 0) return items;
    const prior = items[targetIndex] || {};
    const plan = {
      ...(prior.quizPlan || {}),
      source: 'source-grounded-quiz-plan',
      role: 'operation-qualified-application',
      bloom: 'Apply',
      difficulty: prior.quizPlan?.difficulty || 'Medium',
      use: 'operation-qualified formative check',
      questionIndex: targetIndex,
      bloomSource: 'compiler-verified operation demand',
      sourceSignal: example.curriculumAdmission?.demandSurface || example.problem,
      objectiveAlignmentStrategy: 'operation-curriculum-admission',
      objectiveAlignmentRationale:
        'Question executes the operation admitted by the lesson curriculum node and scores its result, interpretation, and boundary.',
    };
    const inputs = (example.inputs || []).map(cleanText).filter(Boolean);
    const steps = example.steps.map(cleanText).filter(Boolean);
    const lessonFocus = compactLessonFocusReference(lesson);
    const operationDirections = lessonVariant(lesson, [
      'Show the intermediate calculation or procedural trace, report the result, interpret what it means, and state one boundary the result does not cross.',
      'Make every step inspectable, then give the verified result, explain it in context, and identify a conclusion the result cannot support.',
      'Write the input-to-output trace, state the resulting value, interpret that value for this problem, and mark the limit on the inference.',
      'Document the procedure in sequence, present the final result, explain its practical meaning, and name one condition beyond which it should not be extended.',
      'Expose the calculation path from the supplied inputs to the answer, interpret the answer in context, and separate the warranted claim from one overclaim.',
      'Record enough work to reproduce the operation, give the result, explain what the result says here, and specify one boundary on its use.',
      'Carry out the operation with visible intermediate work, report and contextualize the result, then state what additional conclusion the evidence does not establish.',
      'Trace the procedure from inputs through the final value, explain the value in this setting, and finish with one explicit limitation.',
    ]);
    const operationScoringGuidance = lessonVariant(lesson, [
      'Full credit requires the correct intermediate trace, the verified result, a context-appropriate interpretation, and an explicit boundary; a correct number without reasoning or interpretation is incomplete.',
      'Award full credit when the work exposes the procedure, reaches the verified value, explains that value in context, and states a defensible limit. An unexplained result is partial.',
      'Score the input-to-output work, final result, contextual meaning, and inference boundary as four separate requirements; the result alone does not complete the task.',
      'A complete response is reproducible from its written steps, reports the checked result, interprets it for the problem, and distinguishes one unsupported conclusion.',
      'Give full credit for an inspectable calculation path, the verified answer, an accurate contextual reading, and one explicit condition on use. Reduce credit when any link is hidden.',
      'Evaluate whether another reader can reproduce the operation, confirm the result, understand its meaning here, and see where the conclusion stops. Numeric accuracy alone is insufficient.',
      'All points require visible intermediate work, the checked output, a problem-specific interpretation, and a stated limitation; award partial credit when the chain is incomplete.',
      'Score completeness across four elements: procedure, result, interpretation, and boundary. The response must connect them rather than list an isolated answer.',
    ]);
    const question = `Apply the bounded course operation for ${lessonFocus}. Problem: ${stripTerminalPunctuation(
      example.problem,
    )}. ${inputs.length > 0 ? `Use these supplied inputs: ${inputs.join('; ')}. ` : ''}${operationDirections}`;
    const operationItem = withQuizPlan(
      {
        id: prior.id || quizQuestionId(lesson, targetIndex),
        type: 'short_answer',
        bloomsLevel: 'Apply',
        difficulty: plan.difficulty,
        estimatedMinutes: Math.max(6, Number(prior.estimatedMinutes) || 0),
        points: Math.max(6, Number(prior.points) || 0),
        objectiveAligned:
          prior.objectiveAligned || example.curriculumAdmission?.demandSurface || lesson.outcomes?.[0] || '',
        intendedUse: `Executable operation check for ${lessonFocus}; score the trace, result, interpretation, and evidence boundary against the compiler-verified specimen.`,
        question,
        answer: cleanText(example.result),
        sampleAnswer: [
          ...steps,
          cleanText(example.result),
          cleanText(example.interpretation),
          cleanText(example.boundary),
        ]
          .filter(Boolean)
          .join(' '),
        explanation: `This item assesses the admitted ${cleanText(example.operation)} operation itself rather than vocabulary about the operation.`,
        scoringGuidance: operationScoringGuidance,
        tags: unique(
          ['quiz', 'operation-qualified', cleanText(example.operation), lessonFocus, 'calculation', 'interpretation'],
          8,
        ),
        enrichmentSource: 'compiler-verified-operation-assessment',
        operationQualifiedEvidence: {
          protocol: OPERATION_QUALIFIED_EVIDENCE_PROTOCOL,
          operation: example.operation,
          authority: example.authority,
          verification: example.verification,
          curriculumAdmission: example.curriculumAdmission,
        },
      },
      plan,
    );
    return items.map((item, index) => (index === targetIndex ? operationItem : item));
  }

  return applyOperationQualifiedQuizBinding;
}
