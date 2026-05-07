function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function countDeveloperSearchMatches(text, query) {
  if (!String(query || '').trim()) return 0;
  const haystack = String(text || '').toLowerCase();
  const needle = String(query || '').toLowerCase();
  let count = 0;
  let index = 0;
  while (index !== -1) {
    index = haystack.indexOf(needle, index);
    if (index !== -1) {
      count += 1;
      index += needle.length || 1;
    }
  }
  return count;
}

export function titleFromDeveloperId(id) {
  if (!id) return 'Untitled';
  return String(id)
    .replace(/^custom[_-]?/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase()) || id;
}

export function getPromptFeatureOptions(snapshot = {}) {
  const ids = [];
  const add = (id) => {
    if (!id || id === 'courseMap' || ids.includes(id)) return;
    ids.push(id);
  };
  (Array.isArray(snapshot.selectedFeatures) ? snapshot.selectedFeatures : []).forEach(add);
  Object.keys(isPlainObject(snapshot.deliverableConfig) ? snapshot.deliverableConfig : {}).forEach(add);
  Object.keys(isPlainObject(snapshot.deliverables) ? snapshot.deliverables : {}).forEach(add);
  return ids.map(id => ({ id, label: titleFromDeveloperId(id) }));
}

export function getDeveloperSectionStats(snapshot = {}, activeSection = '') {
  if (activeSection === 'themeLayout') {
    const enabledColumns = Array.isArray(snapshot.columns) ? snapshot.columns.filter(column => column?.enabled !== false).length : 0;
    return [`${enabledColumns} enabled columns`, `Theme ${snapshot.slideTheme ?? 'Auto'}`];
  }
  if (activeSection === 'prompts') {
    const config = isPlainObject(snapshot.deliverableConfig) ? snapshot.deliverableConfig : {};
    const overrideCount = Object.values(config).filter(item => (
      item?.customSystemPrompt?.trim()
      || item?.customUserPrompt?.trim()
      || item?.extraInstructions?.trim()
    )).length;
    return [`${overrideCount} prompt overrides`, `${getPromptFeatureOptions(snapshot).length} deliverables`];
  }
  if (activeSection === 'templates') {
    const features = Array.isArray(snapshot.selectedFeatures) ? snapshot.selectedFeatures.length : 0;
    return [`${features} reusable settings`, snapshot.modelName || snapshot.modelId || 'No model'];
  }
  if (activeSection === 'diagnostics') {
    const lessons = snapshot.courseMap?.lessons?.length || 0;
    const outputs = Object.keys(snapshot.deliverables || {}).length;
    return [`${lessons} lessons`, `${outputs} outputs`];
  }
  if (activeSection === 'courseMap') {
    const lessons = snapshot.courseMap?.lessons?.length || 0;
    return [`${lessons} lessons`, `${snapshot.columns?.length || 0} columns`];
  }
  if (activeSection === 'deliverables') {
    const count = Object.keys(snapshot.deliverables || {}).length;
    return [`${count} outputs`, `${snapshot.activeTab || 'courseMap'} active`];
  }
  if (activeSection === 'config') {
    const features = Array.isArray(snapshot.selectedFeatures) ? snapshot.selectedFeatures.length : 0;
    return [`${features} tabs`, snapshot.modelName || snapshot.modelId || 'No model'];
  }
  return [`${Object.keys(snapshot || {}).length} keys`, snapshot.mode || 'workspace'];
}
