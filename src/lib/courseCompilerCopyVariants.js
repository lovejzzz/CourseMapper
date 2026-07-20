import { sentenceCase } from './compilerText';

function variantIndex(lessonNumber, length) {
  const ordinal = Number.isFinite(Number(lessonNumber)) ? Math.trunc(Number(lessonNumber)) : 1;
  return (Math.max(1, ordinal) - 1) % length;
}

function selectVariant(lessonNumber, variants) {
  return variants[variantIndex(lessonNumber, variants.length)];
}

const EXAM_UNDERSTAND_CORRECT_TEMPLATES = [
  ({ concept, lessonFocus }) =>
    `${sentenceCase(concept)} explains a specific ${lessonFocus} decision and names the evidence that supports it.`,
  ({ concept, lessonFocus }) =>
    `The response uses ${concept} to justify one concrete ${lessonFocus} decision, citing the evidence behind it.`,
  ({ concept, lessonFocus }) =>
    `A specific ${lessonFocus} decision is explained through ${concept}, with the supporting evidence named.`,
  ({ concept, lessonFocus }) =>
    `The answer connects one ${lessonFocus} decision to ${concept} and points out its supporting evidence.`,
  ({ concept, lessonFocus }) =>
    `Applying ${concept} accounts for a particular ${lessonFocus} decision and the evidence used to make it.`,
];

export function examUnderstandCorrectText({ concept, lessonFocus, variant = 0 }) {
  return EXAM_UNDERSTAND_CORRECT_TEMPLATES[variant % EXAM_UNDERSTAND_CORRECT_TEMPLATES.length]({
    concept,
    lessonFocus,
  });
}

const EXAM_ATOM_PADDING_TEMPLATES = [
  ({ concept, lessonFocus }) =>
    `${sentenceCase(concept)} covers every idea in ${lessonFocus}, so evidence never changes how it should be applied.`,
  ({ concept, sourceCue }) =>
    `${sentenceCase(concept)} is determined by the first example in ${sourceCue}, even when later evidence contradicts it.`,
  ({ concept, lessonFocus }) =>
    `Once ${concept} is named in ${lessonFocus}, its meaning can be carried into any context without checking limits.`,
  ({ concept, lessonFocus }) =>
    `${sentenceCase(concept)} requires no distinction among claims in ${lessonFocus}; every example supports it equally.`,
  ({ concept, lessonFocus }) =>
    `Any mention of ${lessonFocus} demonstrates ${concept}, even when the source offers no relevant evidence.`,
  ({ concept, sourceCue }) =>
    `${sentenceCase(concept)} stays correct whenever the same wording appears in ${sourceCue}, regardless of the claim being tested.`,
  ({ concept, lessonFocus }) =>
    `Treating ${concept} as a label is sufficient for ${lessonFocus}; no relationship needs to be explained.`,
  ({ concept, sourceCue }) =>
    `${sentenceCase(sourceCue)} makes every ${concept} interpretation equally defensible, even when the interpretations conflict.`,
  ({ concept, lessonFocus }) =>
    `A claim about ${lessonFocus} counts as ${concept} evidence merely because it uses the course vocabulary.`,
  ({ concept, sourceCue }) =>
    `${sentenceCase(concept)} can be applied before examining ${sourceCue}; source details cannot alter the conclusion.`,
  ({ concept, lessonFocus }) =>
    `The broadest statement about ${lessonFocus} is always the strongest use of ${concept}.`,
  ({ concept, lessonFocus }) =>
    `${sentenceCase(concept)} needs only a familiar ${lessonFocus} example, not a reason connecting it to the question.`,
];

export function examAtomPaddingOptions({ concept, lessonFocus, sourceCue, lessonNumber, questionIndex }) {
  const lessonOrdinal = Number.isFinite(Number(lessonNumber)) ? Math.max(1, Math.trunc(Number(lessonNumber))) : 1;
  const questionOrdinal = Number.isFinite(Number(questionIndex)) ? Math.max(0, Math.trunc(Number(questionIndex))) : 0;
  const start = Math.abs(lessonOrdinal + questionOrdinal - 2) % EXAM_ATOM_PADDING_TEMPLATES.length;
  return Array.from({ length: 3 }, (_, offset) =>
    EXAM_ATOM_PADDING_TEMPLATES[(start + offset) % EXAM_ATOM_PADDING_TEMPLATES.length]({
      concept,
      lessonFocus,
      sourceCue,
    }),
  );
}

