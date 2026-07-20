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

const CJK_RE = /[一-鿿㐀-䶿]/g;
const CJK_PRESENT_RE = /[一-鿿㐀-䶿]/;
const TONE_MARKED_PINYIN_RE = /[a-zü]*[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/gi;
const TONE_MARKED_PINYIN_PRESENT_RE = /[a-zü]*[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i;
const VISIBLE_HANZI_PINYIN_PAIR_RE =
  /[一-鿿㐀-䶿]{1,16}[，。！？、；：,.!?]?\s*[（(][^（）()]{0,64}[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ][^（）()]{0,64}[）)]/i;
const PINYIN_ONLY_SCOPE_RE =
  /\b(?:pinyin|tone contours?|four (?:main )?tones?|tone marks?|pronunciation|romanization|initials? and finals?|syllable structure)\b/i;
const HANZI_SCOPE_RE =
  /\b(?:hanzi|chinese characters?|character recognition|character writing|read(?:ing)? characters?|writ(?:e|ing) characters?|alongside (?:tone-marked )?pinyin)\b/i;

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

/**
 * A single-language Mandarin kernel must teach at least one visible target-
 * language example and pair it with tone-marked pinyin. Comparative courses
 * are exempt because an individual lesson may intentionally focus on the
 * other declared language.
 */
export function mandarinTargetLanguageRequirements({ courseIdentity, sourceText } = {}) {
  const intendedLanguageIds = explicitCourseLanguageIds(courseIdentity);
  if (intendedLanguageIds.length !== 1 || intendedLanguageIds[0] !== 'mandarin') {
    return { required: false, languageId: null, elements: [], pinyinOnly: false };
  }

  const source = clean(sourceText);
  const sourceHasHanzi = CJK_PRESENT_RE.test(source) || HANZI_SCOPE_RE.test(source);
  // A narrow Pinyin/tones brief should not force the model to invent Hanzi
  // that the instructor never supplied. A broad Mandarin course keeps the
  // stronger Hanzi + tone-marked-Pinyin rule, as does any brief that names
  // characters or already contains them.
  const pinyinOnly = Boolean(source) && PINYIN_ONLY_SCOPE_RE.test(source) && !sourceHasHanzi;
  return {
    required: true,
    languageId: 'mandarin',
    elements: pinyinOnly ? ['tone-marked-pinyin'] : ['hanzi', 'tone-marked-pinyin'],
    pinyinOnly,
  };
}

/**
 * Check the target-language evidence required by the instructor's actual
 * scope. `complete` preserves the established Hanzi + tone-marked-Pinyin
 * presence boundary; `paired` reports whether those elements are co-located
 * for compiler projection diagnostics. An explicitly Pinyin/tones-only source
 * requires tone-marked Pinyin without manufacturing unsupported characters.
 */
export function assessTargetLanguagePresence({ courseIdentity, sourceText, text } = {}) {
  const requirement = mandarinTargetLanguageRequirements({ courseIdentity, sourceText });
  const content = clean(text);
  if (!requirement.required) {
    return { ...requirement, complete: true, cjkCount: 0, pinyinCount: 0, missing: [] };
  }
  const cjkCount = (content.match(CJK_RE) || []).length;
  const pinyinCount = (content.match(TONE_MARKED_PINYIN_RE) || []).length;
  let structuredPair = false;
  try {
    const visit = (value) => {
      if (structuredPair || value === null || value === undefined) return;
      if (Array.isArray(value)) return value.forEach(visit);
      if (typeof value !== 'object') return;
      const hanzi = clean(value.hanzi || value.scriptTerm || value.term || value.tr);
      const pinyin = clean(value.pinyin || value.romanization || value.rm);
      if (CJK_PRESENT_RE.test(hanzi) && TONE_MARKED_PINYIN_PRESENT_RE.test(pinyin)) structuredPair = true;
      if (!structuredPair) Object.values(value).forEach(visit);
    };
    visit(JSON.parse(content));
  } catch {
    /* ordinary prose is checked by the visible-pair expression below */
  }
  const paired = structuredPair || VISIBLE_HANZI_PINYIN_PAIR_RE.test(content);
  const missing = requirement.elements.filter((element) =>
    element === 'hanzi' ? cjkCount === 0 : element === 'tone-marked-pinyin' ? pinyinCount === 0 : true,
  );
  return {
    ...requirement,
    complete: missing.length === 0,
    cjkCount,
    pinyinCount,
    paired,
    missing,
  };
}
