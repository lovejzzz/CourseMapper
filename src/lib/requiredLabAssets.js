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

// Replicated from deriveTechnologyNeeded() in src/lib/leanCourseMap.js
// (laboratory-course detection, the "beakers" regex) — it is not exported
// there, so the pattern is copied; keep the two in sync.
const WET_LAB_SIGNAL =
  /\b(lab|laboratory|experiment\w*|titration|spectroscop\w+|chromatograph\w+|microscop\w+|synthesis|reagent|specimen|dissect\w+|assay|recrystalliz\w+)\b/i;

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
