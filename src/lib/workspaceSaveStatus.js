function formatOriginCounts(counts = {}) {
  return Object.entries(counts || {})
    .filter(([, count]) => Number(count) > 0)
    .map(([origin, count]) => `${origin}: ${count}`)
    .join(', ');
}

function pluralizeCount(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function buildKnowledgeBackboneLabel(coverage, sourceLedgerSummary = null) {
  if (!coverage || Number(coverage.openResources || 0) <= 0) return null;
  const sessionCount = Number(coverage.sessions) || 0;
  const genomeLinkedLessons = Number(coverage.genomeLinkedLessons) || 0;
  const researchedLessons = Number(coverage.researchedLessons) || 0;
  const researchedResourceCount = Number(coverage.resourcesByOrigin?.['algi-research']) || 0;
  const openResources = Number(coverage.openResources) || 0;
  const sessionsWithResources = Number(coverage.sessionsWithResources) || 0;
  const displayedSessionsWithResources =
    sessionCount > 0 && sessionsWithResources > sessionCount ? sessionCount : Math.max(0, sessionsWithResources);
  // A recovered graph can carry researched Resource rows before its derived
  // coverage receipt has rebuilt `researchedLessons`. The explicit Algi
  // origin is authoritative in that transition; never call it genome-only.
  const displayedResearchedLessons =
    researchedLessons > 0
      ? researchedLessons
      : researchedResourceCount > 0
        ? Math.min(sessionCount, displayedSessionsWithResources)
        : 0;
  const trustedSourceRows = Number(sourceLedgerSummary?.trustedConceptLinkedCount) || 0;
  const originText = formatOriginCounts(coverage.resourcesByOrigin);
  const parts = [
    displayedResearchedLessons > 0
      ? `${displayedResearchedLessons}/${sessionCount} lessons source-researched`
      : `${genomeLinkedLessons}/${sessionCount} lessons genome-linked`,
  ];
  if (trustedSourceRows > 0) {
    parts.push(pluralizeCount(trustedSourceRows, 'trusted source-ledger row'));
    if (openResources !== trustedSourceRows) {
      parts.push(`${pluralizeCount(openResources, 'graph reading resource')}${originText ? ` (${originText})` : ''}`);
    }
  } else {
    parts.push(`${pluralizeCount(openResources, 'cited open resource')}${originText ? ` (${originText})` : ''}`);
  }
  parts.push(`${displayedSessionsWithResources}/${sessionCount} lessons with readings`);
  return parts.join(' · ');
}

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
