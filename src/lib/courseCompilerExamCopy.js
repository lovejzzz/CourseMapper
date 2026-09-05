import { cleanText, sentenceCase, stripTerminalPunctuation } from './compilerText';

const CONSTRUCTED_RESPONSE_DEPTH_DIRECTIVES = [
  'Select one relevant course concept, cite one evidence detail, and state a limitation.',
  'Choose the method that best fits, point to one case observation, and name the evidence boundary.',
  'Identify the framework controlling your answer, use one source detail, and explain what the evidence cannot establish.',
  'Name the principle guiding your answer, reference one claim-card detail, and identify an alternative or limitation.',
  'Select a relevant method, draw on one case detail, and state where that account stops.',
  'Choose a course lens, support it with one observation, and name the next piece of evidence needed.',
  'Identify the rule behind your reasoning, cite one result, and distinguish what it does not prove.',
  'Name the concept you selected, use one source detail, and state what remains unproven.',
];

export function strengthenShortAnswerDepth(question = {}, plan = {}) {
  if (question?.type !== 'short_answer') return question;
  const prompt = cleanText(question?.question);
  const independentlySelectsConcept =
    /\b(?:identify|select|choose|name)\b.{0,80}\b(?:concepts?|methods?|frameworks?|principles?|rules?|lens(?:es)?)\b/i.test(
      prompt,
    );
  const citesEvidence =
    /\b(?:cite|use|reference|point to|draw on|support)\b.{0,80}\b(?:evidence|detail|observation|result|quote|case|claim(?:-card)?|card)s?\b/i.test(
      prompt,
    );
  const boundsClaim =
    /\b(?:limit(?:ation)?|boundary|alternative|next piece of evidence|cannot support|remains? unproven|does not (?:prove|establish)|where (?:that|the) account stops)\b/i.test(
      prompt,
    );
  if (independentlySelectsConcept && citesEvidence && boundsClaim) return question;
  const index = Math.max(0, Number(plan?.questionIndex) || 0);
  const directive = CONSTRUCTED_RESPONSE_DEPTH_DIRECTIVES[index % CONSTRUCTED_RESPONSE_DEPTH_DIRECTIVES.length];
  return {
    ...question,
    question: `${stripTerminalPunctuation(prompt)}. ${directive}`,
  };
}

const COMPILER_PRACTICE_RECOVERY_COPY = [
  {
    answer: 'Accept a claim traced to a named case detail, with its inference and boundary made explicit.',
    sampleAnswer:
      'Name the relevant evidence, explain how its observable feature supports the claim, and mark one defensible limit.',
    explanation: 'This item checks whether the learner can trace the practice case evidence to a bounded conclusion.',
  },
  {
    answer:
      'A valid response selects a fitting method, applies it to an inspectable example, and qualifies the result.',
    sampleAnswer:
      'Choose the method, identify the deciding observation, connect it to the judgment, and state what remains uncertain.',
    explanation:
      'This response reveals whether the course-created case supports the selected reasoning path and its stated limit.',
  },
  {
    answer:
      'Credit reasoning that identifies the controlling concept, uses visible evidence, and rejects an unsupported extension.',
    sampleAnswer:
      'State the concept, point to the case feature it explains, and separate the supported conclusion from an overreach.',
    explanation:
      'The item measures evidence selection, interpretation, and qualification within the packaged practice record.',
  },
  {
    answer:
      'The response must connect one course principle to a concrete observation and preserve the evidence boundary.',
    sampleAnswer:
      'Identify the governing principle, cite the observable detail, explain the connection, and name the claim it cannot prove.',
    explanation: 'Success requires a defensible path from an observable case detail to a carefully limited claim.',
  },
  {
    answer:
      'Accept a defensible interpretation supported by a specific practice record and limited where that record ends.',
    sampleAnswer:
      'Select the relevant record detail, use it to justify the interpretation, and identify evidence needed for a broader claim.',
    explanation:
      'The task tests whether the learner can use practice evidence without extending it beyond its boundary.',
  },
  {
    answer:
      'Full credit requires a chosen analytical lens, a cited result, a warranted inference, and an unresolved boundary.',
    sampleAnswer:
      'Name the lens, cite the result that controls the reasoning, draw the bounded conclusion, and state what remains unproven.',
    explanation:
      'This constructed response checks case-based reasoning, evidence use, and recognition of what remains unproven.',
  },
];

