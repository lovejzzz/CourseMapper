function clean(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

// This guard is deliberately narrower than a general topic classifier. It
// covers named, high-confidence language-teaching identities whose leakage is
// educationally destructive (for example, teaching Hangul inside Mandarin),
// while leaving citations such as "Mandarin tones for Korean speakers" alone.
const LANGUAGE_PROFILES = [
  {
    id: 'mandarin',
    label: 'Mandarin',
    identity:
      /\bmandarin\b|\bpinyin\b|\bhanzi\b|\b(?:elementary|beginning|intro(?:duction|ductory)? to) chinese\b|\bchinese (?:language|conversation|grammar)\b/i,
    teachingMarkers: [
      { label: 'pinyin', re: /\bpinyin\b/i },
      { label: 'hanzi', re: /\bhanzi\b/i },
      {
        label: 'Mandarin teaching claim',
        re: /\bmandarin (?:grammar|greetings?|numbers?|questions?|sentences?|tones?|uses?|commonly|typically|often)\b/i,
      },
    ],
  },
  {
    id: 'korean',
    label: 'Korean',
    identity:
      /\bkorean (?:language|conversation|grammar)\b|\b(?:elementary|beginning|intro(?:duction|ductory)? to) korean\b|\bhangul\b|\bhangeul\b/i,
    teachingMarkers: [
      { label: 'Hangul', re: /\b(?:hangul|hangeul)\b/i },
      { label: 'Sino-Korean', re: /\bsino[- ]korean\b/i },
      { label: 'native Korean system', re: /\bnative korean (?:number|numeral|counting|system)\w*\b/i },
      {
        label: 'Korean teaching claim',
        re: /\bkorean (?:grammar|greetings?|numbers?|numerals?|questions?|sentences?|particles?|counters?|age expressions?|writing system|uses?|commonly|typically|often)\b/i,
      },
    ],
  },
  {
    id: 'japanese',
    label: 'Japanese',
    identity:
      /\bjapanese (?:language|conversation|grammar)\b|\b(?:elementary|beginning|intro(?:duction|ductory)? to) japanese\b|\bhiragana\b|\bkatakana\b/i,
    teachingMarkers: [
      { label: 'hiragana', re: /\bhiragana\b/i },
      { label: 'katakana', re: /\bkatakana\b/i },
      {
        label: 'Japanese teaching claim',
        re: /\bjapanese (?:grammar|greetings?|numbers?|questions?|sentences?|particles?|counters?|writing system|uses?|commonly|typically|often)\b/i,
      },
    ],
  },
];

export function explicitCourseLanguageIds(courseIdentity) {
  const identity = clean(courseIdentity);
  return LANGUAGE_PROFILES.filter((profile) => profile.identity.test(identity)).map((profile) => profile.id);
}

/**
 * Return a high-confidence foreign language-teaching signal, or null.
 *
 * A course must first declare one of the supported language identities. A
 * foreign profile then needs one strong teaching marker; bare demonyms such
 * as "Korean speakers" do not match. Courses explicitly naming both
 * languages are treated as comparative and allow both.
 */
export function detectForeignLanguageTeachingContent({ courseIdentity, text } = {}) {
  const intendedLanguageIds = new Set(explicitCourseLanguageIds(courseIdentity));
  if (intendedLanguageIds.size === 0) return null;
  const content = clean(text);
  if (!content) return null;

  for (const profile of LANGUAGE_PROFILES) {
    if (intendedLanguageIds.has(profile.id)) continue;
    const markers = profile.teachingMarkers.filter((marker) => marker.re.test(content));
    if (markers.length === 0) continue;
    return {
      languageId: profile.id,
      languageLabel: profile.label,
      markerLabels: markers.map((marker) => marker.label),
      intendedLanguageIds: [...intendedLanguageIds],
      evidencePattern: markers[0].re,
    };
  }
  return null;
}

