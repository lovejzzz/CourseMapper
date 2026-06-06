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

function hasDataScienceCourseSignal(text) {
  const strongCourseSignal =
    /\b(applied machine learning|machine learning|data science|data analytics|predictive modeling|classification model|regression model|model validation|train[-\s]?test|cross[-\s]?validation|confusion matrix|jupyter|ipynb|dataframe|sklearn|scikit)\b/.test(
      text,
    ) || /\b(precision|recall|threshold|fairness|bias audit|model card)\b/.test(text);
  const datasetWithModelingContext =
    /\b(dataset|data set)\b/.test(text) &&
    /\b(model|prediction|classification|regression|validation|notebook|python|dataframe|machine learning|data science)\b/.test(
      text,
    );
  return strongCourseSignal || datasetWithModelingContext;
}

export function collectRequiredLabAssets({ courseMap }) {
  const text = searchableExportText({ courseMap });
  if (!hasDataScienceCourseSignal(text)) return [];

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

export function buildRequiredLabAssetsReport(requirements, { courseName }) {
  const lines = [
    '# Required Lab Assets',
    '',
    `${courseName} references lab assets that are not bundled as generated Office documents.`,
    'Attach or replace these assets before teaching or publishing notebook/data-science lessons.',
    '',
    ...requirements.flatMap((requirement) => [
      `- ${requirement.label} (${requirement.formats.join(', ')})`,
      `  ${requirement.note}`,
    ]),
    '',
    'This marker is included so datasets, notebooks, scripts, and model-card materials are visible package dependencies rather than hidden assumptions.',
  ];
  return lines.join('\n');
}
