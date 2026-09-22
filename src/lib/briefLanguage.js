// v0.20.08: the brief's own language decides the language of the course.
// A Chinese brief once came back as an all-English course (live test T2), so
// every model prompt that authors learner-facing text states it explicitly.

const CJK_RE = /[㐀-鿿豈-﫿]/gu;
const LATIN_WORD_RE = /[A-Za-z]{2,}/g;

/** 'zh' when Chinese characters dominate the brief, otherwise 'en'. */
export function detectBriefLanguage(text = '') {
  const source = String(text || '').replace(/^Course shape \(set in setup\):[^\n]*$/gim, '');
  const cjk = (source.match(CJK_RE) || []).length;
  if (cjk === 0) return 'en';
  const latinWords = (source.match(LATIN_WORD_RE) || []).length;
  // A Chinese character carries roughly one word of meaning.
  return cjk >= Math.max(8, latinWords * 1.5) ? 'zh' : 'en';
}

export function briefLanguageInstruction(text = '') {
  return detectBriefLanguage(text) === 'zh'
    ? 'Language: the instructor wrote in Chinese. Write every title, objective, activity, question, answer and explanation in Simplified Chinese (keep quoted source text, formulas and foreign-language examples exactly as given).'
    : '';
}
