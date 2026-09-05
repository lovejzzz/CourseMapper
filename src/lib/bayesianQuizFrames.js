/**
 * Conservative, source-free Bayesian assessment frames used only when local
 * lesson enrichment exhausts its bounded retries. Keeping this disciplinary
 * data outside the compiler makes it independently cacheable and prevents
 * subject prose from defeating the compiler chunk's size ratchet.
 */
const BAYESIAN_FALLBACK_QUIZ_FRAMES = [
  {
    bloom: 'Apply',
    prompt:
      'Apply Bayesian updating to this case: a product team starts with a strong prior that a feature improves retention, then sees a small, noisy experiment that is weakly negative. Which update is most defensible?',
    correct: 'Lower the belief modestly while keeping the strong prior influential.',
    distractors: [
      'Reverse the belief completely because any new result replaces the prior.',
      'Ignore the experiment because a strong prior must never change.',
      'Average the prior probability and the raw experiment percentage.',
    ],
    explanation:
      'Weak evidence should move a strong prior only modestly; the size of the update depends on the likelihood ratio.',
  },
  {
    bloom: 'Apply',
    prompt:
      'Calculate the posterior odds when prior odds are 1:1 and new evidence has a 3:1 likelihood ratio in favor of the hypothesis.',
    correct: '3:1 in favor of the hypothesis.',
    distractors: ['1:3 against the hypothesis.', '2:1 in favor of the hypothesis.', '4:1 in favor of the hypothesis.'],
    explanation: 'Posterior odds equal prior odds multiplied by the likelihood ratio: 1 × 3 = 3.',
  },
  {
    bloom: 'Understand',
    prompt: 'Explain what a likelihood ratio expresses in Bayesian updating.',
    correct: 'How much more compatible the observed evidence is with one hypothesis than another.',
    distractors: [
      'The probability assigned to the hypothesis before observing evidence.',
      'The percentage of participants who received the treatment condition.',
      'The difference between the prior probability and the sample average.',
    ],
    explanation: 'A likelihood ratio compares how probable the observed evidence would be under competing hypotheses.',
  },
  {
    bloom: 'Understand',
    prompt: 'Explain why weak evidence might fail to overturn a strong prior.',
    correct: 'A likelihood ratio near 1 changes the prior odds only slightly.',
    distractors: [
      'Bayesian updating discards all evidence collected from small experiments.',
      'A prior becomes permanently fixed once it exceeds 50 percent.',
      'Posterior probability always equals the larger of the prior and the sample result.',
    ],
    explanation:
      'Evidence with a likelihood ratio near 1 fits the competing hypotheses similarly, so it causes only a small update.',
  },
  {
    bloom: 'Evaluate',
    prompt: 'Evaluate which product experiment result should cause the largest update away from a strong prior.',
    correct: 'A large, reliable result that would be very unlikely if the prior hypothesis were true.',
    distractors: [
      'A small, noisy result that is nearly as likely under either hypothesis.',
      'A result that repeats the assumptions used to set the prior.',
      'A result with a large raw percentage but no comparison hypothesis.',
    ],
    explanation:
      'A large update requires diagnostic evidence—a likelihood ratio far from 1—not merely a striking raw percentage.',
  },
  {
    bloom: 'Analyze',
    prompt:
      'Analyze this case: two product teams observe the same experiment but begin with different prior odds. Which conclusion is correct?',
    correct: 'They apply the same likelihood ratio but can reach different posterior odds.',
    distractors: [
      'They must reach identical posterior odds because the experiment is identical.',
      'The team with the stronger prior should ignore the likelihood ratio.',
      'The team with the weaker prior should replace its prior with the sample percentage.',
    ],
    explanation:
      'The same evidence multiplies each team’s starting odds, so different priors can yield different posteriors.',
  },
  {
    bloom: 'Evaluate',
    prompt:
      'Evaluate this claim: “The posterior is high, so the evidence must have been strong.” Which response identifies the key limitation?',
    correct:
      'A high posterior can result from a strong prior even when the new evidence has a likelihood ratio near 1.',
    distractors: [
      'A high posterior always proves that the newest experiment was decisive.',
      'The posterior contains no information from the prior odds.',
      'Evidence strength is measured only by the posterior percentage.',
    ],
    explanation:
      'Posterior odds combine prior odds and the likelihood ratio, so the posterior alone does not isolate the diagnostic strength of the new evidence.',
  },
  {
    bloom: 'Create',
    prompt:
      'A second reliable experiment produces a 1:4 likelihood ratio against the hypothesis. How should a team revise posterior odds of 8:1 before transferring the decision to a new market?',
    correct: 'Update to 2:1, then state that the new market still requires its own likelihood evidence.',
    distractors: [
      'Replace 8:1 with 1:4 and treat the new market as identical.',
      'Keep 8:1 because a posterior cannot be updated twice.',
      'Subtract four from eight to get 4:1 and apply it to every market.',
    ],
    explanation:
      'Sequential Bayesian updating multiplies 8:1 by 1:4 to yield 2:1, while transfer to a different market requires evidence that the likelihood relationship still holds.',
  },
];

export function hasBayesianDecisionEvidence(text = '') {
  const domain =
    /\b(bayesian|bayes(?:'s)? theorem|bayes theorem|prior odds|posterior odds|posterior probability|likelihood ratio)\b/.test(
      text,
    );
  const practice =
    /\b(prior beliefs?|prior probabilit(?:y|ies)|prior odds|posteriors?|likelihoods?|likelihood ratios?|update beliefs?|belief updates?|base rates?|weak evidence|product experiments?|decisions?)\b/.test(
      text,
    );
  return domain && practice;
}

export function buildBayesianFallbackQuizAtoms(lesson, quizPlan, buildTags) {
  const letters = ['A', 'B', 'C', 'D'];
  return BAYESIAN_FALLBACK_QUIZ_FRAMES.map((item, index) => {
    const plan = quizPlan[index];
    const answer = letters[(Number(lesson?.lessonNumber || 1) + index) % letters.length];
    let distractorIndex = 0;
    const options = letters.map(
      (letter) => `${letter}. ${letter === answer ? item.correct : item.distractors[distractorIndex++]}`,
    );
    return {
      id: `lesson-${lesson.lessonNumber}-q${index + 1}`,
      type: 'multiple_choice',
      bloomsLevel: item.bloom,
      difficulty: plan.difficulty,
      estimatedMinutes: plan.difficulty === 'Hard' ? 3 : 2,
      points: 2,
      objectiveAligned: plan.objective,
      intendedUse: `${String(plan.use).replace(/^./, (letter) => letter.toUpperCase())} for ${lesson.title}; ask students to justify the Bayesian update before revealing the key.`,
      question: item.prompt,
      options,
      answer,
      distractorRationale:
        'Distractors diagnose prior replacement, evidence dismissal, raw-percentage substitution, and likelihood-ratio confusion.',
      explanation: item.explanation,
      tags: buildTags(lesson, 'multiple_choice', item.bloom, plan.use),
      fallbackSource: 'discipline-verified-bayesian-frame',
      quizPlan: {
        source: plan.source,
        role: plan.role,
        bloom: plan.bloom,
        difficulty: plan.difficulty,
        intendedUse: plan.use,
        questionIndex: plan.questionIndex,
        bloomSource: plan.bloomSource,
        sourceSignal: plan.sourceSignal,
        objectiveAlignmentStrategy: plan.objectiveAlignmentStrategy,
        objectiveAlignmentRationale: plan.objectiveAlignmentRationale,
      },
    };
  });
}
