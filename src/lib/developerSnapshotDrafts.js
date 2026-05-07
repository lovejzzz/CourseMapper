import { assertDeveloperSection, assertDeveloperSnapshot, diffDeveloperSnapshots } from './developerIdeDiagnostics.js';

export const CONFIG_KEYS = [
  'formatVersion',
  'provider',
  'modelId',
  'modelName',
  'selectedFeatures',
  'deliverableConfig',
  'lessonScope',
  'promptText',
  'activeTab',
  'slideTheme',
  'columns',
  'fileNames',
  'mode',
];

export const EDITOR_SECTIONS = [
  { id: 'courseMap', label: 'Course Map', note: 'Lessons and map content' },
  { id: 'deliverables', label: 'Deliverables', note: 'Generated outputs' },
  { id: 'config', label: 'Config', note: 'Models, tabs, settings' },
  { id: 'raw', label: 'Raw JSON', note: 'Full project snapshot' },
];

export const TOOL_SECTIONS = [
  { id: 'themeLayout', label: 'Theme & Layout', note: 'Visual controls' },
  { id: 'prompts', label: 'Prompts', note: 'Model instructions' },
  { id: 'templates', label: 'Templates', note: 'Saved setups' },
  { id: 'diagnostics', label: 'Diagnostics', note: 'Project health' },
  { id: 'agentLog', label: 'Agent Log', note: 'Runs and tool events' },
];

export const SECTIONS = [...EDITOR_SECTIONS, ...TOOL_SECTIONS];
export const EDITOR_SECTION_IDS = new Set(EDITOR_SECTIONS.map((section) => section.id));

export function pretty(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

export function validateSnapshot(value) {
  assertDeveloperSnapshot(value);
}

export function extractSection(snapshot, sectionId) {
  if (sectionId === 'courseMap') return snapshot.courseMap || { lessons: [] };
  if (sectionId === 'deliverables') return snapshot.deliverables || {};
  if (sectionId === 'config') {
    return CONFIG_KEYS.reduce((acc, key) => {
      if (Object.prototype.hasOwnProperty.call(snapshot, key)) acc[key] = snapshot[key];
      return acc;
    }, {});
  }
  return snapshot;
}

export function validateSection(sectionId, value) {
  assertDeveloperSection(sectionId, value);
}

export function mergeSection(snapshot, sectionId, value) {
  if (sectionId === 'raw') return value;
  const next = clone(snapshot);
  if (sectionId === 'courseMap') next.courseMap = value;
  if (sectionId === 'deliverables') next.deliverables = value;
  if (sectionId === 'config') {
    CONFIG_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(value, key)) next[key] = value[key];
      else delete next[key];
    });
  }
  return next;
}

export function createDrafts(snapshot) {
  return EDITOR_SECTIONS.reduce((acc, section) => {
    acc[section.id] = pretty(extractSection(snapshot, section.id));
    return acc;
  }, {});
}

export function parseDraft(sectionId, draft) {
  let parsed;
  try {
    parsed = JSON.parse(draft);
  } catch (err) {
    throw new Error(`JSON syntax error: ${err.message}`);
  }
  validateSection(sectionId, parsed);
  return parsed;
}

export function buildProposedSnapshot(baseSnapshot, drafts, dirtySections) {
  if (dirtySections.size === 0) return baseSnapshot;

  let next = dirtySections.has('raw') ? parseDraft('raw', drafts.raw) : clone(baseSnapshot);

  EDITOR_SECTIONS.filter((section) => section.id !== 'raw').forEach((section) => {
    if (!dirtySections.has(section.id)) return;
    next = mergeSection(next, section.id, parseDraft(section.id, drafts[section.id]));
  });

  validateSnapshot(next);
  return next;
}

export function summarizeDiff(before, after) {
  return diffDeveloperSnapshots(before, after, { limit: 20 });
}
