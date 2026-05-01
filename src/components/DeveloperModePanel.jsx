import React, { useEffect, useMemo, useRef, useState } from 'react';
import FocusTrap from 'focus-trap-react';

const CONFIG_KEYS = [
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

const EDITOR_SECTIONS = [
  { id: 'courseMap', label: 'Course Map', note: 'Lessons and map content' },
  { id: 'deliverables', label: 'Deliverables', note: 'Generated outputs' },
  { id: 'config', label: 'Config', note: 'Models, tabs, settings' },
  { id: 'raw', label: 'Raw JSON', note: 'Full project snapshot' },
];

const TOOL_SECTIONS = [
  { id: 'themeLayout', label: 'Theme & Layout', note: 'Visual controls' },
  { id: 'templates', label: 'Templates', note: 'Saved setups' },
  { id: 'diagnostics', label: 'Diagnostics', note: 'Project health' },
];

const SECTIONS = [...EDITOR_SECTIONS, ...TOOL_SECTIONS];
const EDITOR_SECTION_IDS = new Set(EDITOR_SECTIONS.map(section => section.id));

function pretty(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateSnapshot(value) {
  if (!isPlainObject(value)) {
    throw new Error('Project code must be a JSON object.');
  }
  if (!isPlainObject(value.courseMap)) {
    throw new Error('courseMap must be an object.');
  }
  if (!Array.isArray(value.courseMap.lessons)) {
    throw new Error('courseMap.lessons must be an array.');
  }
  if (value.selectedFeatures !== undefined && !Array.isArray(value.selectedFeatures)) {
    throw new Error('selectedFeatures must be an array.');
  }
  if (value.deliverables !== undefined && !isPlainObject(value.deliverables)) {
    throw new Error('deliverables must be an object.');
  }
  if (value.deliverableConfig !== undefined && !isPlainObject(value.deliverableConfig)) {
    throw new Error('deliverableConfig must be an object.');
  }
  if (value.lessonScope !== undefined && !isPlainObject(value.lessonScope)) {
    throw new Error('lessonScope must be an object.');
  }
  if (value.columns !== undefined && !Array.isArray(value.columns)) {
    throw new Error('columns must be an array.');
  }
}

function extractSection(snapshot, sectionId) {
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

function validateSection(sectionId, value) {
  if (sectionId === 'raw') {
    validateSnapshot(value);
    return;
  }
  if (sectionId === 'courseMap') {
    if (!isPlainObject(value)) throw new Error('Course Map must be a JSON object.');
    if (!Array.isArray(value.lessons)) throw new Error('Course Map needs a lessons array.');
    return;
  }
  if (sectionId === 'deliverables') {
    if (!isPlainObject(value)) throw new Error('Deliverables must be a JSON object.');
    return;
  }
  if (sectionId === 'config') {
    if (!isPlainObject(value)) throw new Error('Config must be a JSON object.');
    if (value.selectedFeatures !== undefined && !Array.isArray(value.selectedFeatures)) {
      throw new Error('Config selectedFeatures must be an array.');
    }
    if (value.deliverableConfig !== undefined && !isPlainObject(value.deliverableConfig)) {
      throw new Error('Config deliverableConfig must be an object.');
    }
    if (value.lessonScope !== undefined && !isPlainObject(value.lessonScope)) {
      throw new Error('Config lessonScope must be an object.');
    }
    if (value.columns !== undefined && !Array.isArray(value.columns)) {
      throw new Error('Config columns must be an array.');
    }
  }
}

function mergeSection(snapshot, sectionId, value) {
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

function createDrafts(snapshot) {
  return EDITOR_SECTIONS.reduce((acc, section) => {
    acc[section.id] = pretty(extractSection(snapshot, section.id));
    return acc;
  }, {});
}

function parseDraft(sectionId, draft) {
  let parsed;
  try {
    parsed = JSON.parse(draft);
  } catch (err) {
    throw new Error(`JSON syntax error: ${err.message}`);
  }
  validateSection(sectionId, parsed);
  return parsed;
}

function buildProposedSnapshot(baseSnapshot, drafts, dirtySections) {
  if (dirtySections.size === 0) return baseSnapshot;

  let next = dirtySections.has('raw')
    ? parseDraft('raw', drafts.raw)
    : clone(baseSnapshot);

  EDITOR_SECTIONS.filter(section => section.id !== 'raw').forEach((section) => {
    if (!dirtySections.has(section.id)) return;
    next = mergeSection(next, section.id, parseDraft(section.id, drafts[section.id]));
  });

  validateSnapshot(next);
  return next;
}

function summarizeDiff(before, after) {
  const keys = Array.from(new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]));
  return keys
    .filter(key => pretty(before?.[key]) !== pretty(after?.[key]))
    .map((key) => {
      if (before?.[key] === undefined) return `Added ${key}`;
      if (after?.[key] === undefined) return `Removed ${key}`;
      return `Changed ${key}`;
    })
    .slice(0, 10);
}

function countMatches(text, query) {
  if (!query.trim()) return 0;
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
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

function sectionStats(snapshot, activeSection) {
  if (activeSection === 'themeLayout') {
    const enabledColumns = Array.isArray(snapshot.columns) ? snapshot.columns.filter(column => column?.enabled !== false).length : 0;
    return [`${enabledColumns} enabled columns`, `Theme ${snapshot.slideTheme ?? 'Auto'}`];
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

function titleFromId(id) {
  if (!id) return 'Untitled';
  return String(id)
    .replace(/^custom[_-]?/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase()) || id;
}

function formatDate(timestamp) {
  if (!timestamp) return 'Never';
  try {
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Unknown';
  }
}

function buildDiagnostics(snapshot, dirtySections) {
  const lessons = Array.isArray(snapshot.courseMap?.lessons) ? snapshot.courseMap.lessons : [];
  const features = Array.isArray(snapshot.selectedFeatures) ? snapshot.selectedFeatures : [];
  const deliverables = isPlainObject(snapshot.deliverables) ? snapshot.deliverables : {};
  const columns = Array.isArray(snapshot.columns) ? snapshot.columns : [];
  const issues = [];

  if (lessons.length === 0) issues.push({ level: 'error', message: 'Course map has no lessons.' });
  if (!features.includes('courseMap')) issues.push({ level: 'warning', message: 'Course Map is not included in selected features.' });
  if (snapshot.activeTab && features.length > 0 && !features.includes(snapshot.activeTab)) {
    issues.push({ level: 'warning', message: `Active tab "${titleFromId(snapshot.activeTab)}" is not in selected features.` });
  }
  features
    .filter(feature => feature !== 'courseMap')
    .forEach((feature) => {
      const output = deliverables[feature];
      if (!output) issues.push({ level: 'info', message: `${titleFromId(feature)} is selected but has not been generated yet.` });
      if (output?.status === 'error') issues.push({ level: 'error', message: `${titleFromId(feature)} has a generation error.` });
      if (output?.status === 'generating') issues.push({ level: 'info', message: `${titleFromId(feature)} is still generating.` });
    });
  if (columns.length === 0) issues.push({ level: 'warning', message: 'No course map columns are configured.' });
  if (columns.length > 0 && columns.every(column => column?.enabled === false)) {
    issues.push({ level: 'error', message: 'All course map columns are disabled.' });
  }
  if (!snapshot.modelId && !snapshot.modelName) issues.push({ level: 'warning', message: 'No AI model is selected.' });
  if (dirtySections.size > 0) issues.push({ level: 'info', message: 'Developer edits are pending and have not been applied.' });

  return {
    lessons: lessons.length,
    selectedFeatures: features.length,
    deliverables: Object.keys(deliverables).length,
    enabledColumns: columns.filter(column => column?.enabled !== false).length,
    issues,
  };
}

export default function DeveloperModePanel({
  isOpen,
  snapshot,
  developerTemplates = [],
  activeDeveloperTemplateId = '',
  onApply,
  onSaveTemplate,
  onRenameTemplate,
  onDuplicateTemplate,
  onDeleteTemplate,
  onClose,
}) {
  const [baseSnapshot, setBaseSnapshot] = useState(() => clone(snapshot));
  const [drafts, setDrafts] = useState(() => createDrafts(snapshot || {}));
  const [dirtySections, setDirtySections] = useState(() => new Set());
  const [activeSection, setActiveSection] = useState('courseMap');
  const [query, setQuery] = useState('');
  const [lastAppliedSnapshot, setLastAppliedSnapshot] = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [status, setStatus] = useState({
    type: 'idle',
    message: 'Edit a section, then apply to update the workspace preview.',
  });
  const textareaRef = useRef(null);
  const wasOpenRef = useRef(false);

  function loadSnapshot(nextSnapshot, message = 'Loaded current workspace code.') {
    const cleanSnapshot = clone(nextSnapshot || {});
    setBaseSnapshot(cleanSnapshot);
    setDrafts(createDrafts(cleanSnapshot));
    setDirtySections(new Set());
    setStatus({ type: 'idle', message });
  }

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      loadSnapshot(snapshot);
      setActiveSection('courseMap');
      setQuery('');
      setTemplateName('');
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, snapshot]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'contain';
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [isOpen]);

  const isEditorSection = EDITOR_SECTION_IDS.has(activeSection);
  const activeDraft = isEditorSection ? (drafts[activeSection] || '') : '';
  const dirty = dirtySections.size > 0;

  const activeValidation = useMemo(() => {
    if (!isEditorSection) {
      return { ok: true, message: 'Tool controls update validated workspace settings.' };
    }
    try {
      parseDraft(activeSection, activeDraft);
      return { ok: true, message: 'Current section is valid.' };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  }, [activeDraft, activeSection]);

  const proposed = useMemo(() => {
    try {
      return buildProposedSnapshot(baseSnapshot, drafts, dirtySections);
    } catch {
      return null;
    }
  }, [baseSnapshot, drafts, dirtySections]);

  const changes = useMemo(() => {
    if (!proposed || !dirty) return [];
    return summarizeDiff(baseSnapshot, proposed);
  }, [baseSnapshot, dirty, proposed]);

  const workingSnapshot = proposed || baseSnapshot;
  const stats = sectionStats(workingSnapshot, activeSection);
  const matchCount = isEditorSection ? countMatches(activeDraft, query) : 0;

  if (!isOpen) return null;

  function markDirty(sectionId, value) {
    setDrafts(prev => ({ ...prev, [sectionId]: value }));
    setDirtySections((prev) => {
      const next = new Set(prev);
      next.add(sectionId);
      return next;
    });
    setStatus({ type: 'idle', message: 'Unsaved developer edits.' });
  }

  function handleFormat() {
    try {
      const parsed = parseDraft(activeSection, activeDraft);
      markDirty(activeSection, pretty(parsed));
      setStatus({ type: 'success', message: `${SECTIONS.find(s => s.id === activeSection)?.label} formatted.` });
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
  }

  function handleResetSection() {
    setDrafts(prev => ({ ...prev, [activeSection]: pretty(extractSection(baseSnapshot, activeSection)) }));
    setDirtySections((prev) => {
      const next = new Set(prev);
      next.delete(activeSection);
      return next;
    });
    setStatus({ type: 'idle', message: 'Section reset to the last loaded workspace state.' });
  }

  function handleFindNext() {
    if (!query.trim() || !textareaRef.current) return;
    const textarea = textareaRef.current;
    const haystack = activeDraft.toLowerCase();
    const needle = query.toLowerCase();
    const from = textarea.selectionEnd || 0;
    let index = haystack.indexOf(needle, from);
    if (index === -1) index = haystack.indexOf(needle, 0);
    if (index === -1) return;
    textarea.focus();
    textarea.setSelectionRange(index, index + needle.length);
  }

  function handleApply() {
    try {
      const next = buildProposedSnapshot(baseSnapshot, drafts, dirtySections);
      setLastAppliedSnapshot(baseSnapshot);
      onApply(next);
      loadSnapshot(next, 'Saved. Workspace preview updated.');
      setStatus({ type: 'success', message: 'Saved. Workspace preview updated.' });
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'This code cannot run in the workspace.' });
    }
  }

  function handleRollback() {
    if (!lastAppliedSnapshot) return;
    try {
      onApply(lastAppliedSnapshot);
      loadSnapshot(lastAppliedSnapshot, 'Rolled back to the previous developer save.');
      setLastAppliedSnapshot(null);
      setStatus({ type: 'success', message: 'Rolled back to the previous developer save.' });
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Rollback failed.' });
    }
  }

  function handleSaveTemplate() {
    if (!onSaveTemplate) return;
    try {
      const source = proposed || buildProposedSnapshot(baseSnapshot, drafts, dirtySections);
      const name = templateName.trim() || `Developer Template ${new Date().toLocaleDateString()}`;
      const saved = onSaveTemplate(source, name);
      setTemplateName(saved?.name || name);
      setStatus({ type: 'success', message: `Saved "${saved?.name || name}" as a reusable template.` });
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Template could not be saved.' });
    }
  }

  function getConfigDraft() {
    try {
      return parseDraft('config', drafts.config || pretty(extractSection(baseSnapshot, 'config')));
    } catch {
      return extractSection(workingSnapshot, 'config');
    }
  }

  function updateConfigPatch(patch, message) {
    const nextConfig = {
      ...getConfigDraft(),
      ...patch,
    };
    markDirty('config', pretty(nextConfig));
    setStatus({ type: 'idle', message });
  }

  function handleToggleColumn(index) {
    const columns = Array.isArray(getConfigDraft().columns) ? [...getConfigDraft().columns] : [];
    columns[index] = {
      ...columns[index],
      enabled: columns[index]?.enabled === false,
    };
    updateConfigPatch({ columns }, 'Column visibility updated.');
  }

  function handleMoveFeature(featureId, direction) {
    const config = getConfigDraft();
    const features = Array.isArray(config.selectedFeatures) ? [...config.selectedFeatures] : ['courseMap'];
    const index = features.indexOf(featureId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= features.length) return;
    [features[index], features[nextIndex]] = [features[nextIndex], features[index]];
    updateConfigPatch({ selectedFeatures: features }, 'Deliverable tab order updated.');
  }

  function handleRenameTemplate(template, name) {
    if (!onRenameTemplate || !name.trim()) return;
    const saved = onRenameTemplate(template.id, name.trim());
    setStatus({ type: 'success', message: `Renamed template to "${saved?.name || name.trim()}".` });
  }

  function handleDuplicateTemplate(template) {
    if (!onDuplicateTemplate) return;
    const saved = onDuplicateTemplate(template.id);
    if (saved) setStatus({ type: 'success', message: `Duplicated "${template.name}".` });
  }

  function handleStageTemplate(template) {
    if (!template?.data) return;
    updateConfigPatch(template.data, `Staged "${template.name}". Review the config, then apply to update the workspace.`);
  }

  function handleDeleteTemplate(template) {
    if (!onDeleteTemplate) return;
    const confirmed = window.confirm(`Delete "${template.name}"? This removes it from future project setup.`);
    if (!confirmed) return;
    onDeleteTemplate(template.id);
    setStatus({ type: 'success', message: `Deleted "${template.name}".` });
  }

  function renderThemeLayout() {
    const config = getConfigDraft();
    const columns = Array.isArray(config.columns) ? config.columns : [];
    const features = Array.isArray(config.selectedFeatures) ? config.selectedFeatures : [];
    const slideThemeValue = config.slideTheme ?? '';

    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Theme</p>
            <h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">Slide visual preset</h3>
            <select
              value={slideThemeValue}
              onChange={(e) => updateConfigPatch({ slideTheme: e.target.value === '' ? null : Number(e.target.value) }, 'Slide theme updated.')}
              className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="">Auto</option>
              {[0, 1, 2, 3, 4, 5].map(theme => (
                <option key={theme} value={theme}>Theme {theme + 1}</option>
              ))}
            </select>
            <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
              This becomes the default visual style for generated slide deliverables and future templates saved from this IDE.
            </p>
          </section>

          <section className="rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Navigation</p>
                <h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">Deliverable tab order</h3>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {features.length > 0 ? features.map((feature, index) => (
                <div key={`${feature}-${index}`} className="flex items-center gap-2 rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-[10px] font-bold text-slate-500 dark:bg-slate-900 dark:text-slate-300">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-700 dark:text-slate-200">{titleFromId(feature)}</span>
                  <button
                    onClick={() => handleMoveFeature(feature, -1)}
                    disabled={index === 0}
                    className="tactile rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-500 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    Up
                  </button>
                  <button
                    onClick={() => handleMoveFeature(feature, 1)}
                    disabled={index === features.length - 1}
                    className="tactile rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-500 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    Down
                  </button>
                </div>
              )) : (
                <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-[12px] text-slate-400 dark:border-slate-700">No deliverable tabs selected.</p>
              )}
            </div>
          </section>
        </div>

        <section className="mt-4 rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Course Map Layout</p>
              <h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">Visible columns</h3>
            </div>
            <button
              onClick={() => updateConfigPatch({ columns: columns.map(column => ({ ...column, enabled: true })) }, 'All course map columns enabled.')}
              disabled={columns.length === 0}
              className="tactile rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Enable All
            </button>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {columns.length > 0 ? columns.map((column, index) => (
              <label
                key={`${column.key || column.title || index}-${index}`}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  checked={column.enabled !== false}
                  onChange={() => handleToggleColumn(index)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-300"
                />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-semibold text-slate-700 dark:text-slate-200">{column.title || titleFromId(column.key)}</span>
                  <span className="block truncate text-[10px] text-slate-400">{column.key || 'custom column'}</span>
                </span>
              </label>
            )) : (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-[12px] text-slate-400 dark:border-slate-700">No columns are available in this project.</p>
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderTemplates() {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <section className="rounded-xl border border-indigo-200/70 bg-indigo-50/60 p-4 dark:border-indigo-500/40 dark:bg-indigo-500/10">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-300">Save Current Setup</p>
          <h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">Create a reusable developer template</h3>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[12px] text-slate-700 outline-none focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              placeholder="Template name"
            />
            <button
              onClick={handleSaveTemplate}
              disabled={!onSaveTemplate || !proposed}
              className="tactile rounded-lg bg-indigo-500 px-4 py-2 text-[12px] font-semibold text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save Template
            </button>
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Template Manager</p>
              <h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{developerTemplates.length} saved templates</h3>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {developerTemplates.length > 0 ? developerTemplates.map(template => (
              <div key={template.id} className={`rounded-xl border p-3 ${template.id === activeDeveloperTemplateId ? 'border-indigo-300 bg-indigo-50/60 dark:border-indigo-500/50 dark:bg-indigo-500/10' : 'border-slate-200/70 bg-slate-50 dark:border-slate-700 dark:bg-slate-950'}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    defaultValue={template.name}
                    onBlur={(e) => {
                      if (e.target.value.trim() !== template.name) handleRenameTemplate(template, e.target.value);
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    aria-label={`Rename ${template.name}`}
                  />
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => handleStageTemplate(template)}
                      className="tactile rounded-lg bg-indigo-500 px-3 py-2 text-[11px] font-semibold text-white hover:bg-indigo-600"
                    >
                      Stage
                    </button>
                    <button
                      onClick={() => handleDuplicateTemplate(template)}
                      className="tactile rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(template)}
                      className="tactile rounded-lg border border-red-200 bg-white px-3 py-2 text-[11px] font-semibold text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:bg-slate-900 dark:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold text-slate-400">
                  <span>{(template.data?.selectedFeatures || []).length} tabs</span>
                  <span>{(template.data?.columns || []).length} columns</span>
                  <span>{template.data?.modelName || template.data?.modelId || 'No model'}</span>
                  <span>Updated {formatDate(template.updatedAt)}</span>
                </div>
              </div>
            )) : (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-[12px] text-slate-400 dark:border-slate-700">
                No developer templates yet. Save the current setup to make it available when creating future projects.
              </p>
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderDiagnostics() {
    const diagnostics = buildDiagnostics(workingSnapshot, dirtySections);
    const cards = [
      ['Lessons', diagnostics.lessons],
      ['Selected Tabs', diagnostics.selectedFeatures],
      ['Generated Outputs', diagnostics.deliverables],
      ['Enabled Columns', diagnostics.enabledColumns],
    ];

    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
            </div>
          ))}
        </div>

        <section className="mt-4 rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Health Check</p>
          <h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">
            {diagnostics.issues.length === 0 ? 'No issues found' : `${diagnostics.issues.length} findings`}
          </h3>
          <div className="mt-3 space-y-2">
            {diagnostics.issues.length > 0 ? diagnostics.issues.map((issue, index) => (
              <div key={`${issue.message}-${index}`} className="flex gap-3 rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  issue.level === 'error' ? 'bg-red-500' : issue.level === 'warning' ? 'bg-amber-400' : 'bg-indigo-400'
                }`} />
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{issue.level}</p>
                  <p className="text-[12px] leading-5 text-slate-600 dark:text-slate-300">{issue.message}</p>
                </div>
              </div>
            )) : (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-[12px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                Project structure, deliverable selection, and layout settings look ready.
              </p>
            )}
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Runtime</p>
          <div className="mt-3 grid gap-2 text-[12px] text-slate-600 dark:text-slate-300 sm:grid-cols-2">
            <p><span className="font-bold text-slate-800 dark:text-slate-100">Provider:</span> {workingSnapshot.provider || 'Not set'}</p>
            <p><span className="font-bold text-slate-800 dark:text-slate-100">Model:</span> {workingSnapshot.modelName || workingSnapshot.modelId || 'Not set'}</p>
            <p><span className="font-bold text-slate-800 dark:text-slate-100">Active tab:</span> {titleFromId(workingSnapshot.activeTab)}</p>
            <p><span className="font-bold text-slate-800 dark:text-slate-100">Pending edits:</span> {dirtySections.size}</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <FocusTrap focusTrapOptions={{ clickOutsideDeactivates: false }}>
      <div className="fixed inset-0 z-[70] overflow-hidden bg-slate-950/35 backdrop-blur-[2px]">
        <section className="absolute inset-x-3 top-3 bottom-3 ml-auto w-[min(1120px,calc(100vw-1.5rem))] rounded-2xl border border-slate-200/70 bg-white shadow-2xl flex flex-col overflow-hidden animate-spring-in dark:border-slate-700/70 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Developer Mode</p>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Workspace IDE</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadSnapshot(snapshot, 'Reloaded current workspace code.')}
                className="tactile px-3 py-2 rounded-lg text-[11px] font-semibold text-slate-600 bg-white border border-slate-200/70 hover:bg-slate-50 transition-colors dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Reload
              </button>
              <button
                onClick={onClose}
                className="tactile p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close developer mode"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="flex gap-2 overflow-x-auto">
              {SECTIONS.map((section) => {
                const isActive = section.id === activeSection;
                const isDirty = dirtySections.has(section.id);
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`min-w-[150px] rounded-xl border px-3 py-2 text-left transition-all ${
                      isActive
                        ? 'border-indigo-200 bg-white shadow-sm dark:border-indigo-500/50 dark:bg-slate-800'
                        : 'border-transparent bg-transparent hover:bg-white/70 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className={`text-[11px] font-bold ${isActive ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300'}`}>
                        {section.label}
                      </span>
                      {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-slate-400 dark:text-slate-500">{section.note}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_290px]">
            <div className="flex min-h-0 flex-col border-r border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2 dark:border-slate-800">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-bold text-slate-700 dark:text-slate-200">
                    {SECTIONS.find(s => s.id === activeSection)?.label}
                    {dirtySections.has(activeSection) && <span className="ml-2 text-[10px] font-semibold text-amber-500">Unsaved</span>}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">{stats.join(' · ')}</p>
                </div>
                <div className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                  activeValidation.ok
                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
                    : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'
                }`}>
                  {activeValidation.ok ? 'Valid' : 'Needs fix'}
                </div>
              </div>

              {activeSection === 'themeLayout' && renderThemeLayout()}
              {activeSection === 'templates' && renderTemplates()}
              {activeSection === 'diagnostics' && renderDiagnostics()}
              {isEditorSection && (
                <textarea
                  ref={textareaRef}
                  value={activeDraft}
                  spellCheck={false}
                  onChange={(e) => markDirty(activeSection, e.target.value)}
                  className="developer-code-editor min-h-[360px] flex-1 resize-none px-4 py-3 font-mono text-[12px] leading-5 outline-none selection:bg-indigo-500/40"
                />
              )}
            </div>

            <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto bg-white px-4 py-4 dark:bg-slate-950">
              {isEditorSection && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Search</p>
                <div className="mt-2 flex gap-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700 outline-none focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    placeholder="Find in section"
                  />
                  <button
                    onClick={handleFindNext}
                    className="tactile rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Find
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-slate-400">{query.trim() ? `${matchCount} matches` : 'Search the active editor'}</p>
              </div>
              )}

              <div className="rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Validation</p>
                <p className={`mt-2 text-[11px] leading-5 ${activeValidation.ok ? 'text-slate-600 dark:text-slate-300' : 'text-red-600 dark:text-red-300'}`}>
                  {activeValidation.message}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Changes</p>
                {changes.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {changes.map(change => (
                      <li key={change} className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                        <span>{change}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[11px] text-slate-400">No pending workspace changes.</p>
                )}
              </div>

              {onSaveTemplate && (
                <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/60 px-3 py-3 dark:border-indigo-500/40 dark:bg-indigo-500/10">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-300">Template</p>
                  <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                    Save this setup for future projects. Course content and generated outputs are not included.
                  </p>
                  <input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="mt-3 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[11px] text-slate-700 outline-none focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    placeholder="Template name"
                  />
                  <button
                    onClick={handleSaveTemplate}
                    disabled={!proposed}
                    className="tactile mt-2 w-full rounded-lg bg-indigo-500 px-3 py-2 text-[11px] font-semibold text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Save as Developer Template
                  </button>
                </div>
              )}

              <div className="rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Safety</p>
                <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  Saves validate JSON shape first. A failed save keeps your current workspace unchanged.
                </p>
                <button
                  onClick={handleRollback}
                  disabled={!lastAppliedSnapshot}
                  className="tactile mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Rollback Last Save
                </button>
              </div>
            </aside>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className={`min-w-0 truncate text-[11px] ${
              status.type === 'error' ? 'text-red-600 dark:text-red-300' : status.type === 'success' ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'
            }`}>
              {status.message}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={handleResetSection}
                disabled={!isEditorSection || !dirtySections.has(activeSection)}
                className="tactile px-3 py-2 rounded-lg text-[11px] font-semibold text-slate-600 bg-white border border-slate-200/70 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Reset Section
              </button>
              <button
                onClick={handleFormat}
                disabled={!isEditorSection}
                className="tactile px-3 py-2 rounded-lg text-[11px] font-semibold text-slate-600 bg-white border border-slate-200/70 hover:bg-slate-50 transition-colors dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Format
              </button>
              <button
                onClick={handleApply}
                disabled={!dirty || !proposed}
                className="tactile px-4 py-2 rounded-lg text-[11px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Apply & Save
              </button>
            </div>
          </div>
        </section>
      </div>
    </FocusTrap>
  );
}
