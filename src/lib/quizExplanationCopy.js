import { selectComposedLessonVariant } from './courseCompilerRealization';

export function quizExtensionCopy(answer, concept, artifact, lesson, index) {
  if (index === 6) {
    return selectComposedLessonVariant(
      lesson,
      'quiz-explanation:evidence-limitation:v01702c',
      [
        `${answer} bounds ${concept}`,
        `${answer} limits ${concept}`,
        `${answer} supports ${concept}`,
        `${answer} checks ${concept}`,
      ],
      [
        `${artifact} is warranted, not a broader claim.`,
        `${artifact} is supported; uncertainty remains.`,
        `${artifact} follows one cited detail, no more.`,
        `${artifact} follows the evidence and marks its limit.`,
      ],
    );
  }
  if (index > 6) {
    return selectComposedLessonVariant(
      lesson,
      'quiz-explanation:revision-transfer',
      [
        `${answer} transfers ${concept}`,
        `${answer} tests ${concept}`,
        `${answer} uses ${concept} cautiously`,
        `${answer} bounds the next ${concept} step`,
      ],
      [
        `a new case is checked before changing ${artifact}.`,
        `fresh evidence is tested for ${artifact}.`,
        `the comparison is inspected before ${artifact}.`,
        `a new case is verified before generalizing ${artifact}.`,
      ],
    );
  }
  return '';
}
