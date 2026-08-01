function cleanMusicText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Keep this tiny check local to the lazy music-frame bank. Importing Scion's
// full answer-key alignment module here would make the frame bank a shared
// dependency of the landing route and download it before a course is opened.
function hasNearDuplicateMusicOptionPair(options = []) {
  const stopWords = new Set([
    'a',
    'an',
    'and',
    'are',
    'because',
    'by',
    'for',
    'from',
    'in',
    'is',
    'of',
    'on',
    'the',
    'to',
    'with',
  ]);
  const polarityGroups = [
    ['not', 'never', 'no'],
    ['major', 'minor'],
    ['increase', 'decrease'],
    ['before', 'after'],
    ['same', 'different'],
    ['true', 'false'],
    ['always', 'never'],
  ];
  const rows = (Array.isArray(options) ? options : []).map(
    (option) =>
      new Set(
        cleanMusicText(option)
          .replace(/^(?:(?:option|choice|answer)\s*)?(?:[a-d]|[1-4])\s*[).:\-]\s*/i, '')
          .normalize('NFKC')
          .toLowerCase()
          .replace(/[‘’']/g, '')
          .replace(/[^a-z0-9♭♯#]+/g, ' ')
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((token) => (token.length > 4 && token.endsWith('s') ? token.slice(0, -1) : token))
          .filter((token) => !stopWords.has(token)),
      ),
  );
  for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
      const left = rows[leftIndex];
      const right = rows[rightIndex];
      const smaller = Math.min(left.size, right.size);
      const criticalContrast =
        left.has('only') !== right.has('only') ||
        polarityGroups.some((group) => {
          const leftHits = group.filter((token) => left.has(token));
          const rightHits = group.filter((token) => right.has(token));
          return leftHits.length > 0 && rightHits.length > 0 && leftHits.some((token) => !rightHits.includes(token));
        });
      if (smaller < 6 || left.size === right.size || criticalContrast) continue;
      if ([...left].filter((token) => right.has(token)).length === smaller) return true;
    }
  }
  return false;
}

export function isMusicTheoryLens(lens = {}) {
  return /music theory|aural skills/i.test(cleanMusicText(lens.domain));
}

// Require the authored lesson identity to name interval study. Chord and
// harmony sources often mention an "interval of a seventh" without teaching
// interval classification, so kernel prose alone cannot activate this frame.
export function isMusicIntervalLesson(lesson = {}) {
  const authoredIdentityText = cleanMusicText(
    [
      lesson.title,
      ...(lesson.outcomes || []),
      ...(lesson.keyConcepts || []),
      lesson.activityPattern?.asynchronous,
      lesson.activityPattern?.synchronous,
    ]
      .filter(Boolean)
      .join(' '),
  ).toLowerCase();
  // A source, throughline packet, or course-wide lens can mention intervals
  // while the current lesson actually teaches chords, rhythm, or form. Require
  // the lesson's own authored identity to opt into the interval frame first.
  if (!/\bintervals?\b/.test(authoredIdentityText)) return false;
  const text = cleanMusicText(
    [
      authoredIdentityText,
      ...(lesson.readings || []),
      lesson.evidencePlan?.sourceCue,
      lesson.throughlineCase?.evidencePacket,
      // The domain cue can establish that an authored interval lesson is
      // musical rather than mathematical, but it cannot activate the frame by
      // itself.
      lesson.learnerContextCue,
      ...(lesson.enrichment?.kernel?.facts || []),
      ...(lesson.enrichment?.keyTerms || []).flatMap((term) => [term?.term, term?.definition, term?.example]),
    ]
      .filter(Boolean)
      .join(' '),
  ).toLowerCase();
  if (/\b(?:semitone|half step|pitch(?:es)?|staff|notation|notated|octave|aural|melodic|harmonic)\b/.test(text)) {
    return true;
  }
  return (
    /\b(?:simple|compound|invert|inversion|major|minor|perfect|augmented|diminished)\b/.test(text) &&
    /\b(?:audio|listening|music|musical|heard|hearing)\b/.test(text)
  );
}

export function isMusicIntervalInversionLesson(lesson = {}) {
  const identityText = cleanMusicText(
    [lesson.title, ...(lesson.outcomes || []), ...(lesson.keyConcepts || [])].filter(Boolean).join(' '),
  );
  return /\b(?:compound intervals?|invert|inversion|number pairs?|quality changes?)\b/i.test(identityText);
}

export function isMusicIntervalBlueprint(blueprint = {}) {
  const domain = cleanMusicText(blueprint.learnerContextProfile?.domain || blueprint.enrichment?.lens?.domain);
  if (!/music theory|aural skills/i.test(domain)) return false;
  if (/\bintervals?\b/i.test(cleanMusicText(blueprint.courseName))) return true;
  const lessonTitles = (blueprint.lessons || []).map((lesson) => cleanMusicText(lesson?.title)).filter(Boolean);
  const intervalTitleCount = lessonTitles.filter((title) => /\bintervals?\b/i.test(title)).length;
  return lessonTitles.length > 0 && intervalTitleCount >= Math.max(2, Math.ceil(lessonTitles.length * 0.6));
}

export const MUSIC_INTERVAL_READING_CUE_RE =
  /\b(?:music|musical|semitone|half step|pitch(?:es)?|staff|notation|notated|score|audio|aural|listening|harmony|harmonic|melodic|octave|ear training)\b/i;
// Some valid source rows name the disciplinary rule but omit an explicit
// "music" noun. Admit only narrow, verified interval-theory phrases; this
// preserves source traceability for an inversion lesson while still rejecting
// overloaded interval sources from medicine, statistics, and real analysis.
export const MUSIC_INTERVAL_VERIFIED_TOPIC_RE =
  /\b(?:generic interval number|inclusive letter[- ]name counting|simple (?:and|versus) compound intervals?|compound intervals?|interval inversion|inversion (?:number pairs?|quality changes?)|number pairs? (?:that )?sum to nine|semitone verification)\b/i;
export const MUSIC_INTERVAL_GENERIC_MATERIAL_RE =
  /\b(?:class notes|course notes|instructor(?:-provided)? (?:packet|materials?)|assigned source materials?)\b/i;
export const MUSIC_INTERVAL_GENERIC_ARTIFACT_RE =
  /\b(?:transfer task|lesson task|applied response|evidence check|practice checkpoint|review note|literature matrix|source synthesis|gap statement|annotated evidence table)\b|\bone example, one source detail, and one limitation\b/i;

export function disciplineSafeReadingsForLesson(lesson = {}, readings = []) {
  if (!isMusicIntervalLesson({ ...lesson, readings })) return readings;
  const safe = readings.filter((reading) => {
    const text = cleanMusicText(reading);
    return (
      MUSIC_INTERVAL_READING_CUE_RE.test(text) ||
      MUSIC_INTERVAL_VERIFIED_TOPIC_RE.test(text) ||
      MUSIC_INTERVAL_GENERIC_MATERIAL_RE.test(text)
    );
  });
  if (safe.length === 0) return ['Instructor notes and in-class materials'];
  return safe.length === readings.length ? readings : safe;
}

export function disciplineSafeCourseResources(resources = [], lessons = []) {
  if (!Array.isArray(resources) || resources.length === 0) return resources;
  if (!lessons.some((lesson) => isMusicIntervalLesson(lesson))) return resources;
  return resources.filter((resource) => {
    const text = cleanMusicText(
      [resource?.citation, resource?.title, resource?.attribution, resource?.kind].filter(Boolean).join(' '),
    );
    return (
      MUSIC_INTERVAL_READING_CUE_RE.test(text) ||
      MUSIC_INTERVAL_VERIFIED_TOPIC_RE.test(text) ||
      MUSIC_INTERVAL_GENERIC_MATERIAL_RE.test(text)
    );
  });
}

export function preferredMusicIntervalSource(readings = []) {
  const source = readings.find((reading) => {
    const text = cleanMusicText(reading);
    return MUSIC_INTERVAL_READING_CUE_RE.test(text) && text.length <= 90 && !/https?:\/\//i.test(text);
  });
  return cleanMusicText(source);
}

export function verifiedMusicIntervalArtifact(lesson = {}) {
  const text = cleanMusicText(
    [lesson.title, ...(lesson.outcomes || []), ...(lesson.keyConcepts || [])].filter(Boolean).join(' '),
  ).toLowerCase();
  const source = preferredMusicIntervalSource(lesson.readings || []);
  if (/\b(?:simple|compound|invert|inversion)\b/.test(text)) {
    return `${source ? `${source} ` : ''}Interval Classification and Inversion Analysis`;
  }
  return `${source ? `${source} ` : ''}Interval Classification and Semitone Verification`;
}

const MUSIC_INTERVAL_MATH_CONTAMINATION_RE =
  /\b(?:real number line|number line|continuous (?:segment|span)|unbroken set of endpoints?|mathematical (?:set|sets|interval)|single unit or a combination|multi[-\s]?part interval|structural composition|relationship between start and end points?|combination of two or more simple intervals?|start point of \d+[^.?!]{0,80}end point of \d+)\b/i;
const MUSIC_INTERVAL_COURSE_PROCESS_QUIZ_RE =
  /\b(?:professional decision|lesson artifact|evidence move|select a concrete example, connect it to the objective|quote .{0,80} at length without explaining what it changes)\b/i;

const PITCH_CLASS_BY_LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTER_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const INTERVAL_NUMBER = {
  unison: 1,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  octave: 8,
};

function parseMusicPitch(letter, accidental = '', octave = '') {
  const upper = String(letter || '').toUpperCase();
  if (!(upper in PITCH_CLASS_BY_LETTER)) return null;
  const accidentalOffset = /[#♯]/.test(accidental) ? 1 : /[b♭]/.test(accidental) ? -1 : 0;
  return {
    letter: upper,
    letterIndex: LETTER_INDEX[upper],
    pitchClass: (PITCH_CLASS_BY_LETTER[upper] + accidentalOffset + 12) % 12,
    octave: octave === '' ? null : Number(octave),
  };
}

function expectedIntervalLabel(lower, upper) {
  if (!lower || !upper) return null;
  const hasOctaves = Number.isInteger(lower.octave) && Number.isInteger(upper.octave);
  let diatonicSteps = hasOctaves
    ? (upper.octave - lower.octave) * 7 + upper.letterIndex - lower.letterIndex
    : (upper.letterIndex - lower.letterIndex + 7) % 7;
  let semitones = hasOctaves
    ? (upper.octave - lower.octave) * 12 + upper.pitchClass - lower.pitchClass
    : (upper.pitchClass - lower.pitchClass + 12) % 12;
  while (diatonicSteps < 0) diatonicSteps += 7;
  while (semitones < 0) semitones += 12;
  const number = diatonicSteps + 1;
  const simpleNumber = ((number - 1) % 7) + 1;
  const octaves = Math.floor((number - 1) / 7);
  const baseSimple = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 }[simpleNumber];
  const delta = semitones - (baseSimple + octaves * 12);
  const perfectFamily = [1, 4, 5].includes(simpleNumber);
  const quality = perfectFamily
    ? ({ '-1': 'diminished', 0: 'perfect', 1: 'augmented' }[delta] ?? null)
    : ({ '-2': 'diminished', '-1': 'minor', 0: 'major', 1: 'augmented' }[delta] ?? null);
  return quality ? { number, quality } : null;
}

/**
 * Validate explicit pitch-pair labels in model prose. This deliberately
 * covers only claims the compiler can calculate exactly; ambiguous prose is
 * left alone, while contradictions such as "F♯–A is a major sixth" are
 * rejected before they reach slides or an answer key.
 */
export function hasMusicIntervalSemanticContradiction(value) {
  const text = cleanMusicText(typeof value === 'string' ? value : JSON.stringify(value || ''));
  const pairThenLabel =
    /\b([A-G])([#♯b♭]?)(\d?)\s*(?:[-–—]|\b(?:and|to)\b)\s*([A-G])([#♯b♭]?)(\d?)[^.!?]{0,72}?\b(major|minor|perfect|augmented|diminished)\s+(unison|first|second|third|fourth|fifth|sixth|seventh|octave)\b/gi;
  for (const match of text.matchAll(pairThenLabel)) {
    const expected = expectedIntervalLabel(
      parseMusicPitch(match[1], match[2], match[3]),
      parseMusicPitch(match[4], match[5], match[6]),
    );
    const claimedNumber = INTERVAL_NUMBER[match[8].toLowerCase()];
    const claimedQuality = match[7].toLowerCase();
    if (expected && (expected.number !== claimedNumber || expected.quality !== claimedQuality)) return true;
  }
  return false;
}

export function hasMusicIntervalMathContamination(value) {
  return MUSIC_INTERVAL_MATH_CONTAMINATION_RE.test(typeof value === 'string' ? value : JSON.stringify(value || ''));
}

const INTERVAL_WORD_BY_NUMBER = {
  1: 'unison',
  2: 'second',
  3: 'third',
  4: 'fourth',
  5: 'fifth',
  6: 'sixth',
  7: 'seventh',
  8: 'octave',
};

function hasCompilerVerifiableMusicIntervalKey(item = {}) {
  const question = cleanMusicText(item?.question || item?.q);
  const options = item?.options || item?.op || [];
  const answerIndex = Number(item?.answerIndex ?? item?.ai);
  const declaredAnswer = Number.isInteger(answerIndex) ? cleanMusicText(options[answerIndex]) : '';
  const explanation = cleanMusicText(item?.explanation || item?.ex);
  if (!question || !declaredAnswer) return false;
  const keyedText = `${declaredAnswer} ${explanation}`.toLowerCase();

  // Concrete pitch pairs are exactly calculable from spelling and octave.
  const pair = question.match(/\b([A-G])([#♯b♭]?)(\d?)\s*(?:[-–—]|\b(?:and|to)\b)\s*([A-G])([#♯b♭]?)(\d?)\b/i);
  if (pair) {
    const expected = expectedIntervalLabel(
      parseMusicPitch(pair[1], pair[2], pair[3]),
      parseMusicPitch(pair[4], pair[5], pair[6]),
    );
    const numberWord = expected ? INTERVAL_WORD_BY_NUMBER[expected.number] : '';
    return Boolean(expected && numberWord && keyedText.includes(expected.quality) && keyedText.includes(numberWord));
  }

  // Admit only canonical claims the compiler can verify locally. Ambiguous
  // comparison/opinion stems fall through and are replaced by the verified
  // bank instead of receiving a guessed key from the browser model.
  if (/presented harmonically|harmonic interval/i.test(question)) {
    return /together|same time|simultaneous/.test(keyedText);
  }
  if (/presented melodically|melodic interval/i.test(question)) {
    return /sequence|successive|one after another/.test(keyedText);
  }
  if (/major third.{0,60}invert|invert.{0,60}major third/i.test(question)) {
    return /minor sixth/.test(keyedText);
  }
  if (/compound tenth|tenth.{0,50}simple equivalent/i.test(question)) {
    return /(?:major )?third/.test(keyedText);
  }
  if (/sum(?:s)? to nine|sum-to-nine/i.test(question)) {
    return /(?:unison.{0,20}octave|second.{0,20}seventh|third.{0,20}sixth|fourth.{0,20}fifth|[1-4]\s*\+\s*[5-8]\s*=\s*9)/.test(
      keyedText,
    );
  }
  return false;
}

export function isAdmissibleMusicIntervalQuizItem(item = {}) {
  const text = JSON.stringify(item || '');
  const options = item?.options || item?.op || [];
  const answerIndex = Number(item?.answerIndex ?? item?.ai);
  const declaredAnswer = Number.isInteger(answerIndex) ? options[answerIndex] : '';
  const answerClaim = `${item?.question || item?.q || ''} ${declaredAnswer || ''} ${item?.explanation || item?.ex || ''}`;
  return (
    !hasMusicIntervalMathContamination(text) &&
    !MUSIC_INTERVAL_COURSE_PROCESS_QUIZ_RE.test(text) &&
    !hasNearDuplicateMusicOptionPair(options) &&
    !hasMusicIntervalSemanticContradiction(answerClaim) &&
    hasCompilerVerifiableMusicIntervalKey(item)
  );
}

export function sanitizeMusicIntervalLessonMetadata(
  value,
  { removedReadings = [], originalArtifact = '', artifact = '' } = {},
) {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeMusicIntervalLessonMetadata(item, { removedReadings, originalArtifact, artifact }))
      .filter((item) => item !== '' && item != null);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sanitizeMusicIntervalLessonMetadata(item, { removedReadings, originalArtifact, artifact }),
      ]),
    );
  }
  if (typeof value !== 'string') return value;

  const escapeRegexLiteral = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let text = value;
  for (const reading of removedReadings) {
    const exact = cleanMusicText(reading);
    if (!exact) continue;
    text = text.replace(new RegExp(escapeRegexLiteral(exact), 'gi'), '');
  }
  if (MUSIC_INTERVAL_GENERIC_ARTIFACT_RE.test(originalArtifact)) {
    text = text.replace(new RegExp(escapeRegexLiteral(cleanMusicText(originalArtifact)), 'gi'), artifact);
  }
  return text
    .replace(/\s*:\s*explain one example, one source detail, and one limitation\.?/gi, '')
    .replace(
      /\b(?:literature matrix,?\s*)?source synthesis,?\s*gap statement,?\s*or annotated evidence table\b/gi,
      artifact,
    )
    .replace(/;\s*;/g, '; ')
    .replace(/:\s*;/g, ': ')
    .replace(/\s{2,}/g, ' ')
    .replace(/;\s*$/g, '')
    .trim();
}

export function musicTheoryTermGuidesForLesson(lesson = {}) {
  const facts = Array.isArray(lesson?.enrichment?.kernel?.facts) ? lesson.enrichment.kernel.facts : [];
  const lessonText = cleanMusicText([lesson.title, ...(lesson.outcomes || []), ...facts].filter(Boolean).join(' '))
    .slice(0, 2400)
    .toLowerCase();
  const guides = [
    {
      pattern: /generic interval|generic number|staff position/,
      term: 'Generic interval number',
      definition:
        'The inclusive count of letter names or staff positions from the lower note to the upper note, independent of accidentals.',
      example: 'C–E counts C, D, and E, so its generic interval number is a third.',
      misconception: 'Count only the spaces between the two notes.',
      correction: 'Count both endpoint letter names or staff positions; the first and last notes are included.',
    },
    {
      pattern: /interval quality|major.?minor|perfect quality|augmented|diminished|semitone verification/,
      term: 'Interval quality',
      definition:
        'The label perfect, major, minor, augmented, or diminished that specifies an interval’s chromatic size within its generic number.',
      example: 'C–E is a major third at four semitones; C–E♭ is a minor third at three semitones.',
      misconception: 'The same number of staff positions always produces the same interval quality.',
      correction: 'Generic number comes from letter names; accidentals and semitone distance determine the quality.',
    },
    {
      pattern: /semitone|half step|chromatic size/,
      term: 'Semitone',
      definition:
        'The smallest pitch step in twelve-tone equal temperament and the unit used to verify an interval’s chromatic size.',
      example: 'Moving from E to F on a piano spans one semitone even though neither note has an accidental.',
      misconception: 'Every adjacent letter name is separated by two semitones.',
      correction: 'E–F and B–C are one semitone; most other adjacent natural-note pairs are two.',
    },
    {
      pattern: /simple.?versus.?compound|simple and compound|simple intervals?\s+(?:and|versus|vs\.?)\s+compound/,
      term: 'Simple interval',
      definition: 'An interval whose span is an octave or smaller, named from unison through octave.',
      example: 'C4–A4 is a simple sixth because both pitches fit within one octave.',
      misconception: 'A simple interval must be easy to hear or perform.',
      correction: 'Simple describes octave span, not perceptual or performance difficulty.',
    },
    {
      pattern: /compound interval|simple.?versus.?compound|ninth|tenth|eleventh|twelfth|thirteenth/,
      term: 'Compound interval',
      definition:
        'An interval larger than an octave; subtracting seven from its number gives the corresponding simple interval.',
      example: 'A tenth reduces to a third because 10 − 7 = 3.',
      misconception: 'A compound interval is always two unrelated simple intervals added together.',
      correction: 'It is one interval spanning more than an octave and has a single simple equivalent.',
    },
    {
      pattern: /interval inversion|invert|inversion number|inversion pair/,
      term: 'Interval inversion',
      definition:
        'The result of moving the lower pitch up an octave or the upper pitch down an octave so the pitch-class order reverses.',
      example: 'Inverting C–E produces E–C, changing a third into a sixth.',
      misconception: 'Inversion changes both notes to entirely new pitch classes.',
      correction: 'The same pitch classes remain; one note changes octave and their vertical order reverses.',
    },
    {
      pattern: /number pair|numbers sum|inversion number|invert/,
      term: 'Inversion number pair',
      definition:
        'A pair of simple interval numbers that sums to nine: unison–octave, second–seventh, third–sixth, or fourth–fifth.',
      example: 'A third inverts to a sixth because 3 + 6 = 9.',
      misconception: 'An interval keeps the same number after inversion.',
      correction: 'The original and inverted simple interval numbers add to nine.',
    },
    {
      pattern: /inversion quality|quality change|inverted.*quality|quality.*inversion/,
      term: 'Inversion quality change',
      definition:
        'Under inversion, perfect remains perfect, major and minor exchange, and augmented and diminished exchange.',
      example: 'A major third inverts to a minor sixth, while a perfect fourth inverts to a perfect fifth.',
      misconception: 'Every interval quality remains unchanged after inversion.',
      correction: 'Only perfect quality stays the same; the other quality pairs exchange.',
    },
  ];
  // This is a verified compiler frame, not a retrieval guess. A music-
  // interval lesson should therefore receive the complete concept set even
  // when a terse Course Map outcome omits words such as “generic,” “quality
  // exchange,” or “staff position.” Pattern-only selection produced one
  // real term plus five blank UI rows after the generic thin-guide repair.
  if (isMusicIntervalLesson(lesson)) {
    const requiredTerms = isMusicIntervalInversionLesson(lesson)
      ? [
          'Simple interval',
          'Compound interval',
          'Interval inversion',
          'Inversion number pair',
          'Inversion quality change',
        ]
      : ['Generic interval number', 'Interval quality', 'Semitone'];
    return requiredTerms.map((term) => {
      const { pattern: _pattern, ...publicGuide } = guides.find((guide) => guide.term === term);
      return { ...publicGuide, enrichmentSource: 'compiler-domain-fallback' };
    });
  }
  const selected = [];
  for (const guide of guides) {
    if (!guide.pattern.test(lessonText)) continue;
    const { pattern: _pattern, ...publicGuide } = guide;
    selected.push({ ...publicGuide, enrichmentSource: 'compiler-domain-fallback' });
  }
  // In an inversion lesson, the specific quality-change rule is the teaching
  // target; the broad "interval quality" entry would otherwise consume the
  // five-term cap before that rule appears.
  const prioritized = /\binversion\b/.test(lessonText)
    ? selected.filter((guide) => guide.term !== 'Interval quality')
    : selected;
  return prioritized.slice(0, 5);
}

export function musicTheoryStudySummary(guides = []) {
  return guides
    .slice(0, 3)
    .map((guide) => cleanMusicText(guide.definition))
    .filter(Boolean)
    .map((definition) => (/[.!?]$/.test(definition) ? definition : `${definition}.`))
    .join(' ');
}

function uniqueMusicValues(values, limit = Infinity) {
  const seen = new Set();
  return values.filter((value) => {
    const key = cleanMusicText(value).toLowerCase();
    if (!key || seen.has(key) || seen.size >= limit) return false;
    seen.add(key);
    return true;
  });
}

function verifiedMusicIntervalSlideContent(lesson = {}) {
  if (isMusicIntervalInversionLesson(lesson)) {
    return [
      {
        title: 'Reduce, invert, then exchange quality',
        bullets: [
          'Reduce a compound interval by subtracting seven from its number until a simple interval remains.',
          'Find the inverted number with a pair that sums to nine.',
          'Keep perfect quality; exchange major with minor and augmented with diminished.',
        ],
      },
      {
        title: 'Worked inversion: major tenth to minor sixth',
        bullets: [
          'A major tenth reduces to a major third because 10 − 7 = 3.',
          'A third inverts to a sixth because 3 + 6 = 9.',
          'Major exchanges with minor, so the inverted simple interval is a minor sixth.',
        ],
      },
      {
        title: 'Four number pairs, three quality exchanges',
        bullets: [
          'Unison–octave, second–seventh, third–sixth, and fourth–fifth are the simple inversion pairs.',
          'Perfect intervals remain perfect under inversion.',
          'Major/minor and augmented/diminished exchange under inversion.',
        ],
      },
    ];
  }
  return [
    {
      title: 'Name the generic number before the quality',
      bullets: [
        'Count both endpoint letter names inclusively to establish the generic interval number.',
        'Use the semitone span to verify perfect, major, minor, augmented, or diminished quality.',
        'Let pitch spelling determine the number; equal semitone spans can have different interval names.',
      ],
    },
    {
      title: 'Worked classification: C4–E♭4',
      bullets: [
        'C–D–E is an inclusive count of three letter names, so the generic number is a third.',
        'C4 to E♭4 spans three semitones.',
        'Three semitones within a third produces a minor third, not an augmented second.',
      ],
    },
    {
      title: 'Use one verification chain for notation and listening',
      bullets: [
        'For notation, record the written endpoints before counting letter names and semitones.',
        'For listening, identify or test the pitch endpoints before assigning an interval label.',
        'Report endpoints, generic number, semitone span, and quality so another musician can check the answer.',
      ],
    },
  ];
}

function verifiedMusicIntervalWorkedExample(lesson = {}) {
  return isMusicIntervalInversionLesson(lesson)
    ? {
        problem: 'Reduce a major tenth, then name the inversion of its simple equivalent.',
        steps: [
          'Subtract seven: 10 − 7 = 3, so the major tenth reduces to a major third.',
          'Use the number pair: 3 + 6 = 9, so a third inverts to a sixth.',
          'Exchange quality: major becomes minor under inversion.',
        ],
        result: 'The simple equivalent is a major third, and its inversion is a minor sixth.',
      }
    : {
        problem: 'Classify the written interval C4–E♭4.',
        steps: [
          'Count letter names inclusively: C–D–E makes a third.',
          'Count the chromatic distance: C4–E♭4 spans three semitones.',
          'Within a generic third, three semitones indicates minor quality.',
        ],
        result: 'C4–E♭4 is a minor third.',
      };
}

export function enforceMusicIntervalEnrichment(lesson = {}, enrichment = null) {
  if (!enrichment || !isMusicIntervalLesson({ ...lesson, enrichment })) return enrichment;

  // Re-derive the frame on every compiler admission. A payload can pass
  // through normalization more than once (or survive a browser hot reload),
  // and the admission marker is metadata rather than proof that its current
  // atoms still match this verified frame. Trusting the marker allowed stale
  // model-written "integer set" definitions to re-enter a music deck.
  const verifiedGuides = musicTheoryTermGuidesForLesson({
    ...lesson,
    enrichment: {
      ...enrichment,
      kernel: { ...(enrichment.kernel || {}), facts: [] },
    },
  });
  if (verifiedGuides.length === 0) return enrichment;

  const verifiedFacts = uniqueMusicValues(verifiedGuides.map((guide) => guide.definition).filter(Boolean), 10);
  const removedContaminatedAtoms = [
    ...(enrichment.keyTerms || []),
    ...(enrichment.quizItems || []),
    ...(enrichment.kernel?.facts || []),
    ...(enrichment.slideContent || []),
  ].filter((item) => hasMusicIntervalMathContamination(item)).length;
  const removedUnverifiedAtoms = [
    ...(enrichment.kernel?.facts || []),
    ...(enrichment.slideContent || []),
    enrichment.kernel?.scenario,
    enrichment.workedExample,
    enrichment.studyGuide,
    enrichment.assignmentCore,
    enrichment.discussionPrompt,
  ].filter(Boolean).length;

  return {
    ...enrichment,
    keyTerms: verifiedGuides,
    quizItems: (enrichment.quizItems || []).filter(isAdmissibleMusicIntervalQuizItem),
    kernel: {
      ...(enrichment.kernel || {}),
      facts: verifiedFacts,
      scenario: undefined,
    },
    slideContent: verifiedMusicIntervalSlideContent(lesson),
    workedExample: verifiedMusicIntervalWorkedExample(lesson),
    studyGuide: undefined,
    assignmentCore: undefined,
    discussionPrompt: undefined,
    compilerDomainAdmission: {
      status: removedContaminatedAtoms > 0 || removedUnverifiedAtoms > 0 ? 'repaired' : 'verified-frame',
      domain: 'music-theory-intervals',
      removedContaminatedAtoms,
      removedUnverifiedAtoms,
      source: 'deterministic-compiler-domain-guard',
    },
  };
}

export function buildMusicIntervalLessonPhrase({ inversionLesson }) {
  return inversionLesson
    ? {
        context: 'simple and compound intervals, inversion number pairs, and inversion quality changes',
        evidenceMove:
          'reduce or invert a notated or heard interval using the sum-to-nine rule and the correct quality exchange',
        decisionMove: 'justify the inverted interval name with its number pair and quality change',
      }
    : {
        context: 'inclusive letter-name counting, interval quality, and semitone verification',
        evidenceMove:
          'classify a notated or heard interval using pitch spelling, inclusive counting, and semitone evidence',
        decisionMove: 'justify the interval name with its generic number and quality evidence',
      };
}

export function buildMusicIntervalAssignmentOverview({ artifact, weight, source, inversionTask }) {
  return inversionTask
    ? `${artifact} is worth ${weight}. Classify the assigned examples from ${source}, reduce each compound interval to its simple equivalent, and show the inversion number pair and quality exchange. For every answer, record the pitch spelling or heard endpoints and the rule that verifies the final label.`
    : `${artifact} is worth ${weight}. Classify the assigned examples from ${source} by counting endpoint letter names inclusively, naming the generic number, and verifying quality from semitone distance. For every answer, record enough pitch evidence for another musician to reproduce or correct the label.`;
}

export function buildMusicIntervalFaqCore({ facts, sourceCue, inversionLesson }) {
  const factText = facts.map((fact) => `${cleanMusicText(fact).replace(/[.!?]+$/, '')}.`).join(' ');
  return inversionLesson
    ? `${factText} Test the rules on a compound or inverted example from ${sourceCue}: preserve the pitch spelling, show the simple reduction, pair the inversion numbers to nine, and name the quality exchange.`
    : `${factText} Apply the definitions to a written or heard example from ${sourceCue}: name the endpoints, count their letter names inclusively, measure the semitone span, and verify the number and quality.`;
}

export function buildMusicIntervalFaqAssignment({ artifact, source, inversionLesson }) {
  return inversionLesson
    ? `In ${artifact}, classify examples from ${source}, reduce compound intervals, and show how each inversion number pair and quality exchange produces the final label. The work is ready when every answer includes enough pitch and rule evidence for another musician to verify it.`
    : `In ${artifact}, classify examples from ${source} by counting letter names inclusively and verifying quality from semitone distance. The work is ready when every interval label includes the pitch spelling or heard endpoints and a reproducible number-and-quality check.`;
}

export function buildMusicIntervalDiscussionArtifactSet({ lessonTitle, sourceCue, artifact, inversionLesson }) {
  return [
    inversionLesson
      ? {
          title: `${sourceCue} Compound-Interval Evidence`,
          locator: sourceCue,
          use: 'Choose one compound interval and preserve its pitch spelling while you record the simple equivalent, sum-to-nine number partner, quality exchange, and final inverted label.',
        }
      : {
          title: `${sourceCue} Pitch-Spelling Evidence`,
          locator: sourceCue,
          use: 'Choose one notated or heard interval and record its two pitch endpoints, inclusive letter-name count, semitone span, generic number, and quality.',
        },
    {
      title: `${lessonTitle} ${inversionLesson ? 'Inversion Analysis Brief' : 'Classification Brief'}`,
      locator: artifact,
      use: inversionLesson
        ? `Audit ${artifact} against the scoring criteria: each answer must preserve the original spelling, reduce the compound number correctly, pair inversion numbers to nine, and exchange quality accurately.`
        : `Audit ${artifact} against the scoring criteria: each label must agree with the endpoint letters, inclusive count, and semitone evidence.`,
    },
  ];
}

export function buildMusicIntervalDiscussionPrompt({ source, inversionLesson }) {
  return inversionLesson
    ? `A student reduces a compound tenth to a third, then claims that a major third inverts to a major sixth. Which step is correct, which is not, and how do the sum-to-nine and quality-exchange rules resolve the error? Use a notated or heard example from ${source}.`
    : `A student labels C4–E♭4 an augmented second because it spans three semitones. Is that label defensible? Use inclusive letter-name counting and semitone evidence to correct or defend it, then explain how you would verify a heard example from ${source}.`;
}

export function buildMusicIntervalDiscussionFollowUps({ source, artifact, inversionLesson }) {
  return inversionLesson
    ? [
        `Which pitch spelling in ${source} proves the simple equivalent before inversion begins?`,
        'How do you know the original and inverted interval numbers form the correct sum-to-nine pair?',
        'Which quality exchange applies—major/minor, augmented/diminished, or perfect/perfect—and what common wrong answer does it rule out?',
        `If a classmate gets the right interval number but the wrong quality, what evidence should they revise first in ${artifact}?`,
        'How would your reasoning change if the same pitch classes were respelled with different letter names?',
      ]
    : [
        `Which endpoint letter names in ${source} establish the generic number before semitones are counted?`,
        'Why can the same semitone distance receive different interval names when the pitches are spelled differently?',
        'Which natural-note half-step or accidental is easiest to overlook in this example?',
        `If a classmate used semitone count alone, what line of ${artifact} should they revise first?`,
        'How would you verify the same classification when the pitches are heard successively instead of shown in notation?',
      ];
}

export function buildMusicIntervalDiscussionFacilitationTips({ source, artifact, inversionLesson }) {
  if (inversionLesson) {
    return {
      opening: `Allow two silent minutes for students to reduce one compound interval from ${source} and write its inversion. They must show the simple equivalent, sum-to-nine number pair, and quality exchange before comparing answers.`,
      ifStalls:
        'Post the chain “major tenth → major third → ___ sixth.” Have pairs audit the compound reduction, number pair, and quality exchange separately, then identify the first unsupported step.',
      ifDominates:
        'Hand the next three moves to new voices: one student reduces the compound number, another checks that the inversion numbers total nine, and a third names the quality exchange.',
      closure: `Close with one corrected inversion claim from ${source}. Students record the original interval, its sum-to-nine partner, the quality exchange, and the verified label in ${artifact}.`,
      revisionCapture:
        'Each student annotates one changed inversion answer with the exact reduction, number-pair, or quality rule that forced the revision.',
    };
  }
  return {
    opening: `Give students two quiet minutes to classify one example from ${source}. Require the pitch endpoints, inclusive count, semitone span, number, and quality before anyone shares a label.`,
    ifStalls:
      'Write C4–E♭4 beside “minor third” and “augmented second.” Ask pairs to circle the endpoint letters first, then mark which label survives the three-semitone check.',
    ifDominates:
      'Distribute the evidence chain across new voices: one student names the endpoints, another counts the letter names inclusively, and a third verifies the quality by semitones.',
    closure: `Close with one corrected classification from ${source}. Students transfer the pitch endpoints, inclusive count, semitone check, generic number, and verified quality into ${artifact}.`,
    revisionCapture:
      'Each student records one interval label they changed and the specific pitch or semitone evidence that changed it.',
  };
}

export function buildMusicIntervalDiscussionResponseStems({ artifact, inversionLesson }) {
  return inversionLesson
    ? [
        'I reduce the compound ___ to a simple ___ because I subtract seven from the interval number.',
        'The original number ___ and inverted number ___ form a valid pair because they sum to nine.',
        'The quality changes from ___ to ___ under the major/minor, augmented/diminished, or perfect/perfect exchange rule.',
        `The inversion proof I would add to ${artifact} is ___ because it exposes every step another musician needs to audit.`,
      ]
    : [
        'The pitch spelling establishes a generic ___ because I count ___ letter names inclusively.',
        'The semitone distance verifies ___ quality because ___.',
        'I would revise that label from ___ to ___ because its endpoint letters establish ___ before semitones verify the quality.',
        `The classification evidence I would add to ${artifact} is ___ because another musician can reproduce the count.`,
      ];
}

export function buildMusicIntervalDiscussionCriteriaSet({ artifact, inversionLesson }) {
  return inversionLesson
    ? [
        'Preserves the original pitch spelling while reducing each compound interval to its simple equivalent.',
        'Pairs original and inverted interval numbers accurately with the sum-to-nine rule.',
        'Exchanges major/minor, augmented/diminished, and perfect/perfect qualities without changing the rule mid-solution.',
        `Audits a peer's reduction or inversion chain, identifies its first unsupported step, and records the corrected chain in ${artifact}.`,
      ]
    : [
        'Names the written or heard pitch endpoints and counts the generic interval number inclusively.',
        'Uses semitone distance to verify quality without allowing semitone count to override pitch spelling.',
        'Explains why enharmonic spans can have different interval names when their endpoint letters differ.',
        `Locates a specific spelling, inclusive-count, or semitone error in a peer's reasoning and records the corrected label in ${artifact}.`,
      ];
}

export function buildMusicIntervalDiscussionGuidelines({ source, format, inversionLesson }) {
  return inversionLesson
    ? `Prepare for the ${format} by selecting one compound or inverted interval from ${source}. Bring its original pitch spelling, simple reduction, sum-to-nine number pair, quality exchange, and final label. During the exchange, present that reasoning chain and audit one peer's chain by naming the first step that holds or fails. You may contribute in writing, notation, chat, speech, or another instructor-approved accessible mode; every mode must expose the same inversion evidence. Credit reflects accurate rule use, a traceable solution, and a correction that helps a peer revise.`
    : `Before the ${format}, classify one example from ${source} and bring the pitch endpoints, inclusive letter-name count, semitone span, interval number, and quality. Make two evidence-based contributions: present one complete classification and respond to a peer by checking one specific spelling, counting, or semitone claim. Written, chat, spoken, notated, and instructor-approved accessible response modes carry the same evidence requirements. Credit depends on accurate classification, an inspectable reasoning trace, and a useful correction or extension of a peer's analysis.`;
}

/**
 * Conservative, source-free interval assessment frames used when the local
 * browser model cannot supply enough admissible lesson knowledge. Every key
 * is a stable music-theory relation that can be checked from pitch spelling
 * and semitone count; named course sources remain available in the compiler's
 * source-bound constructed-response items, but are never fabricated here.
 */
const BASIC_INTERVAL_FRAMES = [
  {
    bloom: 'Apply',
    prompt: 'Apply inclusive letter-name counting to C4–E♭4. What are its generic number and interval quality?',
    correct: 'A minor third: C–D–E gives a third, and the span is three semitones.',
    distractors: [
      'A major third: C–D–E gives a third, regardless of the accidental.',
      'An augmented second: the three semitones determine the generic number.',
      'A perfect third: all intervals spanning three letter names are perfect.',
    ],
    distractorRationale:
      'The major-third option ignores E-flat; the augmented-second option lets semitone count override letter spelling; the perfect-third option invents a quality that thirds do not use.',
    explanation:
      'Generic number comes from the inclusive letter-name count C–D–E; three semitones make that third minor.',
  },
  {
    bloom: 'Apply',
    prompt: 'Verify D4–F♯4 by semitone count. Which interval label is correct?',
    correct: 'Major third, because D–E–F is a third and D to F♯ spans four semitones.',
    distractors: [
      'Minor third, because every interval from D to F has minor quality.',
      'Augmented second, because four semitones always form an augmented second.',
      'Perfect fourth, because D and F♯ occupy four staff positions.',
    ],
    distractorRationale:
      'The minor-third option ignores F-sharp; the augmented-second option replaces diatonic spelling with semitone count; the perfect-fourth option miscounts the staff positions.',
    explanation: 'D–E–F is an inclusive count of three letter names, and four semitones specify a major third.',
  },
  {
    bloom: 'Understand',
    prompt: 'Explain which information determines an interval’s generic number before its quality is identified.',
    correct: 'Count both endpoint letter names or staff positions, independent of accidentals.',
    distractors: [
      'Count only the piano keys strictly between the two pitches.',
      'Count semitones first and use that total as the generic number.',
      'Use the accidental on the upper note as the generic number.',
    ],
    distractorRationale:
      'The alternatives respectively count interior keys, substitute semitone distance for generic number, or treat an accidental as a number—none uses inclusive letter names.',
    explanation:
      'The generic number is diatonic and inclusive; accidentals affect chromatic size and quality, not the letter-name count.',
  },
  {
    bloom: 'Analyze',
    prompt: 'Analyze E4–F4. Why is this pair one semitone apart even though neither note has an accidental?',
    correct: 'E and F are adjacent natural notes with no black-key pitch between them.',
    distractors: [
      'Every pair of adjacent letter names is exactly one semitone apart.',
      'Natural notes are always one semitone apart when written on the staff.',
      'The absence of accidentals makes every interval a whole step.',
    ],
    distractorRationale:
      'The first two options overgeneralize the E–F exception to all natural-note neighbors; the whole-step option reverses the effect of having no accidental.',
    explanation:
      'E–F and B–C are the natural-note half steps; most other adjacent natural-note pairs span two semitones.',
  },
  {
    bloom: 'Analyze',
    prompt: 'Analyze C4–F♯4 using spelling and semitone distance. Which label is correct?',
    correct: 'Augmented fourth, because C–D–E–F is a fourth and the span is six semitones.',
    distractors: [
      'Diminished fifth, because every six-semitone span has the same spelling.',
      'Perfect fourth, because the four letter names determine both number and quality.',
      'Major sixth, because six semitones always produce a sixth.',
    ],
    distractorRationale:
      'The diminished-fifth option ignores the C–F spelling; the perfect-fourth option ignores F-sharp; the major-sixth option mistakes semitone count for interval number.',
    explanation:
      'C through F is a generic fourth; raising F expands the perfect fourth by one semitone, producing an augmented fourth.',
  },
  {
    bloom: 'Understand',
    prompt: 'Distinguish melodic from harmonic presentation when the same two pitches form an interval.',
    correct: 'A melodic interval sounds the pitches successively; a harmonic interval sounds them simultaneously.',
    distractors: [
      'A melodic interval is always major; a harmonic interval is always minor.',
      'A melodic interval uses notation; a harmonic interval can only be heard.',
      'A melodic interval is simple; a harmonic interval is always compound.',
    ],
    distractorRationale:
      'Each alternative confuses presentation order with quality, notation medium, or octave span; melodic versus harmonic describes whether the pitches sound successively or together.',
    explanation: 'Presentation describes when the pitches sound, not their number, quality, notation, or octave span.',
  },
  {
    bloom: 'Evaluate',
    prompt:
      'A student labels B3–F4 a perfect fifth because the endpoints are five letter names apart. Which correction is best?',
    correct: 'Keep the generic fifth, but count six semitones and relabel it a diminished fifth.',
    distractors: [
      'Relabel it an augmented fourth because every six-semitone span uses that spelling.',
      'Keep perfect fifth because letter-name count determines both number and quality.',
      'Relabel it a minor fifth because six semitones is one below a perfect fifth.',
    ],
    distractorRationale:
      'The augmented-fourth option ignores B–F spelling, the perfect-fifth option ignores chromatic size, and “minor fifth” is not a standard interval quality.',
    explanation:
      'B–C–D–E–F is a generic fifth, but its six-semitone span is one smaller than a perfect fifth, so it is diminished.',
  },
  {
    bloom: 'Create',
    prompt: 'Which pitch above C4 creates a minor sixth while preserving the required generic spelling?',
    correct: 'A♭4, because C–D–E–F–G–A is a sixth and C4 to A♭4 spans eight semitones.',
    distractors: [
      'G♯4, because eight semitones alone determine a minor sixth.',
      'A4, because every C-to-A spelling is minor.',
      'B♭♭4, because lowering the upper note always preserves the interval number.',
    ],
    distractorRationale:
      'G-sharp spells an augmented fifth, A-natural is a major sixth, and B-double-flat uses a generic seventh despite sounding like A-flat.',
    explanation:
      'The letter spelling C through A establishes a sixth; lowering A to A-flat makes its chromatic size eight semitones, a minor sixth.',
  },
];

const INVERSION_FRAMES = [
  {
    bloom: 'Apply',
    prompt: 'Reduce a compound tenth to its simple equivalent. Which interval number results?',
    correct: 'A third, because subtracting seven from 10 gives 3.',
    distractors: [
      'A second, because subtracting one octave means subtracting eight.',
      'A fifth, because a tenth contains two groups of five scale degrees.',
      'An octave, because every compound interval reduces to an octave.',
    ],
    distractorRationale:
      'The second option subtracts eight instead of seven from a compound number; the fifth and octave options use invented reduction rules rather than octave equivalence.',
    explanation: 'Compound interval numbers reduce to their simple equivalents by subtracting seven, so 10 − 7 = 3.',
  },
  {
    bloom: 'Apply',
    prompt: 'Invert a major third by moving its lower pitch up an octave. Which interval results?',
    correct: 'A minor sixth.',
    distractors: ['A major sixth.', 'A minor third.', 'A perfect fifth.'],
    distractorRationale:
      'Major sixth keeps the wrong quality, minor third keeps the original number, and perfect fifth applies neither the third–sixth number pair nor the major–minor exchange.',
    explanation:
      'Inversion numbers sum to nine and major exchanges with minor, so a major third becomes a minor sixth.',
  },
  {
    bloom: 'Apply',
    prompt: 'Invert a perfect fourth. Which number and quality should the new interval have?',
    correct: 'A perfect fifth.',
    distractors: ['A major fifth.', 'A perfect fourth.', 'A diminished fifth.'],
    distractorRationale:
      'Major fifth changes a perfect quality, perfect fourth keeps the original number, and diminished fifth applies the augmented–diminished exchange to a perfect interval.',
    explanation: 'Four and five sum to nine, and perfect quality remains perfect under inversion.',
  },
  {
    bloom: 'Analyze',
    prompt: 'Analyze the inversion of an augmented fourth. Which quality change is required?',
    correct: 'It becomes a diminished fifth.',
    distractors: ['It becomes an augmented fifth.', 'It becomes a perfect fifth.', 'It remains an augmented fourth.'],
    distractorRationale:
      'The alternatives either preserve augmented quality, erase the required augmented–diminished exchange, or fail to swap the fourth–fifth number pair.',
    explanation: 'Augmented and diminished qualities exchange under inversion, while fourth and fifth numbers pair.',
  },
  {
    bloom: 'Understand',
    prompt: 'Explain the number rule for inverting any simple interval.',
    correct: 'The original and inverted interval numbers add to nine.',
    distractors: [
      'The original and inverted interval numbers add to eight.',
      'The inverted interval keeps the original number.',
      'Subtract the original number from twelve semitones.',
    ],
    distractorRationale:
      'The sum-to-eight option omits the inclusive endpoint convention, the same-number option does not invert, and the twelve-semitone rule confuses pitch distance with interval number.',
    explanation: 'The simple inversion pairs are unison–octave, second–seventh, third–sixth, and fourth–fifth.',
  },
  {
    bloom: 'Analyze',
    prompt: 'Analyze a minor seventh and determine its inversion using both number and quality rules.',
    correct: 'A major second.',
    distractors: ['A minor second.', 'A major seventh.', 'A perfect second.'],
    distractorRationale:
      'Minor second keeps the wrong quality, major seventh keeps the wrong number, and perfect second assigns a quality that seconds do not use.',
    explanation: 'Seven inverts to two because the numbers sum to nine, and minor exchanges with major.',
  },
  {
    bloom: 'Evaluate',
    prompt: 'A student says the inversion of a diminished fifth is a perfect fourth. Which correction is best?',
    correct: 'The inversion is an augmented fourth: five inverts to four, and diminished exchanges with augmented.',
    distractors: [
      'The inversion is a diminished fourth because quality never changes.',
      'The inversion is a perfect fifth because tritones resolve to perfect intervals.',
      'The inversion is an augmented fifth because only quality changes.',
    ],
    distractorRationale:
      'The alternatives preserve the wrong quality, invent a resolution rule, or keep the wrong interval number.',
    explanation:
      'Inversion numbers sum to nine and diminished exchanges with augmented, so a diminished fifth becomes an augmented fourth.',
  },
  {
    bloom: 'Create',
    prompt: 'Which compound interval reduces to a perfect fourth and then inverts to a perfect fifth?',
    correct: 'A perfect eleventh.',
    distractors: ['A major tenth.', 'A perfect twelfth.', 'A minor thirteenth.'],
    distractorRationale:
      'A tenth reduces to a third, a twelfth reduces to a fifth, and a thirteenth reduces to a sixth.',
    explanation: 'Subtracting seven from eleven gives the simple fourth; a perfect fourth inverts to a perfect fifth.',
  },
];

function framesForLesson(lesson = {}) {
  const text = [lesson.title, ...(lesson.outcomes || []), ...(lesson.keyConcepts || [])].join(' ').toLowerCase();
  return /compound|invert|inversion|number pair|quality change/.test(text) ? INVERSION_FRAMES : BASIC_INTERVAL_FRAMES;
}

export function buildMusicTheoryFallbackQuizAtoms(lesson, quizPlan, buildTags) {
  const letters = ['A', 'B', 'C', 'D'];
  return framesForLesson(lesson).map((item, index) => {
    const plan = quizPlan[index] || {};
    const answer = letters[(Number(lesson?.lessonNumber || 1) + index) % letters.length];
    let distractorIndex = 0;
    const options = letters.map(
      (letter) => `${letter}. ${letter === answer ? item.correct : item.distractors[distractorIndex++]}`,
    );
    return {
      id: `lesson-${lesson.lessonNumber}-q${index + 1}`,
      type: 'multiple_choice',
      bloomsLevel: item.bloom,
      difficulty: plan.difficulty || 'Medium',
      estimatedMinutes: plan.difficulty === 'Hard' ? 3 : 2,
      points: 2,
      objectiveAligned: plan.objective || lesson.outcomes?.[0] || 'Classify and explain musical intervals.',
      intendedUse: `${String(plan.use || 'Retrieval practice').replace(/^./, (letter) => letter.toUpperCase())} for ${lesson.title}; require the pitch-count or inversion rule before revealing the key.`,
      question: item.prompt,
      options,
      answer,
      distractorRationale: item.distractorRationale,
      explanation: item.explanation,
      tags: buildTags(lesson, 'multiple_choice', item.bloom, plan.use || 'retrieval practice'),
      enrichmentSource: 'compiler-domain-fallback',
      fallbackSource: 'discipline-verified-music-theory-frame',
      quizPlan: {
        source: plan.source,
        role: plan.role,
        bloom: plan.bloom,
        difficulty: plan.difficulty,
        intendedUse: plan.use,
        questionIndex: plan.questionIndex,
        bloomSource: plan.bloomSource,
        sourceSignal: plan.sourceSignal,
        objectiveAlignmentStrategy: plan.objectiveAlignmentStrategy,
        objectiveAlignmentRationale: plan.objectiveAlignmentRationale,
      },
    };
  });
}
