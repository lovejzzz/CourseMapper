import { diffDeveloperSnapshots, isPlainObject } from './developerIdeDiagnostics.js';

export const TEMPLATE_STAGE_MODES = [
  { id: 'all', label: 'All' },
  { id: 'model', label: 'Model' },
  { id: 'tabs', label: 'Tabs' },
  { id: 'columns', label: 'Columns' },
  { id: 'prompts', label: 'Prompts' },
];

const TEMPLATE_KEYS = [
  'selectedFeatures',
  'deliverableConfig',
  'lessonScope',
  'slideTheme',
  'provider',
  'modelId',
  'modelName',
  'columns',
];

const MODEL_KEYS = ['provider', 'modelId', 'modelName'];
const TAB_KEYS = ['selectedFeatures', 'lessonScope', 'slideTheme'];
const PROMPT_KEYS = ['customSystemPrompt', 'customUserPrompt', 'extraInstructions'];

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function copyKeys(source, keys) {
  if (!isPlainObject(source)) return {};
  return keys.reduce((patch, key) => {
    if (hasOwn(source, key)) patch[key] = cloneJson(source[key]);
    return patch;
  }, {});
}

function buildPromptPatch(templateData, currentConfig) {
  const incomingConfig = isPlainObject(templateData?.deliverableConfig)
    ? templateData.deliverableConfig
    : {};
  const currentDeliverableConfig = isPlainObject(currentConfig?.deliverableConfig)
    ? cloneJson(currentConfig.deliverableConfig)
    : {};

  let changed = false;
  Object.entries(incomingConfig).forEach(([featureId, featureConfig]) => {
    if (!isPlainObject(featureConfig)) return;
    const promptPatch = PROMPT_KEYS.reduce((patch, key) => {
      if (hasOwn(featureConfig, key) && typeof featureConfig[key] === 'string') {
        patch[key] = featureConfig[key];
      }
      return patch;
    }, {});
    if (Object.keys(promptPatch).length === 0) return;

    currentDeliverableConfig[featureId] = {
      ...(isPlainObject(currentDeliverableConfig[featureId]) ? currentDeliverableConfig[featureId] : {}),
      ...promptPatch,
    };
    changed = true;
  });

  return changed ? { deliverableConfig: currentDeliverableConfig } : {};
}

export function buildDeveloperTemplatePatch(templateData = {}, mode = 'all', currentConfig = {}) {
  const data = isPlainObject(templateData) ? templateData : {};

  if (mode === 'model') return copyKeys(data, MODEL_KEYS);
  if (mode === 'tabs') return copyKeys(data, TAB_KEYS);
  if (mode === 'columns') return Array.isArray(data.columns) ? { columns: cloneJson(data.columns) } : {};
  if (mode === 'prompts') return buildPromptPatch(data, currentConfig);
  return copyKeys(data, TEMPLATE_KEYS);
}

export function applyDeveloperTemplatePatch(currentConfig = {}, templateData = {}, mode = 'all') {
  return {
    ...(isPlainObject(currentConfig) ? currentConfig : {}),
    ...buildDeveloperTemplatePatch(templateData, mode, currentConfig),
  };
}

export function diffDeveloperTemplatePatch(currentConfig = {}, templateData = {}, mode = 'all', limit = 12) {
  return diffDeveloperSnapshots(
    isPlainObject(currentConfig) ? currentConfig : {},
    applyDeveloperTemplatePatch(currentConfig, templateData, mode),
    { limit },
  );
}
