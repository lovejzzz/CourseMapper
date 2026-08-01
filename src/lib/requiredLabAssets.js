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
const PYTHON_DATA_IDENTITY =
  /(?=.*\bpython\b)(?=.*\b(?:pandas|data(?:set|frame|\s+analysis|\s+cleaning|\s+visualization)|notebooks?|matplotlib|policy\s+analysis)\b)/;
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
  if (DATA_SCIENCE_IDENTITY.test(identityText) || PYTHON_DATA_IDENTITY.test(`${identityText} ${text}`)) return true;
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

const ANATOMY_PHYSIOLOGY_IDENTITY_SIGNAL = /\b(?:anatomy|physiology|a&p|histology)\b/i;
const ANATOMY_PHYSIOLOGY_LAB_SIGNAL =
  /\b(?:microscope labs?|lab practicals?|anatomical models?|histology (?:slides?|images?)|prepared slides?|tissue identification lab|dissect\w*)\b/i;

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
  // Nursing, psychology, and health courses legitimately discuss
  // homeostasis, tissues, and body systems without requiring a physical A&P
  // lab. Require either an identity-level A&P claim or explicit lab practice
  // before emitting microscopes, specimens, and model-handling policies.
  if (ANATOMY_PHYSIOLOGY_IDENTITY_SIGNAL.test(identityText) || ANATOMY_PHYSIOLOGY_LAB_SIGNAL.test(text)) {
    return 'anatomy-physiology';
  }
  if (WET_LAB_SIGNAL.test(text)) return 'wet-lab';
  return 'general';
}

function collectAnatomyPhysiologyAssets() {
  return [
    {
      id: 'anatomical-model-set',
      label: 'Anatomical model set',
      formats: ['physical', '3d', '.pdf'],
      note: 'Name the torso, skeletal, muscular, joint, or organ models students use for labeling and lab practical preparation.',
    },
    {
      id: 'histology-slide-set',
      label: 'Microscope slide and histology image set',
      formats: ['physical', '.jpg', '.png', '.pdf'],
      note: 'Provide the prepared slides, approved image atlas, or LMS image set used for tissue identification and microscope labs.',
    },
    {
      id: 'anatomy-lab-manual',
      label: 'Anatomy and physiology lab manual or procedure worksheets',
      formats: ['.docx', '.pdf'],
      note: 'Attach the per-lab procedures, labeling sheets, and practical-review worksheets students complete.',
    },
    {
      id: 'specimen-model-policy',
      label: 'Lab safety and specimen/model handling policy',
      formats: ['.pdf'],
      note: 'State microscope handling, model care, specimen/image-use rules, cleanup, and any institution-specific safety requirements.',
    },
  ];
}

