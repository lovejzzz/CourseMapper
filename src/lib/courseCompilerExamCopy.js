import { sentenceCase } from './compilerText';

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