export function compilerPracticeRecoveryCopy(lessonNumber = 1) {
  const index = Math.max(0, Math.trunc(Number(lessonNumber) || 1) - 1) % COMPILER_PRACTICE_RECOVERY_COPY.length;
  return COMPILER_PRACTICE_RECOVERY_COPY[index];
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
    `The phrase “${concept}” is treated as covering every idea in ${lessonFocus}, so evidence never changes how it should be applied.`,
  ({ concept, sourceCue }) =>
    `The first example in ${sourceCue} is treated as determining the meaning of ${concept}, even when later evidence contradicts it.`,
  ({ concept, lessonFocus }) =>
    `Once the phrase “${concept}” appears in ${lessonFocus}, its meaning is carried into any context without checking limits.`,
  ({ concept, lessonFocus }) =>
    `Using the phrase “${concept}” requires no distinction among claims in ${lessonFocus}; every example supports it equally.`,
  ({ concept, lessonFocus }) =>
    `Any mention of ${lessonFocus} demonstrates ${concept}, even when the source offers no relevant evidence.`,
  ({ concept, sourceCue }) =>
    `An interpretation of ${concept} stays correct whenever the same wording appears in ${sourceCue}, regardless of the claim being tested.`,
  ({ concept, lessonFocus }) =>
    `Treating ${concept} as a label is sufficient for ${lessonFocus}; no relationship needs to be explained.`,
  ({ concept, sourceCue }) =>
    `${sentenceCase(sourceCue)} makes every ${concept} interpretation equally defensible, even when the interpretations conflict.`,
  ({ concept, lessonFocus }) =>
    `A claim about ${lessonFocus} counts as evidence for ${concept} merely because it uses the course vocabulary.`,
  ({ concept, sourceCue }) =>
    `${sentenceCase(concept)} can be applied before examining ${sourceCue}; source details cannot alter the conclusion.`,
  ({ concept, lessonFocus }) =>
    `The broadest statement about ${lessonFocus} is always the strongest use of ${concept}.`,
  ({ concept, lessonFocus }) =>
    `A familiar ${lessonFocus} example is treated as enough to apply ${concept}, without a reason connecting it to the question.`,
];

export function examAtomPaddingOptions({ concept, lessonFocus, sourceCue, lessonNumber, questionIndex }) {
  const lessonOrdinal = Number.isFinite(Number(lessonNumber)) ? Math.max(1, Math.trunc(Number(lessonNumber))) : 1;
  const questionOrdinal = Number.isFinite(Number(questionIndex)) ? Math.max(0, Math.trunc(Number(questionIndex))) : 0;
  const start = Math.abs(lessonOrdinal + questionOrdinal - 2) % EXAM_ATOM_PADDING_TEMPLATES.length;
  const normalizedSourceCue = cleanExamSourceCue(sourceCue);
  return Array.from({ length: 3 }, (_, offset) =>
    EXAM_ATOM_PADDING_TEMPLATES[(start + offset) % EXAM_ATOM_PADDING_TEMPLATES.length]({
      concept,
      lessonFocus,
      sourceCue: normalizedSourceCue,
    }),
  );
}

const IMPERATIVE_SOURCE_CUE =
  /^(?:analy[sz]e|annotate|apply|build|choose|compare|complete|create|defend|draft|evaluate|explain|identify|interpret|prepare|review|revise|run|select|test|trace|use)\b/i;

function cleanExamSourceCue(value) {
  const cue = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,:;]\s*$/, '');
  const wordCount = (cue.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) || []).length;
  if (!cue || wordCount > 10 || IMPERATIVE_SOURCE_CUE.test(cue)) return 'the assigned source evidence';
  return cue;
}