function collectWetLabAssets(text) {
  if (/\b(?:genetic\w*|genom\w*|meiosis|model[- ]organism|phenotype|allele|dna|rna)\b/i.test(text)) {
    return [
      {
        id: 'model-organism-materials',
        label: 'Model-organism materials and source sheet',
        formats: ['physical', '.pdf'],
        note: 'Name the approved organism, strain or sample source, handling conditions, and the exact traits students observe.',
      },
      {
        id: 'genetics-lab-protocols',
        label: 'Genetics investigation protocols',
        formats: ['.docx', '.pdf'],
        note: 'Attach the microscopy, phenotype-counting, crossing, or simulation procedure used in each investigation.',
      },
      {
        id: 'genetics-observation-tools',
        label: 'Microscopy or phenotype-observation tools',
        formats: ['physical', 'app'],
        note: 'Provide the microscope, approved image set, counting tool, or simulator the course actually uses.',
      },
      {
        id: 'lab-safety',
        label: 'Organism handling and lab safety briefing',
        formats: ['physical', '.pdf'],
        note: 'State PPE, containment, cleanup, disposal, and institution-specific handling rules before physical lab work begins.',
      },
      {
        id: 'genetics-data-sheet',
        label: 'Phenotype and genotype data sheet',
        formats: ['.xlsx', '.csv', '.docx'],
        note: 'Give students a structured place to record counts, calculate ratios or frequencies, and distinguish observations from interpretations.',
      },
    ];
  }
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
    case 'anatomy-physiology':
      return collectAnatomyPhysiologyAssets(text);
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

const SYNTHETIC_POLICY_DATASET = [
  'jurisdiction,year,program_participation,baseline_index,outcome_index,reported_missing',
  'District A,2022,120,48.2,51.4,false',
  'District A,2023,138,49.1,53.0,false',
  'District A,2024,151,50.0,54.2,false',
  'District B,2022,98,46.7,47.9,false',
  'District B,2023,104,47.3,,true',
  'District B,2024,117,48.4,50.1,false',
  'District C,2022,143,52.0,52.8,false',
  'District C,2023,149,51.6,53.1,false',
  'District C,2024,162,52.4,54.0,false',
  'District D,2022,87,44.8,46.2,false',
  'District D,2023,93,45.4,47.0,false',
  'District D,2024,101,46.1,48.3,false',
].join('\n');

function policyDataDictionary(courseName) {
  return [
    '# Synthetic Policy Outcomes Dataset',
    '',
    `Starter data for ${courseName || 'this course'}.`,
    '',
    '> This is a synthetic instructional dataset. It does not describe real jurisdictions, programs, people, or policy effects and must not be cited as empirical evidence.',
    '',
    '| Field | Type | Meaning |',
    '| --- | --- | --- |',
    '| jurisdiction | text | Fictional district label used for grouping. |',
    '| year | integer | Synthetic reporting year. |',
    '| program_participation | integer | Constructed participation count. |',
    '| baseline_index | decimal | Constructed pre-program comparison index. |',
    '| outcome_index | decimal / missing | Constructed outcome index; one value is intentionally missing for cleaning practice. |',
    '| reported_missing | boolean | Whether the outcome value was deliberately omitted. |',
    '',
    '## Intended use',
    '',
    '- Practice loading, validating, cleaning, summarizing, and visualizing tabular data.',
    '- Discuss why descriptive associations do not establish a causal policy effect.',
    '- Replace this scaffold with an instructor-approved public dataset before making real policy claims.',
    '',
    'License: CC0 for this synthetic scaffold.',
  ].join('\n');
}

function starterNotebook(courseName) {
  return JSON.stringify(
    {
      cells: [
        {
          cell_type: 'markdown',
          metadata: {},
          source: [
            `# ${courseName || 'Policy analysis'} starter notebook\n`,
            '\n',
            '**Evidence boundary:** the bundled CSV is synthetic. Use it to practice the workflow, not to make real policy claims.',
          ],
        },
        {
          cell_type: 'code',
          execution_count: null,
          metadata: {},
          outputs: [],
          source: [
            'from pathlib import Path\n',
            'import pandas as pd\n',
            'import matplotlib.pyplot as plt\n',
            '\n',
            'DATA_PATH = Path("policy_outcomes_sample.csv")\n',
            'df = pd.read_csv(DATA_PATH)\n',
            'df.head()',
          ],
        },
        {
          cell_type: 'code',
          execution_count: null,
          metadata: {},
          outputs: [],
          source: [
            '# Inspect types and missingness before changing the data.\n',
            'display(df.dtypes)\n',
            'display(df.isna().sum())',
          ],
        },
        {
          cell_type: 'code',
          execution_count: null,
          metadata: {},
          outputs: [],
          source: [
            '# Keep the missing observation visible; summarize only observed outcomes.\n',
            'summary = df.groupby("jurisdiction", as_index=False).agg(\n',
            '    participation=("program_participation", "mean"),\n',
            '    observed_outcome=("outcome_index", "mean"),\n',
            ')\n',
            'summary',
          ],
        },
        {
          cell_type: 'code',
          execution_count: null,
          metadata: {},
          outputs: [],
          source: [
            'ax = summary.plot.bar(x="jurisdiction", y="observed_outcome", legend=False)\n',
            'ax.set_ylabel("Synthetic outcome index")\n',
            'ax.set_title("Descriptive comparison — not a causal estimate")\n',
            'plt.tight_layout()',
          ],
        },
        {
          cell_type: 'markdown',
          metadata: {},
          source: [
            '## Interpretation checkpoint\n',
            '\n',
            'Write one descriptive finding, one limitation, and one additional piece of evidence needed before recommending a policy action.',
          ],
        },
      ],
      metadata: {
        kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
        language_info: { name: 'python', version: '3' },
      },
      nbformat: 4,
      nbformat_minor: 5,
    },
    null,
    2,
  );
}

const STARTER_POLICY_SCRIPT = [
  '"""Summarize the bundled synthetic policy dataset.',
  '',
  'The data are instructional only and cannot support real policy claims.',
  '"""',
  'from pathlib import Path',
  '',
  'import pandas as pd',
  '',
  'DATA_PATH = Path(__file__).with_name("policy_outcomes_sample.csv")',
  '',
  '',
  'def main() -> None:',
  '    data = pd.read_csv(DATA_PATH)',
  '    print("Missing values by field:")',
  '    print(data.isna().sum().to_string())',
  '    print("\\nObserved outcome means by jurisdiction:")',
  '    print(data.groupby("jurisdiction")["outcome_index"].mean().round(2).to_string())',
  '',
  '',
  'if __name__ == "__main__":',
  '    main()',
  '',
].join('\n');

function modelCardTemplate(courseName) {
  return [
    '# Model / Analysis Card',
    '',
    `Course: ${courseName || 'Course'}`,
    '',
    '## Intended decision and non-goals',
    '- Intended use:',
    '- Decisions this analysis must not make:',
    '',
    '## Data and provenance',
    '- Dataset owner and license:',
    '- Population and time period:',
    '- Missingness and exclusions:',
    '',
    '## Evaluation',
    '- Metric and why it fits the decision:',
    '- Baseline or comparison:',
    '- Subgroup or equity checks:',
    '',
    '## Limitations and review',
    '- Known limitations:',
    '- Human review required before use:',
  ].join('\n');
}

/**
 * Deterministic starter files for computational requirements the exporter can
 * satisfy honestly. Physical kits, licensed readings, and institution-owned
 * resources remain unresolved requirements and are never fabricated.
 */
export function buildBundledRequiredLabAssets(requirements = [], { courseName = 'Course' } = {}) {
  const requestedIds = new Set((Array.isArray(requirements) ? requirements : []).map((item) => item?.id));
  const assets = [];
  // The bundled dataset encodes a public-policy exercise. Do not silently put
  // that domain-specific scaffold into an unrelated machine-learning or data
  // course merely because both require a CSV and notebook.
  const supportsPolicyStarter = /\b(?:policy|public administration|civic|government)\b/i.test(courseName);
  if (supportsPolicyStarter && requestedIds.has('course-dataset')) {
    assets.push({
      requirementId: 'course-dataset',
      path: 'Required Assets/policy_outcomes_sample.csv',
      format: 'csv',
      content: `${SYNTHETIC_POLICY_DATASET}\n`,
    });
  }
  if (supportsPolicyStarter && requestedIds.has('data-dictionary')) {
    assets.push({
      requirementId: 'data-dictionary',
      path: 'Required Assets/DATA_DICTIONARY.md',
      format: 'md',
      content: policyDataDictionary(courseName),
    });
  }
  if (supportsPolicyStarter && requestedIds.has('starter-notebook')) {
    assets.push({
      requirementId: 'starter-notebook',
      path: 'Required Assets/starter_policy_analysis.ipynb',
      format: 'ipynb',
      content: starterNotebook(courseName),
    });
  }
  if (supportsPolicyStarter && requestedIds.has('starter-script')) {
    assets.push({
      requirementId: 'starter-script',
      path: 'Required Assets/starter_policy_analysis.py',
      format: 'py',
      content: STARTER_POLICY_SCRIPT,
    });
  }
  if (requestedIds.has('model-card-template')) {
    assets.push({
      requirementId: 'model-card-template',
      path: 'Required Assets/MODEL_CARD_TEMPLATE.md',
      format: 'md',
      content: modelCardTemplate(courseName),
    });
  }
  return assets;
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
  const bundled = requirements.filter((requirement) => requirement?.status === 'bundled-starter');
  const unresolved = requirements.filter((requirement) => requirement?.status !== 'bundled-starter');
  const lines = [
    '# Required Lab Assets',
    '',
    `${courseName} uses the computational or physical assets listed below.`,
    '',
    ...(bundled.length > 0
      ? [
          '## Bundled starter assets',
          '',
          ...bundled.flatMap((requirement) => [`- ${requirement.label}: ${requirement.path}`, `  ${requirement.note}`]),
          '',
          'Bundled computational files are transparent starter scaffolds. Replace the synthetic dataset with an instructor-approved source before making real-world claims.',
          '',
        ]
      : []),
    ...(unresolved.length > 0
      ? [
          '## Instructor-provided assets still required',
          '',
          ...unresolved.flatMap((requirement) => [
            `- ${requirement.label} (${requirement.formats.join(', ')})`,
            `  ${requirement.note}`,
          ]),
          '',
          'Attach or replace these assets before teaching or publishing the lessons that depend on them.',
          '',
        ]
      : []),
    '',
    'This handoff keeps bundled starter files and unresolved instructor dependencies visibly distinct.',
  ];
  return lines.join('\n');
}
