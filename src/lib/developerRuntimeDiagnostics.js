import { isPlainObject } from './developerIdeDiagnostics.js';
import { COURSE_MAP_PLACEHOLDER } from './developerPromptWorkbench.js';

const STORAGE_WARNING_BYTES = 2_500_000;
const STORAGE_DANGER_BYTES = 4_000_000;

function byteSize(value) {
  let text = '';
  try {
    text = JSON.stringify(value ?? {});
  } catch {
    return 0;
  }
  try {
    return new TextEncoder().encode(text).length;
  } catch {
    return text.length;
  }
}

function addRisk(risks, level, title, message, path = '') {
  risks.push({ level, title, message, path });
}

function titleFromId(id) {
  if (!id) return 'Untitled';
  return (
    String(id)
      .replace(/^custom[_-]?/i, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase()) || id
  );
}

function hasPromptOverride(config) {
  return Boolean(
    config?.customSystemPrompt?.trim() || config?.customUserPrompt?.trim() || config?.extraInstructions?.trim(),
  );
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1_000_000) return `${Math.ceil(bytes / 1000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function getDeveloperRuntimeDiagnostics(snapshot = {}, dirtyCount = 0) {
  const selectedFeatures = Array.isArray(snapshot.selectedFeatures) ? snapshot.selectedFeatures : [];
  const deliverables = isPlainObject(snapshot.deliverables) ? snapshot.deliverables : {};
  const deliverableConfig = isPlainObject(snapshot.deliverableConfig) ? snapshot.deliverableConfig : {};
  const columns = Array.isArray(snapshot.columns) ? snapshot.columns : [];
  const selectedDeliverables = selectedFeatures.filter((feature) => feature !== 'courseMap');
  const deliverableEntries = Object.entries(deliverables);
  const statusCounts = deliverableEntries.reduce((counts, [, output]) => {
    const status = output?.status || 'idle';
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const errorIds = deliverableEntries
    .filter(([, output]) => output?.status === 'error')
    .map(([featureId]) => featureId);
  const generatingIds = deliverableEntries
    .filter(([, output]) => output?.status === 'generating' || output?.status === 'streaming')
    .map(([featureId]) => featureId);
  const staleIds = deliverableEntries.filter(([, output]) => output?.stale === true).map(([featureId]) => featureId);
  const missingSelectedIds = selectedDeliverables.filter((featureId) => !deliverables[featureId]);
  const doneSelectedIds = selectedDeliverables.filter((featureId) => deliverables[featureId]?.status === 'done');
  const promptOverrideIds = Object.entries(deliverableConfig)
    .filter(([, config]) => hasPromptOverride(config))
    .map(([featureId]) => featureId);
  const promptRiskIds = Object.entries(deliverableConfig)
    .filter(
      ([, config]) => config?.customUserPrompt?.trim() && !config.customUserPrompt.includes(COURSE_MAP_PLACEHOLDER),
    )
    .map(([featureId]) => featureId);
  const snapshotBytes = byteSize(snapshot);
  const enabledColumns = columns.filter((column) => column?.enabled !== false).length;
  const risks = [];

  if (!snapshot.provider) {
    addRisk(risks, 'warning', 'Provider Missing', 'No AI provider is selected.', 'provider');
  }
  if (!snapshot.modelId && !snapshot.modelName) {
    addRisk(risks, 'warning', 'Model Missing', 'No model is selected for generation.', 'modelId');
  }
  if (errorIds.length > 0) {
    addRisk(
      risks,
      'error',
      'Generation Errors',
      `${errorIds.map(titleFromId).join(', ')} need attention.`,
      'deliverables',
    );
  }
  if (staleIds.length > 0) {
    addRisk(
      risks,
      'warning',
      'Stale Outputs',
      `${staleIds.length} generated output${staleIds.length === 1 ? '' : 's'} may be out of sync.`,
      'deliverables',
    );
  }
  if (generatingIds.length > 0) {
    addRisk(
      risks,
      'info',
      'Generation In Progress',
      `${generatingIds.map(titleFromId).join(', ')} still running.`,
      'deliverables',
    );
  }
  if (missingSelectedIds.length > 0) {
    addRisk(
      risks,
      'info',
      'Missing Outputs',
      `${missingSelectedIds.map(titleFromId).join(', ')} selected but not generated.`,
      'deliverables',
    );
  }
  if (promptRiskIds.length > 0) {
    addRisk(
      risks,
      'warning',
      'Prompt Placeholder Risk',
      `${promptRiskIds.map(titleFromId).join(', ')} override missing ${COURSE_MAP_PLACEHOLDER}.`,
      'deliverableConfig',
    );
  }
  if (columns.length > 0 && enabledColumns === 0) {
    addRisk(risks, 'error', 'Columns Disabled', 'Every course map column is currently disabled.', 'columns');
  }
  if (dirtyCount > 0) {
    addRisk(
      risks,
      'info',
      'Pending Developer Edits',
      `${dirtyCount} edited section${dirtyCount === 1 ? '' : 's'} not applied yet.`,
      'drafts',
    );
  }
  if (snapshotBytes >= STORAGE_DANGER_BYTES) {
    addRisk(
      risks,
      'error',
      'Large Snapshot',
      `${formatBytes(snapshotBytes)} snapshot may exceed browser storage limits.`,
      'localStorage',
    );
  } else if (snapshotBytes >= STORAGE_WARNING_BYTES) {
    addRisk(
      risks,
      'warning',
      'Large Snapshot',
      `${formatBytes(snapshotBytes)} snapshot is approaching browser storage limits.`,
      'localStorage',
    );
  }

  return {
    providerLabel: snapshot.provider || 'Not set',
    modelLabel: snapshot.modelName || snapshot.modelId || 'Not set',
    apiKeyPolicy: 'API key is not included in developer snapshots.',
    counts: {
      selectedDeliverables: selectedDeliverables.length,
      generatedSelected: doneSelectedIds.length,
      done: statusCounts.done || 0,
      errors: errorIds.length,
      generating: generatingIds.length,
      stale: staleIds.length,
      missingSelected: missingSelectedIds.length,
      promptOverrides: promptOverrideIds.length,
      promptRisks: promptRiskIds.length,
      enabledColumns,
      columns: columns.length,
      snapshotBytes,
    },
    risks,
  };
}
