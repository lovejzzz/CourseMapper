import type { Activity } from './domain';
type Extent = { unit: 'words' | 'characters'; min: number; max: number };
export function responseLengths(text: string): Extent[] {
  return [...text.matchAll(/(\d{1,4})\s*(?:[-–—]|to|and|至|到)\s*(\d{1,4})\s*[- ]?\s*(words?|characters?|字)/gi)].map(
    (match) => ({
      min: Number(match[1]),
      max: Number(match[2]),
      unit: /word/i.test(match[3]) ? ('words' as const) : ('characters' as const),
    }),
  );
}
export function responseLength(text: string, unit: Extent['unit']): number {
  return unit === 'words'
    ? (text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) ?? []).length
    : [...text.replace(/[\s\p{P}\p{S}]/gu, '')].length;
}
export function joinAnswerParts(parts: NonNullable<Activity['answerParts']>): string {
  return parts.map((part) => `${part.title}\n${part.text}`).join('\n\n');
}
export function verifyAnswer(
  activity: Pick<Activity, 'answer' | 'answerParts' | 'prompt'> & { product?: string },
  additionalRequirements = '',
): string[] {
  const errors: string[] = [];
  const parts = activity.answerParts;
  if (parts && joinAnswerParts(parts) !== activity.answer)
    errors.push('Answer text and its editable response sections disagree.');
  for (const part of parts ?? [])
    if (part.length) {
      const count = responseLength(part.text, part.length.unit);
      if (part.length.min > part.length.max || count < part.length.min || count > part.length.max)
        errors.push(
          `${part.title}: model response contains ${count} ${part.length.unit}; required ${part.length.min}–${part.length.max}. Revise the actual response, not its declared limit.`,
        );
    }
  for (const required of responseLengths(`${activity.prompt}\n${activity.product ?? ''}\n${additionalRequirements}`)) {
    const candidates = parts?.filter((p) => p.length?.unit === required.unit).map((p) => p.text) ?? [activity.answer];
    if (
      !candidates.some((text) => {
        const count = responseLength(text, required.unit);
        return count >= required.min && count <= required.max;
      })
    )
      errors.push(
        `The task requires a complete response section of ${required.min}–${required.max} ${required.unit}, but the model answer has no section meeting it. Include a length-constrained answer section and satisfy the task's original requirement.`,
      );
  }
  return [...new Set(errors)];
}
