import { selectComposedLessonVariant } from './courseCompilerRealization';

const CONTEXT_PREFIXES = ['After a check, ', 'In peer review, ', 'Before discussion, ', 'With a partner, '];
const AUDIT_SUFFIXES = [
  'recording the reason',
  'keeping the decision inspectable',
  'noting what remains unsupported',
  'preserving the evidence trail',
];

function expandedLeadPool(items) {
  return items.flatMap((item, index) => {
    const lower = `${item.charAt(0).toLowerCase()}${item.slice(1)}`;
    return [item, ...[0, 1, 2].map((offset) => `${CONTEXT_PREFIXES[(index + offset) % 4]}${lower}`)];
  });
}

function expandedTailPool(items) {
  return items.flatMap((item, index) => [
    item,
    ...[0, 1, 2].map((offset) => `${item.replace(/[.!?]+$/g, '')}, ${AUDIT_SUFFIXES[(index + offset) % 4]}.`),
  ]);
}

export function lessonPracticeMoveVariant({
  lesson,
  concept,
  artifact,
  basePracticeMove,
  basePracticeClause,
  defaultPracticeMove,
}) {
  const leads = defaultPracticeMove
    ? [
        `Partners audit one ${concept} evidence choice`,
        `Students compare two ${concept} support options`,
        `Peer-audit the ${concept} evidence`,
        `Move from solo ${concept} marking to paired critique`,
      ]
    : [
        `${basePracticeMove} with ${concept}`,
        `After ${basePracticeClause}, students compare one support choice`,
        `Peer-audit the result after students ${basePracticeClause}`,
        `Move from ${basePracticeClause} to paired ${concept} critique`,
      ];
  return selectComposedLessonVariant(
    lesson,
    'lesson-teaching-moves.practice',
    expandedLeadPool(leads),
    expandedTailPool([
      `then name what changes in ${artifact}.`,
      `then reject weak support and revise ${artifact}.`,
      `to flag inspectable evidence, overreach, and the needed ${artifact} change.`,
      `and record the evidence-backed decision in ${artifact}.`,
    ]),
    ' ',
  );
}

export function slideObjectiveFallbackVariant({ lesson, concept, artifact }) {
  return selectComposedLessonVariant(
    lesson,
    'slides.objective-fallback',
    expandedLeadPool([
      `Evaluate the ${concept} evidence`,
      `Judge the strongest ${concept} evidence`,
      `Trace the effect of ${concept} evidence`,
      `Test the limits of ${concept} evidence`,
    ]),
    expandedTailPool([
      `to decide how ${artifact} should change.`,
      `to justify one ${artifact} revision.`,
      `before revising ${artifact}.`,
      `to separate a supported ${artifact} claim from overreach.`,
    ]),
    ' ',
  );
}

export function slideInspectableEvidenceVariant({ lesson, concept, sourceCue = '' }) {
  const location = sourceCue ? ` in ${sourceCue}` : '';
  return selectComposedLessonVariant(
    lesson,
    'slides.example-inspectable-evidence',
    expandedLeadPool(['Identify', 'Mark', 'Locate', 'Highlight']),
    expandedTailPool([
      `the ${concept} evidence students can inspect${location}.`,
      `one inspectable ${concept} detail${location}.`,
      `the observable ${concept} support${location}.`,
      `which ${concept} evidence can be checked${location}.`,
    ]),
    ' ',
  );
}

export function slideClosingFeedbackVariant({ lesson, displayTitle }) {
  return selectComposedLessonVariant(
    lesson,
    'slides.closing-feedback-transfer',
    [
      `Apply feedback from ${displayTitle}`,
      `Carry a priority from ${displayTitle}`,
      `Use a revision note from ${displayTitle}`,
      `Act on critique from ${displayTitle}`,
      `Bring one justified change from ${displayTitle}`,
      `Preserve the key critique from ${displayTitle}`,
      `Start from a revision in ${displayTitle}`,
      `Transfer the evidence lesson from ${displayTitle}`,
      `Keep the best feedback from ${displayTitle}`,
      `Reuse one lesson from ${displayTitle}`,
      `Advance one revision from ${displayTitle}`,
      `Retain the strongest change from ${displayTitle}`,
      `Begin with critique from ${displayTitle}`,
      `Carry the evidence check from ${displayTitle}`,
      `Apply one peer-tested change from ${displayTitle}`,
      `Use the strongest correction from ${displayTitle}`,
    ],
    [
      'before the next task.',
      'when the next task begins.',
      'to strengthen the next task.',
      'as the next task opens.',
      'before adding new evidence.',
      'as the first quality check.',
      'when selecting the next evidence.',
      'so the next decision starts stronger.',
      'before making the next claim.',
      'as the next task takes shape.',
      'to guide the next evidence choice.',
      'before the next peer check.',
      'when setting the next direction.',
      'as the next revision begins.',
      'to test the next decision.',
      'before committing to the next move.',
    ],
    ' ',
  );
}
