import { expandKeys } from './keyMaps';

function collectCourseMapSourceText(courseMap) {
  const parts = [
    courseMap?.courseName,
    courseMap?.description,
    courseMap?.semester,
    courseMap?.learningOutcomes,
    courseMap?.sourceSummary,
  ];
  for (const lesson of courseMap?.lessons || []) {
    parts.push(lesson?.title, lesson?.lessonTitle, lesson?.topic, lesson?.topicSection);
    for (const section of lesson?.sections || []) {
      parts.push(
        section?.topicSection,
        section?.learningGoals,
        section?.learningObjectives,
        section?.weeklyAssessments,
        section?.asyncActivities,
        section?.syncActivities,
        section?.technologyNeeded,
        section?.presentationFormat,
        section?.supportingResources,
        section?.evaluateDesign,
      );
    }
  }
  return parts
    .flatMap((part) => (Array.isArray(part) ? part : [part]))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function searchableExportText({ courseMap }) {
  return collectCourseMapSourceText(courseMap);
}

// The course's own identity — name + description — where a genre claim is a
// strong signal, unlike a stray word deep in lesson prose.
function courseIdentityText(courseMap) {
  return [courseMap?.courseName, courseMap?.description].filter(Boolean).join(' ').toLowerCase();
}

// v0.14.1 (1.12): the old gate scanned ENTIRE course-map text and its
// "dataset + model" co-occurrence matched near-universal pedagogy words
// ("model dialogues", "model essays"), shipping .parquet asset lists to
// Mandarin and World Literature. Now: data-science requires the claim at the
// course-identity level, or at least two co-occurring hard artifact tokens.
const DATA_SCIENCE_IDENTITY =
  /\b(machine learning|data science|data analytics|data mining|predictive modeling|statistical learning|deep learning|business analytics)\b/;
// Each token names a concrete data-science artifact or practice — never a
// generic pedagogy word like "model" or "dataset" alone.
const DATA_SCIENCE_HARD_TOKENS = [
  /\bmachine learning\b/,
  /\bdata science\b/,
  /\bregression model\w*\b/,
  /\bclassification model\w*\b/,
  /\bmodel validation\b/,
  /\btrain[-\s]?test\b/,
  /\bcross[-\s]?validation\b/,
  /\bconfusion matrix\b/,
  /\bmodel card\b/,
  /\bfeature engineering\b/,
  /\bjupyter\b/,
  /\bipynb\b/,
  /\bdataframe\b/,
  /\bpandas\b/,
  /\bsklearn\b/,
  /\bscikit\b/,
  /\.csv\b/,
];

function hasDataScienceCourseSignal(identityText, text) {
  if (DATA_SCIENCE_IDENTITY.test(identityText)) return true;
  return DATA_SCIENCE_HARD_TOKENS.filter((pattern) => pattern.test(text)).length >= 2;
}

// Language-course signal: identity-level match, or two distinct
// language-pedagogy tokens in the map prose.
const LANGUAGE_TOKENS = [
  /\b(world|foreign|second|target) language\b/,
  /\blanguage acquisition\b/,
  /\b(mandarin|cantonese|chinese|spanish|french|german|japanese|korean|arabic|italian|portuguese|russian|hindi|swahili|hebrew|latin)\b/,
  /\b(pinyin|hanzi|kanji|hiragana|katakana|hangul)\b/,
  /\b(pronunciation|oral proficiency|listening comprehension|interpretive mode|presentational mode|interpersonal mode)\b/,
  /\b(vocabulary (drill|quiz|list)|grammar drill|tones?\b.*\bdrill)\b/,
];

function hasLanguageCourseSignal(identityText, text) {
  if (LANGUAGE_TOKENS.some((pattern) => pattern.test(identityText))) return true;
  return LANGUAGE_TOKENS.filter((pattern) => pattern.test(text)).length >= 2;
}

// Physical lab assets require physical lab evidence. A bare "lab" is too
// broad: computational labs, language labs, and notebook labs are normal in
// non-wet-lab courses and must not ship goggles/specimen kits.
const WET_LAB_SIGNAL =
  /\b(wet lab|lab safety|bench lab|bench experiment\w*|laboratory methods?|titration|spectroscop\w+|chromatograph\w+|microscop\w+|chemical synthesis|organic synthesis|reagent|specimen|dissect\w+|assay|recrystalliz\w+|pipette|beaker|streak plate|hand lens|field notebook|(?:rock|mineral|biological|chemical)\s+samples?|sample kit)\b/i;

/**
 * Which asset genre this course belongs to. Exported so tests (and the
 * report) can verify WHICH branch fired, not just what came out.
 * Order matters: data-science and language are checked before the wet-lab
 * regex because "language lab" and "data lab" would otherwise match it.
 */
export function classifyCourseAssetGenre({ courseMap }) {
  const text = searchableExportText({ courseMap });
  const identityText = courseIdentityText(courseMap);
  if (hasDataScienceCourseSignal(identityText, text)) return 'data-science';
  if (hasLanguageCourseSignal(identityText, text)) return 'language';
  if (WET_LAB_SIGNAL.test(text)) return 'wet-lab';
  return 'general';
}

function collectWetLabAssets(text) {
  return [
    {
      id: 'specimen-kit',
      label: 'Specimen or sample kit',
      formats: ['physical'],
      note: 'Provide the rock, mineral, biological, or chemical samples the bench and field activities reference.',
    },
    {
      id: 'experiment-list',
      label: 'Experiment list and procedure sheets',
      formats: ['.docx', '.pdf'],
      note: 'The course references laboratory work — attach the per-lesson experiment procedures students follow (the "(see experiment list)" reference must resolve to this document).',
    },
    {
      id: 'lab-safety',
      label: 'Lab safety equipment and briefing',
      formats: ['physical', '.pdf'],
      note: 'Goggles, gloves, and the safety briefing students complete before the first bench or field session.',
    },
    {
      id: 'observation-tools',
      label: 'Hand lenses and observation tools',
      formats: ['physical'],
      note: 'Hand lens or loupe, scales, streak plates, or the discipline-specific observation tools the activities assume.',
    },
    {
      id: 'field-notebook-template',
      label: 'Field or lab notebook template',
      formats: ['.docx', '.pdf'],
      note: `A structured template for recording observations, measurements, and conclusions${
        /\bfield\b/.test(text) ? ' in the lab and in the field' : ''
      }.`,
    },
  ];
}

function collectLanguageAssets() {
  return [
    {
      id: 'audio-recording-tool',
      label: 'Audio recording and playback tool',
      formats: ['app'],
      note: 'Students record speaking practice and listen to model audio — name the tool (LMS recorder or equivalent) and confirm access.',
    },
    {
      id: 'target-language-input',
      label: 'Target-language keyboard or input method setup guide',
      formats: ['.pdf', '.md'],
      note: 'Setup steps so students can type in the target language (IME, keyboard layout, or romanization tool) before the first written assignment.',
    },
  ];
}

function collectDataScienceAssets(text) {
  const requirements = [
    {
      id: 'course-dataset',
      label: 'Course dataset',
      formats: ['.csv', '.xlsx', '.parquet'],
      note: 'Provide the dataset students will inspect, clean, model, validate, and discuss.',
    },
    {
      id: 'data-dictionary',
      label: 'Data dictionary or dataset card',
      formats: ['.md', '.docx', '.pdf'],
      note: 'Define fields, target/outcome, source/provenance, missingness notes, permitted use, and known limits.',
    },
  ];

  if (
    /\b(machine learning|data science|notebook|jupyter|ipynb|python|dataframe|sklearn|scikit|model validation)\b/.test(
      text,
    )
  ) {
    requirements.push({
      id: 'starter-notebook',
      label: 'Starter lab notebook',
      formats: ['.ipynb'],
      note: 'Include starter cells for loading data, inspecting features, running the model or analysis, and recording evidence.',
    });
  }
  if (
    /\b(machine learning|model card|fairness|bias|subgroup|threshold|precision|recall|confusion matrix)\b/.test(text)
  ) {
    requirements.push({
      id: 'model-card-template',
      label: 'Model card or validation template',
      formats: ['.md', '.docx'],
      note: 'Prompt students to record intended use, metric choice, threshold tradeoff, fairness check, and limitations.',
    });
  }
  if (/\b(script|python|py file|automation|pipeline)\b/.test(text)) {
    requirements.push({
      id: 'starter-script',
      label: 'Optional starter script',
      formats: ['.py'],
      note: 'Provide only when the course expects command-line or script-based practice outside notebooks.',
    });
  }
  return requirements;
}

export function collectRequiredLabAssets({ courseMap }) {
  const text = searchableExportText({ courseMap });
  switch (classifyCourseAssetGenre({ courseMap })) {
    case 'data-science':
      return collectDataScienceAssets(text);
    case 'wet-lab':
      return collectWetLabAssets(text);
    case 'language':
      return collectLanguageAssets();
    default:
      // Weak or absent signals — shipping nothing beats shipping the wrong
      // genre's asset list.
      return [];
  }
}

// ── v0.14.5 (F1): generated pronunciation reference for language courses ────
// Language-genre packages gain a generated markdown asset built from data the
// package already carries: the compiled study guides' key terms, whose
// romanization the v0.14.1 rm contract paired with every non-Latin term
// ("你好 (nǐ hǎo)" — displayKeyTermName in courseBlueprintCompiler.js, which
// also carries the structured scriptTerm/romanization fields since v0.14.5).
// Non-language courses are untouched: no genre signal or no rm-carrying
// vocabulary → no asset.

// Keep in sync with NON_LATIN_SCRIPT_RE in src/lib/blueprintEnrichmentPass.js
// (not exported there; the pattern is copied, same as WET_LAB_SIGNAL above).
const NON_LATIN_SCRIPT_RE =
  /[\u0400-\u04ff\u0590-\u05ff\u0600-\u06ff\u0904-\u097f\u0e00-\u0e7f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;

// Mandarin signal: gates the four-tones section (tones are Mandarin-specific;
// a kana or hangul course gets the vocabulary table without the tone chart).
const MANDARIN_SIGNAL_RE = /\b(mandarin|pinyin|hanzi|chinese)\b/i;

const VOCABULARY_ROW_CAP = 40;

function firstSentence(text, maxChars = 90) {
  const cleaned = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const sentenceEnd = cleaned.search(/[.!?](\s|$)/);
  const sentence = sentenceEnd > 0 ? cleaned.slice(0, sentenceEnd + 1) : cleaned;
  if (sentence.length <= maxChars) return sentence;
  return `${sentence.slice(0, maxChars - 1).replace(/\s+\S*$/, '')}…`;
}

/** Parse a display-formatted term "你好 (nǐ hǎo)" back into script + rm. */
function splitDisplayTerm(displayTerm) {
  const match = /^(.+?)\s*\(([^()]+)\)$/.exec(String(displayTerm || '').trim());
  if (!match) return null;
  const [, script, rm] = match;
  if (!NON_LATIN_SCRIPT_RE.test(script) || NON_LATIN_SCRIPT_RE.test(rm)) return null;
  return { script: script.trim(), rm: rm.trim() };
}

function studyGuideEntries(deliverables) {
  const data = deliverables?.studyGuides?.data;
  if (!data || typeof data !== 'object') return [];
  // Same tolerance as the exporters: expand compact keys, accept either root.
  const expanded = expandKeys('studyGuides', data) || {};
  const guides = expanded.guides || expanded.studyGuides;
  return Array.isArray(guides) ? guides : [];
}

/**
 * The vocabulary rows for the pronunciation reference, lesson-ordered and
 * capped at 40: every study-guide key term that carries romanization. Reads
 * the structured fields (scriptTerm/romanization, written by the compiler
 * since v0.14.5) and falls back to parsing the "term (rm)" display format for
 * packages compiled before the structured fields existed.
 */
export function collectPronunciationRows({ deliverables } = {}, { cap = VOCABULARY_ROW_CAP } = {}) {
  const rows = [];
  const seen = new Set();
  for (const guide of studyGuideEntries(deliverables)) {
    for (const term of Array.isArray(guide?.keyTerms) ? guide.keyTerms : []) {
      const structured =
        term?.scriptTerm && term?.romanization
          ? { script: String(term.scriptTerm), rm: String(term.romanization) }
          : null;
      const parsed = structured || splitDisplayTerm(term?.term);
      if (!parsed || !NON_LATIN_SCRIPT_RE.test(parsed.script)) continue;
      const key = `${parsed.script}|${parsed.rm}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ script: parsed.script, rm: parsed.rm, gloss: firstSentence(term?.definition) });
      if (rows.length >= cap) return rows;
    }
  }
  return rows;
}

const MANDARIN_TONE_SECTION = [
  '## The four Mandarin tones',
  '',
  'Every syllable carries a tone; the tone mark sits over the main vowel of the pinyin.',
  '',
  '| Tone | Mark | Example | Contour |',
  '| --- | --- | --- | --- |',
  '| 1st | ā | mā 妈 ("mother") | high and level |',
  '| 2nd | á | má 麻 ("hemp") | rising |',
  '| 3rd | ǎ | mǎ 马 ("horse") | falling then rising |',
  '| 4th | à | mà 骂 ("to scold") | sharp falling |',
  '',
  'The neutral tone is unmarked (ma 吗, the question particle).',
].join('\n');

/**
 * The generated "Pronunciation reference" markdown for a language-genre
 * package, or null when the course is not language-genre or no vocabulary
 * with romanization is reachable (a Latin-script language course ships
 * nothing — an empty chart would be noise, and a four-tones chart for
 * Spanish would be wrong).
 */
export function buildPronunciationReference({ courseMap, deliverables } = {}) {
  if (classifyCourseAssetGenre({ courseMap }) !== 'language') return null;
  const rows = collectPronunciationRows({ deliverables });
  if (rows.length === 0) return null;

  const courseText = `${courseIdentityText(courseMap)} ${searchableExportText({ courseMap })}`;
  const mandarin = MANDARIN_SIGNAL_RE.test(courseText);
  const scriptHeader = mandarin ? 'Hanzi' : 'Term';
  const rmHeader = mandarin ? 'Pinyin' : 'Romanization';

  const lines = [
    '# Pronunciation Reference',
    '',
    `Generated pronunciation support for ${courseMap?.courseName || 'this course'}. ` +
      'The vocabulary below is drawn from the lesson study guides in this package, in lesson order.',
    '',
    ...(mandarin ? [MANDARIN_TONE_SECTION, ''] : []),
    '## Vocabulary reference',
    '',
    `| ${scriptHeader} | ${rmHeader} | Gloss |`,
    '| --- | --- | --- |',
    ...rows.map((row) => `| ${row.script} | ${row.rm} | ${row.gloss || '—'} |`),
    '',
    `_${rows.length} term(s); capped at ${VOCABULARY_ROW_CAP}. Romanizations come from the same reviewed vocabulary the lesson materials teach._`,
  ];
  return { markdown: lines.join('\n'), rowCount: rows.length, mandarin };
}

export function buildRequiredLabAssetsReport(requirements, { courseName }) {
  const lines = [
    '# Required Lab Assets',
    '',
    `${courseName} references course assets that are not bundled as generated Office documents.`,
    'Attach or replace these assets before teaching or publishing the lessons that depend on them.',
    '',
    ...requirements.flatMap((requirement) => [
      `- ${requirement.label} (${requirement.formats.join(', ')})`,
      `  ${requirement.note}`,
    ]),
    '',
    'This marker is included so kits, datasets, templates, and other non-generated materials are visible package dependencies rather than hidden assumptions.',
  ];
  return lines.join('\n');
}
