export function getWorkspaceSavePresentation({ cloudStatus, localStatus, user, workflowRunning } = {}) {
  const localDeferred = localStatus === 'error' && workflowRunning;
  const failed = cloudStatus === 'error' || (localStatus === 'error' && !localDeferred);
  const saving = cloudStatus === 'saving' || localStatus === 'saving';
  return {
    failed,
    quiet: !failed && !saving,
    text:
      cloudStatus === 'saving'
        ? 'Saving'
        : cloudStatus === 'error'
          ? 'Cloud save failed'
          : localStatus === 'saving'
            ? 'Saving'
            : localStatus === 'error'
              ? localDeferred
                ? 'Saving locally…'
                : 'Local save failed'
              : user
                ? 'Autosaved to My Projects'
                : 'Autosaved locally',
    tone: failed ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-600',
    textTone: failed ? 'text-red-600' : saving ? 'text-slate-500' : user ? 'text-emerald-600' : 'text-slate-500',
  };
}
