import React from 'react';
import { getDeliverablePrompt } from '../../lib/deliverablePrompts.js';
import { isPlainObject } from '../../lib/developerIdeDiagnostics.js';
import {
  analyzeDeveloperPrompt,
  COURSE_MAP_PLACEHOLDER,
  summarizePromptDiff,
} from '../../lib/developerPromptWorkbench.js';

function fieldSummary(value) {
  if (!value?.trim()) return 'Using default';
  return `${value.trim().split(/\s+/).length} words`;
}

function formatTokenCount(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value || 0);
}

function formatTokenDelta(value) {
  if (!value) return '0';
  return value > 0 ? `+${formatTokenCount(value)}` : formatTokenCount(value);
}

export default function DeveloperPromptsPanel({
  promptFeatureOptions = [],
  selectedFeatureId = '',
  currentConfig = {},
  workingSnapshot = {},
  onSelectedFeatureChange,
  onUpdateConfigPatch,
}) {
  const activeFeatureId = selectedFeatureId || promptFeatureOptions[0]?.id || '';

  function getPromptConfig(featureId) {
    const deliverableConfig = currentConfig.deliverableConfig;
    const featureConfig = deliverableConfig?.[featureId];
    return isPlainObject(featureConfig) ? featureConfig : {};
  }

  function getPromptPreview(featureId, promptConfig) {
    if (!featureId) return { systemPrompt: '', userPrompt: '' };
    try {
      return getDeliverablePrompt(
        featureId,
        workingSnapshot.courseMap || { lessons: [] },
        currentConfig.lessonScope || workingSnapshot.lessonScope || null,
        promptConfig || {},
        'lecture',
        null,
        null,
        currentConfig.columns || workingSnapshot.columns || null,
        currentConfig.deliverableConfig || workingSnapshot.deliverableConfig || null,
      ) || { systemPrompt: '', userPrompt: '' };
    } catch {
      return { systemPrompt: '', userPrompt: '' };
    }
  }

  function updatePromptConfig(featureId, patch, message) {
    if (!featureId) return;
    const deliverableConfig = isPlainObject(currentConfig.deliverableConfig) ? { ...currentConfig.deliverableConfig } : {};
    const current = isPlainObject(deliverableConfig[featureId]) ? { ...deliverableConfig[featureId] } : {};
    Object.entries(patch).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim() === '') delete current[key];
      else current[key] = value;
    });
    if (Object.keys(current).length === 0) delete deliverableConfig[featureId];
    else deliverableConfig[featureId] = current;
    onUpdateConfigPatch?.({ deliverableConfig }, message);
  }

  function materializePromptOverride(featureId, key, value) {
    if (!featureId || !value?.trim()) return;
    updatePromptConfig(featureId, { [key]: value }, 'Built-in prompt copied into an editable override.');
  }

  function resetPromptOverrides(featureId) {
    if (!featureId) return;
    const label = promptFeatureOptions.find(option => option.id === featureId)?.label || featureId;
    const confirmed = window.confirm(`Clear prompt overrides for ${label}? The built-in prompt will be used again.`);
    if (!confirmed) return;
    const deliverableConfig = isPlainObject(currentConfig.deliverableConfig) ? { ...currentConfig.deliverableConfig } : {};
    const current = isPlainObject(deliverableConfig[featureId]) ? { ...deliverableConfig[featureId] } : {};
    delete current.customSystemPrompt;
    delete current.customUserPrompt;
    delete current.extraInstructions;
    if (Object.keys(current).length === 0) delete deliverableConfig[featureId];
    else deliverableConfig[featureId] = current;
    onUpdateConfigPatch?.({ deliverableConfig }, 'Prompt overrides cleared.');
  }

  function insertCourseMapPlaceholder(featureId) {
    if (!featureId) return;
    const current = getPromptConfig(featureId).customUserPrompt || '';
    const separator = current.trim() ? '\n\n' : '';
    updatePromptConfig(
      featureId,
      { customUserPrompt: `${current.trimEnd()}${separator}${COURSE_MAP_PLACEHOLDER}` },
      'Course map placeholder inserted.',
    );
  }

  const promptConfig = activeFeatureId ? getPromptConfig(activeFeatureId) : {};
  const builtInPromptConfig = { ...promptConfig };
  delete builtInPromptConfig.customSystemPrompt;
  delete builtInPromptConfig.customUserPrompt;
  delete builtInPromptConfig.extraInstructions;
  const builtInPromptPreview = activeFeatureId ? getPromptPreview(activeFeatureId, builtInPromptConfig) : {};
  const promptPreview = activeFeatureId ? getPromptPreview(activeFeatureId, promptConfig) : {};
  const hasSystemOverride = Boolean(promptConfig.customSystemPrompt?.trim());
  const hasUserOverride = Boolean(promptConfig.customUserPrompt?.trim());
  const hasPromptOverride = Boolean(
    hasSystemOverride
    || hasUserOverride
    || promptConfig.extraInstructions?.trim()
  );
  const systemPromptValue = hasSystemOverride ? promptConfig.customSystemPrompt : (promptPreview.systemPrompt || '');
  const userPromptValue = hasUserOverride ? promptConfig.customUserPrompt : (promptPreview.userPrompt || '');
  const promptAnalysis = analyzeDeveloperPrompt({
    systemPrompt: systemPromptValue,
    userPrompt: userPromptValue,
    extraInstructions: promptConfig.extraInstructions || '',
    effectiveSystemPrompt: promptPreview.systemPrompt || '',
    effectiveUserPrompt: promptPreview.userPrompt || '',
    hasSystemOverride,
    hasUserOverride,
  });
  const systemPromptDiff = summarizePromptDiff(builtInPromptPreview.systemPrompt || '', promptPreview.systemPrompt || '');
  const userPromptDiff = summarizePromptDiff(builtInPromptPreview.userPrompt || '', promptPreview.userPrompt || '');

  return (
    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4">
      <section className="rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Deliverable Prompt</p>
            <h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">Override model instructions per deliverable</h3>
            <p className="mt-2 max-w-2xl text-[11px] leading-5 text-slate-500 dark:text-slate-400">
              These fields write to Config / deliverableConfig. Empty fields use the built-in prompt. User prompt templates should include {COURSE_MAP_PLACEHOLDER} so the model receives the course content.
            </p>
          </div>
          <select
            value={activeFeatureId}
            onChange={(e) => onSelectedFeatureChange?.(e.target.value)}
            disabled={promptFeatureOptions.length === 0}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-indigo-300 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 lg:w-64"
          >
            {promptFeatureOptions.length > 0 ? promptFeatureOptions.map(option => (
              <option key={option.id} value={option.id}>{option.label}</option>
            )) : (
              <option value="">Choose deliverables first</option>
            )}
          </select>
        </div>
      </section>

      {activeFeatureId ? (
        <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(220px,260px)]">
          <section className="min-w-0 space-y-4">
            <div className="rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">System Prompt Override</p>
                  <h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">
                    {hasSystemOverride ? `Override active - ${fieldSummary(promptConfig.customSystemPrompt)}` : `Built-in prompt - ${fieldSummary(systemPromptValue)}`}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {!hasSystemOverride && (
                    <button
                      onClick={() => materializePromptOverride(activeFeatureId, 'customSystemPrompt', systemPromptValue)}
                      disabled={!systemPromptValue}
                      className="tactile rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[10px] font-bold text-indigo-600 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-300"
                    >
                      Customize
                    </button>
                  )}
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    {hasSystemOverride ? 'customSystemPrompt' : 'built-in'}
                  </span>
                </div>
              </div>
              <textarea
                value={systemPromptValue}
                readOnly={!hasSystemOverride}
                onChange={(e) => updatePromptConfig(activeFeatureId, { customSystemPrompt: e.target.value }, 'System prompt override updated.')}
                placeholder="No system prompt is available for this deliverable."
                spellCheck={false}
                className={`mt-3 min-h-[140px] w-full resize-y rounded-lg border border-slate-200 px-3 py-2 font-mono text-[12px] leading-5 text-slate-700 outline-none focus:border-indigo-300 dark:border-slate-700 dark:text-slate-200 ${
                  hasSystemOverride ? 'bg-slate-50 dark:bg-slate-950' : 'bg-slate-50/70 text-slate-500 dark:bg-slate-950/70 dark:text-slate-400'
                }`}
              />
            </div>

            <div className="rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">User Prompt Template Override</p>
                  <h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">
                    {hasUserOverride ? `Override active - ${fieldSummary(promptConfig.customUserPrompt)}` : `Current generated prompt - ${fieldSummary(userPromptValue)}`}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {!hasUserOverride && (
                    <button
                      onClick={() => materializePromptOverride(activeFeatureId, 'customUserPrompt', userPromptValue)}
                      disabled={!userPromptValue}
                      className="tactile rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[10px] font-bold text-indigo-600 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-300"
                    >
                      Customize
                    </button>
                  )}
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                    hasUserOverride && !promptConfig.customUserPrompt.includes(COURSE_MAP_PLACEHOLDER)
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
                  }`}>
                    {hasUserOverride ? COURSE_MAP_PLACEHOLDER : 'generated'}
                  </span>
                </div>
              </div>
              <textarea
                value={userPromptValue}
                readOnly={!hasUserOverride}
                onChange={(e) => updatePromptConfig(activeFeatureId, { customUserPrompt: e.target.value }, 'User prompt template updated.')}
                placeholder="No user prompt is available for this deliverable."
                spellCheck={false}
                className={`mt-3 min-h-[220px] w-full resize-y rounded-lg border border-slate-200 px-3 py-2 font-mono text-[12px] leading-5 text-slate-700 outline-none focus:border-indigo-300 dark:border-slate-700 dark:text-slate-200 ${
                  hasUserOverride ? 'bg-slate-50 dark:bg-slate-950' : 'bg-slate-50/70 text-slate-500 dark:bg-slate-950/70 dark:text-slate-400'
                }`}
              />
              {!hasUserOverride && (
                <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                  This preview shows the exact prompt for the current project, including course content. Click Customize to make it editable.
                </p>
              )}
              {hasUserOverride && !promptConfig.customUserPrompt.includes(COURSE_MAP_PLACEHOLDER) && (
                <div className="mt-2 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 sm:flex-row sm:items-center sm:justify-between">
                  <span>Add {COURSE_MAP_PLACEHOLDER} so the generated prompt receives course content.</span>
                  <button
                    onClick={() => insertCourseMapPlaceholder(activeFeatureId)}
                    className="tactile rounded-md border border-amber-300 bg-white px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-slate-950 dark:text-amber-300"
                  >
                    Insert
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Extra Instructions</p>
                  <h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{fieldSummary(promptConfig.extraInstructions)}</h3>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                  extraInstructions
                </span>
              </div>
              <textarea
                value={promptConfig.extraInstructions || ''}
                onChange={(e) => updatePromptConfig(activeFeatureId, { extraInstructions: e.target.value }, 'Extra instructions updated.')}
                placeholder="Optional. Add high-priority instructions without replacing the built-in prompt."
                className="mt-3 min-h-[120px] w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] leading-5 text-slate-700 outline-none focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
            </div>
          </section>

          <aside className="min-w-0 space-y-3">
            <div className="min-w-0 rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Prompt Health</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-[10px] font-semibold text-slate-400">Template</p>
                  <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-200">{formatTokenCount(promptAnalysis.stats.templateTokens)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-[10px] font-semibold text-slate-400">Sent</p>
                  <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-200">{formatTokenCount(promptAnalysis.stats.effectiveTokens)}</p>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-slate-400">Estimated tokens before model output.</p>
              {promptAnalysis.findings.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {promptAnalysis.findings.map((finding, index) => (
                    <li key={`${finding.message}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-950">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={`text-[10px] font-bold uppercase tracking-wide ${
                            finding.level === 'warning'
                              ? 'text-amber-500 dark:text-amber-300'
                              : 'text-indigo-500 dark:text-indigo-300'
                          }`}>
                            {finding.level}
                          </p>
                          <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{finding.message}</p>
                        </div>
                        {finding.actionId === 'insertCourseMap' && (
                          <button
                            onClick={() => insertCourseMapPlaceholder(activeFeatureId)}
                            className="tactile shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            Insert
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                  Prompt checks pass for this deliverable.
                </p>
              )}
            </div>

            <div className="min-w-0 rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Built-in Diff</p>
              <div className="mt-3 space-y-2 text-[11px] text-slate-500 dark:text-slate-400">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-950">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-700 dark:text-slate-200">System</span>
                    <span className={systemPromptDiff.changed ? 'text-amber-500' : 'text-emerald-500'}>
                      {systemPromptDiff.changed ? 'changed' : 'default'}
                    </span>
                  </div>
                  <p className="mt-1">Tokens {formatTokenDelta(systemPromptDiff.tokenDelta)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-950">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-700 dark:text-slate-200">User</span>
                    <span className={userPromptDiff.changed ? 'text-amber-500' : 'text-emerald-500'}>
                      {userPromptDiff.changed ? 'changed' : 'default'}
                    </span>
                  </div>
                  <p className="mt-1">Tokens {formatTokenDelta(userPromptDiff.tokenDelta)}</p>
                </div>
              </div>
            </div>

            <div className="min-w-0 rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Placeholders</p>
              {promptAnalysis.placeholders.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {promptAnalysis.placeholders.map(placeholder => (
                    <span
                      key={`${placeholder.raw}-${placeholder.name}`}
                      className={`rounded-full px-2 py-1 font-mono text-[10px] font-bold ${
                        placeholder.exact
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                          : placeholder.supported
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                            : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
                      }`}
                    >
                      {placeholder.raw}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  No template placeholders found in the editable prompt fields.
                </p>
              )}
            </div>

            <div className="min-w-0 rounded-xl border border-indigo-200/70 bg-indigo-50/60 p-4 dark:border-indigo-500/40 dark:bg-indigo-500/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-300">Current Path</p>
              <p className="mt-2 space-y-1 font-mono text-[11px] leading-5 text-slate-600 dark:text-slate-300">
                <span className="block break-all">deliverableConfig.{activeFeatureId}.customSystemPrompt</span>
                <span className="block break-all">deliverableConfig.{activeFeatureId}.customUserPrompt</span>
                <span className="block break-all">deliverableConfig.{activeFeatureId}.extraInstructions</span>
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Behavior</p>
              <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                Built-in prompts are read-only previews. Customize creates an override for this deliverable. Extra instructions are appended at high priority.
              </p>
              <button
                onClick={() => resetPromptOverrides(activeFeatureId)}
                disabled={!hasPromptOverride}
                className="tactile mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Clear Overrides
              </button>
            </div>
          </aside>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-[12px] text-slate-400 dark:border-slate-700">
          No promptable deliverables yet. Choose deliverables first, or add prompt fields directly in Config JSON.
        </p>
      )}
    </div>
  );
}
