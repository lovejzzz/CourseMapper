import React, { useRef } from 'react';
import { formatDeveloperDiffItem } from '../../lib/developerIdeDiagnostics.js';
import { diffDeveloperTemplatePatch, TEMPLATE_STAGE_MODES } from '../../lib/developerTemplatePatches.js';
import { parseDeveloperTemplateBundle, stringifyDeveloperTemplateBundle } from '../../lib/developerTemplateExchange.js';
import { getDeveloperSecretFindings } from '../../lib/developerSecretDiagnostics.js';

function formatDate(timestamp) {
  if (!timestamp) return 'Never';
  try {
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Unknown';
  }
}

export default function DeveloperTemplatesPanel({
  templateName,
  onTemplateNameChange,
  onCreateTemplate,
  canCreateTemplate,
  developerTemplates,
  activeDeveloperTemplateId,
  currentConfig,
  onStageTemplate,
  onRenameTemplate,
  onDuplicateTemplate,
  onDeleteTemplate,
  onImportTemplate,
  onStatus,
}) {
  const importRef = useRef(null);

  function getTemplateDiff(template, mode = 'all', limit = 6) {
    if (!template?.data) return [];
    return diffDeveloperTemplatePatch(currentConfig, template.data, mode, limit);
  }

  function handleExportTemplates() {
    if (developerTemplates.length === 0) {
      onStatus?.('idle', 'No developer templates to export.');
      return;
    }
    try {
      const json = stringifyDeveloperTemplateBundle(developerTemplates);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `coursemapper-developer-templates-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      onStatus?.(
        'success',
        `Exported ${developerTemplates.length} developer template${developerTemplates.length === 1 ? '' : 's'}.`,
      );
    } catch (err) {
      onStatus?.('error', err.message || 'Template export failed.');
    }
  }

  function handleImportTemplates(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onImportTemplate) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { templates, warnings } = parseDeveloperTemplateBundle(String(reader.result || ''));
        templates.forEach((template) => onImportTemplate(template.data, template.name));
        const warningText = warnings.length > 0 ? ` ${warnings[0]}` : '';
        onStatus?.(
          'success',
          `Imported ${templates.length} developer template${templates.length === 1 ? '' : 's'}.${warningText}`,
        );
      } catch (err) {
        onStatus?.('error', err.message || 'Template import failed.');
      }
    };
    reader.onerror = () => {
      onStatus?.('error', 'Template import file could not be read.');
    };
    reader.readAsText(file);
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <section className="rounded-xl border border-indigo-200/70 bg-indigo-50/60 p-4 dark:border-indigo-500/40 dark:bg-indigo-500/10">
        <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-300">
          Save Current Setup
        </p>
        <h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">
          Create a reusable developer template
        </h3>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={templateName}
            onChange={(e) => onTemplateNameChange(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[12px] text-slate-700 outline-none focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            placeholder="Template name"
          />
          <button
            onClick={onCreateTemplate}
            disabled={!canCreateTemplate}
            className="tactile rounded-lg bg-indigo-500 px-4 py-2 text-[12px] font-semibold text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save Template
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Template Manager</p>
            <h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">
              {developerTemplates.length} saved templates
            </h3>
          </div>
          <div className="flex shrink-0 gap-2">
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportTemplates}
              className="hidden"
            />
            <button
              onClick={() => importRef.current?.click()}
              disabled={!onImportTemplate}
              className="tactile rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Import JSON
            </button>
            <button
              onClick={handleExportTemplates}
              disabled={developerTemplates.length === 0}
              className="tactile rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Export All
            </button>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {developerTemplates.length > 0 ? (
            developerTemplates.map((template) => {
              const templateDiff = getTemplateDiff(template, 'all', 4);
              const secretFindings = getDeveloperSecretFindings(template.data || {});
              const modeDiffCounts = TEMPLATE_STAGE_MODES.reduce((acc, mode) => {
                acc[mode.id] = getTemplateDiff(template, mode.id, 20).length;
                return acc;
              }, {});

              return (
                <div
                  key={template.id}
                  className={`rounded-xl border p-3 ${template.id === activeDeveloperTemplateId ? 'border-indigo-300 bg-indigo-50/60 dark:border-indigo-500/50 dark:bg-indigo-500/10' : 'border-slate-200/70 bg-slate-50 dark:border-slate-700 dark:bg-slate-950'}`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      defaultValue={template.name}
                      onBlur={(e) => {
                        if (e.target.value.trim() !== template.name) onRenameTemplate(template, e.target.value);
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      aria-label={`Rename ${template.name}`}
                    />
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => onDuplicateTemplate(template)}
                        className="tactile rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      >
                        Duplicate
                      </button>
                      <button
                        onClick={() => onDeleteTemplate(template)}
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
                  {secretFindings.length > 0 && (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                      Secret-like data found at {secretFindings[0].path}. Delete or replace this template before
                      staging/exporting.
                    </div>
                  )}

                  <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Preview</p>
                      <span className="text-[10px] font-semibold text-slate-400">{templateDiff.length} changes</span>
                    </div>
                    {templateDiff.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {templateDiff.map((change) => (
                          <li
                            key={`${template.id}-${change.type}-${change.path}`}
                            className="truncate text-[10px] text-slate-500 dark:text-slate-400"
                          >
                            {formatDeveloperDiffItem(change)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-[10px] text-slate-400">This template matches the current config.</p>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {TEMPLATE_STAGE_MODES.map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => onStageTemplate(template, mode.id)}
                        disabled={modeDiffCounts[mode.id] === 0 || secretFindings.length > 0}
                        className={`tactile rounded-lg px-2 py-2 text-[10px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                          mode.id === 'all'
                            ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                            : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="block">{mode.label}</span>
                        <span className={mode.id === 'all' ? 'text-indigo-100' : 'text-slate-400'}>
                          {modeDiffCounts[mode.id]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-[12px] text-slate-400 dark:border-slate-700">
              No developer templates yet. Save the current setup to make it available when creating future projects.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