export function examFactCopy({ lessonNumber, assessmentTitle, lessonFocus, answer }) {
  return {
    intendedUse: selectVariant(lessonNumber, [
      `Summative accuracy item on ${assessmentTitle}; students separate the authored ${lessonFocus} fact from documented misconceptions.`,
      `Use in ${assessmentTitle} to distinguish the supported ${lessonFocus} claim from familiar but incorrect alternatives.`,
      `${assessmentTitle} accuracy check: identify which ${lessonFocus} statement the course evidence actually supports.`,
      `Summative ${lessonFocus} check for ${assessmentTitle}; students rule out documented misconceptions with course evidence.`,
      `Use this ${assessmentTitle} item to test whether students can recognize an evidence-backed ${lessonFocus} claim.`,
      `${assessmentTitle} concept check: separate the admitted ${lessonFocus} fact from unsupported interpretations.`,
    ]),
    question: selectVariant(lessonNumber, [
      `Which statement about ${lessonFocus} is accurate, according to the course materials?`,
      `Which option matches the course's supported account of ${lessonFocus}?`,
      `Based on the course evidence, which claim about ${lessonFocus} is defensible?`,
      `Which claim correctly represents ${lessonFocus} in this course?`,
      `Select the statement about ${lessonFocus} that the assigned materials support.`,
      `Which description of ${lessonFocus} aligns with the evidence used in class?`,
    ]),
    distractorRationale: selectVariant(lessonNumber, [
      `The wrong options preserve documented misconceptions from covered lessons; only one option states the admitted ${lessonFocus} fact.`,
      `Each distractor is a recorded misconception or a claim about a different lesson, while the key matches the ${lessonFocus} evidence.`,
      `Incorrect choices sound course-relevant but conflict with the admitted ${lessonFocus} fact or apply another lesson's idea.`,
      `The distractors test whether students can reject familiar ${lessonFocus} errors instead of choosing by vocabulary alone.`,
      `Wrong answers reuse documented misunderstandings; the keyed statement is the one supported by the ${lessonFocus} source atom.`,
      `Only the key survives comparison with the admitted ${lessonFocus} evidence; the alternatives preserve known misconceptions.`,
    ]),
    explanation: selectVariant(lessonNumber, [
      `${answer} gives the admitted ${lessonFocus} fact; the remaining choices conflict with the course evidence.`,
      `The course materials support ${answer} for ${lessonFocus}, while the alternatives reproduce misconceptions or unrelated claims.`,
      `${answer} matches the evidence-backed account of ${lessonFocus}; each other option fails that source check.`,
      `Choose ${answer} because it represents ${lessonFocus} as taught; the distractors preserve documented errors.`,
      `The admitted ${lessonFocus} evidence uniquely supports ${answer}, not the competing interpretations.`,
      `${answer} is consistent with the course's ${lessonFocus} fact set; the other statements are unsupported here.`,
    ]),
  };
}

export function titleSlideOpening({ lessonNumber, displayTitle, concepts, artifact }) {
  return selectVariant(lessonNumber, [
    `Frame ${displayTitle} as a working session on ${concepts}, with ${artifact} as the visible product.`,
    `Open ${displayTitle} around ${concepts} and name ${artifact} as the work students will visibly improve.`,
    `Position ${displayTitle} as an evidence workshop: students use ${concepts} to move ${artifact} forward.`,
    `Begin ${displayTitle} with the ${concepts} decision that students must make visible in ${artifact}.`,
    `Make the destination concrete at the start of ${displayTitle}: ${concepts} should change ${artifact}.`,
    `Launch ${displayTitle} by showing where ${concepts} will appear in the finished ${artifact}.`,
  ]);
}

export function titleSlideNote({ lessonNumber, displayTitle, safeAnchor, concept, artifactReference }) {
  return selectVariant(lessonNumber, [
    `Start the ${displayTitle} working session by connecting ${safeAnchor} to ${artifactReference}. Students should be able to name the ${concept} decision the product will capture.`,
    `Use ${safeAnchor} to open ${displayTitle}, then ask students where ${concept} should become visible in ${artifactReference}.`,
    `Introduce ${displayTitle} through ${safeAnchor}; before moving on, students point to the ${concept} evidence that will guide ${artifactReference}.`,
    `Lead into ${displayTitle} with ${safeAnchor} and have students state which ${concept} choice ${artifactReference} will test.`,
    `Make ${safeAnchor} the entry point for ${displayTitle}; students identify the ${concept} decision they will defend in ${artifactReference}.`,
    `Launch ${displayTitle} from ${safeAnchor}, asking students to predict how ${concept} should change ${artifactReference}.`,
  ]);
}

export function kernelFactInstructorNote({ lessonNumber, kernelFactLedger }) {
  return selectVariant(lessonNumber, [
    `Teach from the admitted source-grounded fact set: ${kernelFactLedger} Keep the claims visible during the model; students identify the fact behind each practice decision.`,
    `Build the model from these admitted facts: ${kernelFactLedger} After each reasoning move, ask which numbered fact makes it defensible.`,
    `Use this source-grounded fact ledger for the demonstration: ${kernelFactLedger} Students annotate where each fact changes the worked decision.`,
    `Keep the admitted evidence in view while modeling: ${kernelFactLedger} Pause so students can connect every practice choice to its supporting fact.`,
    `Model with only these admitted course claims: ${kernelFactLedger} Have students name the evidence used at each decision point.`,
    `Anchor the worked explanation in this fact set: ${kernelFactLedger} Before transfer, students match each reasoning step to the claim that supports it.`,
  ]);
}
