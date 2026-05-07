import { isPlainObject } from './developerIdeDiagnostics.js';
import { assertNoDeveloperSecrets } from './developerSecretDiagnostics.js';

export const DEVELOPER_TEMPLATE_BUNDLE_KIND = 'coursemapper.developerTemplates';
export const DEVELOPER_TEMPLATE_BUNDLE_VERSION = 1;

function cleanSelectedFeatures(value) {
  const features = Array.isArray(value) ? value.filter(Boolean).map(String) : [];
  return ['courseMap', ...features.filter(id => id !== 'courseMap')];
}

function cleanObject(value) {
  return isPlainObject(value) ? value : {};
}

function cleanTemplateData(value = {}) {
  const data = isPlainObject(value) ? value : {};
  return {
    selectedFeatures: cleanSelectedFeatures(data.selectedFeatures),
    deliverableConfig: cleanObject(data.deliverableConfig),
    lessonScope: cleanObject(data.lessonScope),
    slideTheme: data.slideTheme ?? null,
    provider: data.provider || '',
    modelId: data.modelId || '',
    modelName: data.modelName || '',
    columns: Array.isArray(data.columns) ? data.columns : undefined,
  };
}

function cleanTemplate(value, index = 0) {
  const template = isPlainObject(value) ? value : {};
  const name = String(template.name || `Imported Template ${index + 1}`).trim() || `Imported Template ${index + 1}`;
  const data = cleanTemplateData(template.data || template);
  assertNoDeveloperSecrets(data, `Developer template "${name}"`);
  return {
    name,
    data,
  };
}

export function createDeveloperTemplateBundle(templates = [], exportedAt = Date.now()) {
  return {
    kind: DEVELOPER_TEMPLATE_BUNDLE_KIND,
    formatVersion: DEVELOPER_TEMPLATE_BUNDLE_VERSION,
    exportedAt,
    templates: (Array.isArray(templates) ? templates : []).map(cleanTemplate),
  };
}

export function stringifyDeveloperTemplateBundle(templates = [], exportedAt = Date.now()) {
  return JSON.stringify(createDeveloperTemplateBundle(templates, exportedAt), null, 2);
}

function normalizeTemplateInput(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.templates)) return parsed.templates;
  if (isPlainObject(parsed)) return [parsed];
  return [];
}

export function parseDeveloperTemplateBundle(raw) {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (err) {
    throw new Error(`Template import JSON is invalid: ${err.message}`);
  }

  const warnings = [];
  if (isPlainObject(parsed) && parsed.kind && parsed.kind !== DEVELOPER_TEMPLATE_BUNDLE_KIND) {
    warnings.push(`Imported bundle kind "${parsed.kind}" is not the expected CourseMapper template kind.`);
  }

  const templates = normalizeTemplateInput(parsed)
    .map(cleanTemplate)
    .filter(template => template.data.selectedFeatures.length > 0);

  if (templates.length === 0) {
    throw new Error('Template import did not contain any reusable developer templates.');
  }

  return { templates, warnings };
}
