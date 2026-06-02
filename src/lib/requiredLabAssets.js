function searchableExportText({ courseMap, deliverables, requestedFeatureIds }) {
  const requestedDeliverables = {};
  for (const featureId of requestedFeatureIds || []) {
    if (featureId === 'courseMap') continue;
    const entry = deliverables?.[featureId];
    if (entry?.status === 'done' && entry?.data) requestedDeliverables[featureId] = entry.data;
  }
  return JSON.stringify({ courseMap, deliverables: requestedDeliverables }).toLowerCase();
}

export function collectRequiredLabAssets({ courseMap, deliverables, requestedFeatureIds }) {
  const text = searchableExportText({ courseMap, deliverables, requestedFeatureIds });
  const hasDataScienceSignal =
    /\b(applied machine learning|machine learning|data science|predictive model|classification model|regression model|model validation|train[-\s]?test|cross[-\s]?validation|confusion matrix|jupyter|notebook|dataframe|dataset|data set)\b/.test(
      text,
    ) || /\b(precision|recall|threshold|fairness|bias audit|model card)\b/.test(text);
  if (!hasDataScienceSignal) return [];

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

  if (/\b(notebook|jupyter|ipynb|python|dataframe|sklearn|scikit|model validation)\b/.test(text)) {
    requirements.push({
      id: 'starter-notebook',
      label: 'Starter lab notebook',
      formats: ['.ipynb'],
      note: 'Include starter cells for loading data, inspecting features, running the model or analysis, and recording evidence.',
    });
  }
  if (/\b(model card|fairness|bias|subgroup|threshold|precision|recall|confusion matrix)\b/.test(text)) {
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
