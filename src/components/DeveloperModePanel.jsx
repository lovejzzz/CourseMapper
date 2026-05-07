import React, { useEffect, useMemo, useRef, useState } from 'react';
import DeveloperCodeEditor from './developer/DeveloperCodeEditor.jsx';
import DeveloperDiagnosticsPanel from './developer/DeveloperDiagnosticsPanel.jsx';
import DeveloperModeShell from './developer/DeveloperModeShell.jsx';
import DeveloperModeSidebar from './developer/DeveloperModeSidebar.jsx';
import DeveloperPromptsPanel from './developer/DeveloperPromptsPanel.jsx';
import DeveloperTemplatesPanel from './developer/DeveloperTemplatesPanel.jsx';
import DeveloperThemeLayoutPanel from './developer/DeveloperThemeLayoutPanel.jsx';
import {
  getDeveloperSectionFindings,
} from '../lib/developerIdeDiagnostics.js';
import {
  buildProposedSnapshot,
  clone,
  createDrafts,
  EDITOR_SECTION_IDS,
  extractSection,
  parseDraft,
  pretty,
  SECTIONS,
  summarizeDiff,
  validateSnapshot,
} from '../lib/developerSnapshotDrafts.js';
import {
  appendDeveloperHistoryEntry,
  buildDeveloperHistoryEntry,
  canRestoreDeveloperHistorySnapshot,
  clearDeveloperHistory,
  loadDeveloperHistory,
  restoreDeveloperHistorySnapshot,
} from '../lib/developerIdeHistory.js';
import {
  buildDeveloperTemplatePatch,
  diffDeveloperTemplatePatch,
  TEMPLATE_STAGE_MODES,
} from '../lib/developerTemplatePatches.js';
import {
  countDeveloperSearchMatches,
  getDeveloperSectionStats,
  getPromptFeatureOptions,
} from '../lib/developerModeSelectors.js';
import { findJsonPathLocation } from '../lib/developerJsonPath.js';

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
  const [developerHistory, setDeveloperHistory] = useState(() => loadDeveloperHistory());
  const [templateName, setTemplateName] = useState('');
  const [promptFeatureId, setPromptFeatureId] = useState('');
  const [pendingPathSelection, setPendingPathSelection] = useState(null);
  const [status, setStatus] = useState({
    type: 'idle',
    message: 'Edit a section, then apply to update the workspace preview.',
  });
  const editorRef = useRef(null);
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
      setDeveloperHistory(loadDeveloperHistory());
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
      return { ok: true, message: 'Tool controls update validated workspace settings.', findings: [] };
    }
    try {
      const parsed = JSON.parse(activeDraft);
      const findings = getDeveloperSectionFindings(activeSection, parsed);
      const errors = findings.filter(finding => finding.level === 'error');
      const warnings = findings.filter(finding => finding.level === 'warning');
      if (errors.length > 0) {
        return { ok: false, message: `${errors[0].path}: ${errors[0].message}`, findings };
      }
      if (warnings.length > 0) {
        return { ok: true, message: `${warnings.length} schema warning${warnings.length === 1 ? '' : 's'} found.`, findings };
      }
      return { ok: true, message: 'Current section is valid.', findings };
    } catch (err) {
      return { ok: false, message: `JSON syntax error: ${err.message}`, findings: [] };
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
  const stats = getDeveloperSectionStats(workingSnapshot, activeSection);
  const matchCount = isEditorSection ? countDeveloperSearchMatches(activeDraft, query) : 0;
  const promptFeatureOptions = useMemo(() => getPromptFeatureOptions(workingSnapshot), [workingSnapshot]);

  function sectionForPath(path) {
    if (path?.startsWith('courseMap')) return 'courseMap';
    if (path?.startsWith('deliverables')) return 'deliverables';
    return 'config';
  }

  function selectPathInEditor(path, sectionId = activeSection) {
    const targetSection = EDITOR_SECTION_IDS.has(sectionId) ? sectionId : sectionForPath(path);
    if (targetSection !== activeSection) {
      setPendingPathSelection({ path, sectionId: targetSection });
      setActiveSection(targetSection);
      return;
    }

    const draft = drafts[targetSection] || '';
    try {
      const location = findJsonPathLocation(draft, path, targetSection);
      editorRef.current?.selectRange(location.index, location.endIndex);
      setStatus({ type: 'idle', message: `Selected ${path} at line ${location.line}.` });
    } catch (err) {
      setStatus({ type: 'error', message: `Could not locate ${path}: ${err.message}` });
    }
  }

  useEffect(() => {
    if (!isOpen || activeSection !== 'prompts') return;
    if (promptFeatureOptions.length === 0) {
      if (promptFeatureId) setPromptFeatureId('');
      return;
    }
    if (!promptFeatureOptions.some(option => option.id === promptFeatureId)) {
      setPromptFeatureId(promptFeatureOptions[0].id);
    }
  }, [activeSection, isOpen, promptFeatureId, promptFeatureOptions]);

  useEffect(() => {
    if (!pendingPathSelection || activeSection !== pendingPathSelection.sectionId) return;
    const selection = pendingPathSelection;
    setPendingPathSelection(null);
    requestAnimationFrame(() => selectPathInEditor(selection.path, selection.sectionId));
  }, [activeSection, drafts, pendingPathSelection]); // eslint-disable-line react-hooks/exhaustive-deps

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
    resetSection(activeSection);
  }

  function resetSection(sectionId) {
    if (!EDITOR_SECTION_IDS.has(sectionId)) return;
    setDrafts(prev => ({ ...prev, [sectionId]: pretty(extractSection(baseSnapshot, sectionId)) }));
    setDirtySections((prev) => {
      const next = new Set(prev);
      next.delete(sectionId);
      return next;
    });
    setStatus({ type: 'idle', message: `${SECTIONS.find(s => s.id === sectionId)?.label || 'Section'} reset to the last loaded workspace state.` });
  }

  function handleFindNext() {
    if (!query.trim() || !editorRef.current) return;
    const haystack = activeDraft.toLowerCase();
    const needle = query.toLowerCase();
    const from = editorRef.current.getSelectionEnd?.() || 0;
    let index = haystack.indexOf(needle, from);
    if (index === -1) index = haystack.indexOf(needle, 0);
    if (index === -1) return;
    editorRef.current.selectRange?.(index, index + needle.length);
  }

  function handleApply() {
    handleApplySections(Array.from(dirtySections));
  }

  function handleApplySections(sectionIds) {
    try {
      const sectionSet = new Set(sectionIds.filter(sectionId => dirtySections.has(sectionId)));
      if (sectionSet.size === 0) {
        setStatus({ type: 'idle', message: 'No staged developer edits to apply.' });
        return;
      }
      if (dirtySections.has('raw') && !sectionSet.has('raw')) {
        setStatus({ type: 'error', message: 'Apply or reset Raw JSON before applying individual sections.' });
        return;
      }

      const next = buildProposedSnapshot(baseSnapshot, drafts, sectionSet);
      const historyEntry = buildDeveloperHistoryEntry({
        beforeSnapshot: baseSnapshot,
        afterSnapshot: next,
        dirtySections: sectionSet,
      });
      setDeveloperHistory(appendDeveloperHistoryEntry(historyEntry));
      onApply(next);
      if (sectionSet.has('raw') || sectionSet.size === dirtySections.size) {
        loadSnapshot(next, 'Saved. Workspace preview updated.');
        setStatus({ type: 'success', message: 'Saved. Workspace preview updated.' });
        return;
      }

      setBaseSnapshot(next);
      setDrafts((prev) => {
        const freshDrafts = createDrafts(next);
        dirtySections.forEach((sectionId) => {
          if (!sectionSet.has(sectionId)) freshDrafts[sectionId] = prev[sectionId];
        });
        return freshDrafts;
      });
      setDirtySections((prev) => {
        const remaining = new Set(prev);
        sectionSet.forEach(sectionId => remaining.delete(sectionId));
        return remaining;
      });
      const label = Array.from(sectionSet)
        .map(sectionId => SECTIONS.find(section => section.id === sectionId)?.label || sectionId)
        .join(', ');
      setStatus({ type: 'success', message: `Saved ${label}. Other staged edits remain pending.` });
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'This code cannot run in the workspace.' });
    }
  }

  function handleRollback() {
    const latest = developerHistory[0];
    if (!latest) return;
    restoreHistorySnapshot(latest, 'beforeSnapshot', 'Rolled back to the previous developer save.');
  }

  function restoreHistorySnapshot(entry, snapshotKey, successMessage) {
    if (dirtySections.size > 0) {
      const confirmed = window.confirm('Restoring history will discard pending developer edits. Continue?');
      if (!confirmed) return;
    }
    try {
      const target = restoreDeveloperHistorySnapshot(entry, snapshotKey, workingSnapshot);
      validateSnapshot(target);
      onApply(target);
      loadSnapshot(target, successMessage);
      setStatus({ type: 'success', message: successMessage });
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'History restore failed.' });
    }
  }

  function handleClearHistory() {
    if (developerHistory.length === 0) return;
    const confirmed = window.confirm('Clear developer save history on this device?');
    if (!confirmed) return;
    setDeveloperHistory(clearDeveloperHistory());
    setStatus({ type: 'success', message: 'Developer save history cleared.' });
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

  function handleStageTemplate(template, mode = 'all') {
    if (!template?.data) return;
    const patch = buildDeveloperTemplatePatch(template.data, mode, getConfigDraft());
    const changeCount = diffDeveloperTemplatePatch(getConfigDraft(), template.data, mode, 20).length;
    if (Object.keys(patch).length === 0 || changeCount === 0) {
      setStatus({ type: 'idle', message: `"${template.name}" has no ${mode === 'all' ? '' : `${mode} `}changes to stage.` });
      return;
    }
    const modeLabel = TEMPLATE_STAGE_MODES.find(item => item.id === mode)?.label || 'Template';
    updateConfigPatch(patch, `Staged ${modeLabel.toLowerCase()} from "${template.name}". Review the config, then apply to update the workspace.`);
  }

  function handleDeleteTemplate(template) {
    if (!onDeleteTemplate) return;
    const confirmed = window.confirm(`Delete "${template.name}"? This removes it from future project setup.`);
    if (!confirmed) return;
    onDeleteTemplate(template.id);
    setStatus({ type: 'success', message: `Deleted "${template.name}".` });
  }

  function handleDiagnosticFix(issue) {
    const config = getConfigDraft();
    const features = Array.isArray(config.selectedFeatures)
      ? [...config.selectedFeatures]
      : (Array.isArray(workingSnapshot.selectedFeatures) ? [...workingSnapshot.selectedFeatures] : []);

    if (issue.actionId === 'addCourseMapFeature') {
      updateConfigPatch({
        selectedFeatures: ['courseMap', ...features.filter(feature => feature !== 'courseMap')],
      }, 'Course Map added to selected features.');
    }

    if (issue.actionId === 'addActiveTabFeature' && workingSnapshot.activeTab) {
      updateConfigPatch({
        selectedFeatures: [...features.filter(Boolean), workingSnapshot.activeTab]
          .filter((feature, index, list) => list.indexOf(feature) === index),
      }, 'Active tab added to selected features.');
    }

    if (issue.actionId === 'enableAllColumns') {
      const columns = Array.isArray(config.columns)
        ? config.columns
        : (Array.isArray(workingSnapshot.columns) ? workingSnapshot.columns : []);
      updateConfigPatch({
        columns: columns.map(column => ({ ...column, enabled: true })),
      }, 'All course map columns enabled.');
    }
  }

  function renderThemeLayout() {
    return (
      <DeveloperThemeLayoutPanel
        currentConfig={getConfigDraft()}
        onUpdateConfigPatch={updateConfigPatch}
      />
    );
  }

  function renderPrompts() {
    return (
      <DeveloperPromptsPanel
        promptFeatureOptions={promptFeatureOptions}
        selectedFeatureId={promptFeatureId}
        currentConfig={getConfigDraft()}
        workingSnapshot={workingSnapshot}
        onSelectedFeatureChange={setPromptFeatureId}
        onUpdateConfigPatch={updateConfigPatch}
      />
    );
  }

  function renderTemplates() {
    return (
      <DeveloperTemplatesPanel
        templateName={templateName}
        onTemplateNameChange={setTemplateName}
        onCreateTemplate={handleSaveTemplate}
        canCreateTemplate={Boolean(onSaveTemplate && proposed)}
        developerTemplates={developerTemplates}
        activeDeveloperTemplateId={activeDeveloperTemplateId}
        currentConfig={getConfigDraft()}
        onStageTemplate={handleStageTemplate}
        onRenameTemplate={handleRenameTemplate}
        onDuplicateTemplate={handleDuplicateTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        onImportTemplate={onSaveTemplate}
        onStatus={(type, message) => setStatus({ type, message })}
      />
    );
  }

  function renderDiagnostics() {
    return (
      <DeveloperDiagnosticsPanel
        snapshot={workingSnapshot}
        dirtySections={dirtySections}
        onDiagnosticFix={handleDiagnosticFix}
        onDiagnosticPathClick={(path) => selectPathInEditor(path, sectionForPath(path))}
      />
    );
  }

  const mainContent = (
    <>
      {activeSection === 'themeLayout' && renderThemeLayout()}
      {activeSection === 'prompts' && renderPrompts()}
      {activeSection === 'templates' && renderTemplates()}
      {activeSection === 'diagnostics' && renderDiagnostics()}
      {isEditorSection && (
        <DeveloperCodeEditor
          ref={editorRef}
          value={activeDraft}
          onChange={(value) => markDirty(activeSection, value)}
          onApply={handleApply}
          onFormat={handleFormat}
          canApply={dirty && Boolean(proposed)}
          canFormat={isEditorSection}
          sectionId={activeSection}
          sectionLabel={SECTIONS.find(s => s.id === activeSection)?.label}
          diagnostics={activeValidation.findings}
        />
      )}
    </>
  );

  const sidebar = (
    <DeveloperModeSidebar
      isEditorSection={isEditorSection}
      query={query}
      onQueryChange={setQuery}
      onFindNext={handleFindNext}
      matchCount={matchCount}
      activeValidation={activeValidation}
      changes={changes}
      canShowTemplateSave={Boolean(onSaveTemplate)}
      templateName={templateName}
      onTemplateNameChange={setTemplateName}
      onSaveTemplate={handleSaveTemplate}
      canSaveTemplate={Boolean(proposed)}
      developerHistory={developerHistory}
      onRollback={handleRollback}
      onRestoreHistorySnapshot={restoreHistorySnapshot}
      canRestoreHistorySnapshot={(entry, snapshotKey) => canRestoreDeveloperHistorySnapshot(entry, snapshotKey, workingSnapshot)}
      onClearHistory={handleClearHistory}
      dirtySections={dirtySections}
      onApplySection={(sectionId) => handleApplySections([sectionId])}
      onResetSectionById={resetSection}
      onFindingClick={(finding) => selectPathInEditor(finding.path)}
    />
  );

  return (
    <DeveloperModeShell
      sections={SECTIONS}
      activeSection={activeSection}
      dirtySections={dirtySections}
      stats={stats}
      activeValidation={activeValidation}
      status={status}
      onSectionChange={setActiveSection}
      onReload={() => loadSnapshot(snapshot, 'Reloaded current workspace code.')}
      onClose={onClose}
      onResetSection={handleResetSection}
      canResetSection={isEditorSection && dirtySections.has(activeSection)}
      onFormat={handleFormat}
      canFormat={isEditorSection}
      onApply={handleApply}
      canApply={dirty && Boolean(proposed)}
      mainContent={mainContent}
      sidebar={sidebar}
    />
  );
}
