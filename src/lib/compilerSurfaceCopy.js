import { cleanText, splitList } from './compilerText';

export function normalizeActivityInstruction(value) {
  const text = cleanText(value);
  if (!text) return '';
  return text.replace(
    /^run\s+(critique|review|discussion|feedback|reflection)\s+(round|session|workshop|activity|exercise)\b/i,
    (_match, activity, format) => `Run a ${activity.toLowerCase()} ${format.toLowerCase()}`,
  );
}

export function normalizeActivityInstructions(value) {
  return splitList(value).map(normalizeActivityInstruction).filter(Boolean).join('; ');
}

export function conceptWorkQuestion(value) {
  const concept = cleanText(value, 'this concept');
  const plural =
    /\b(?:forms|principles|guidelines|criteria|methods|techniques|standards|patterns|practices|requirements|roles)\b$/i.test(
      concept,
    );
  return `How ${plural ? 'do' : 'does'} ${concept} actually work?`;
}

export function publishableCourseCredits(value) {
  const text = cleanText(value);
  return !text ||
    /^(?:credits?|credit hours?)$/i.test(text) ||
    /\b(?:tbd|to be determined|unknown|placeholder|replace with|not specified|none|n\/a)\b/i.test(text)
    ? 'Credit value: confirm in the course site'
    : text;
}

export function publishableCourseTerm(value) {
  const text = cleanText(value);
  return !text ||
    /^(?:term|semester)$/i.test(text) ||
    /\b(?:tbd|to be determined|unknown|placeholder|replace with|semester year|course term|not specified|none|n\/a)\b/i.test(
      text,
    )
    ? 'Term and dates: confirm in the course site'
    : text;
}

export function containsWeakPlaceholder(value) {
  return /\b(?:tbd|to be determined|none|n\/a|not applicable)\b/i.test(cleanText(value));
}

export function hasMeaningfulAssessment(value) {
  const text = cleanText(value).toLowerCase();
  return Boolean(text) && !/^(?:none|n\/a|no assessment|not assessed|tbd|to be determined)$/i.test(text);
}
