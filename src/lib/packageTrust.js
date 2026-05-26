function normalizeEvidenceEntry(entry) {
  if (typeof entry === 'string') return [entry.trim()].filter(Boolean);
  if (entry && typeof entry === 'object') {
    if (Array.isArray(entry.changes) && entry.changes.length > 0) {
      return entry.changes.map((change) => String(change || '').trim()).filter(Boolean);
    }
    if (typeof entry.message === 'string' && entry.message.trim()) return [entry.message.trim()];
    if (typeof entry.label === 'string' && entry.label.trim()) return [entry.label.trim()];
  }
  return [];
}

export function summarizeRepairEvidence(repairs = [], previewCount = 2) {
  if (!Array.isArray(repairs) || repairs.length === 0) return 'none';
  const normalized = [...new Set(repairs.flatMap((repair) => normalizeEvidenceEntry(repair)).filter(Boolean))];
  if (normalized.length === 0) return 'none';
  const visible = normalized.slice(0, previewCount);
  const remainder = normalized.length - visible.length;
  return remainder > 0 ? `${visible.join('; ')}; +${remainder} more` : visible.join('; ');
}

export function buildHumanReviewRecommendation({
  blockerCount = 0,
  warningCount = 0,
  repaired = false,
  repairScope = 'repaired sections',
} = {}) {
  if (blockerCount > 0) {
    return 'Review blocked features and readiness findings before classroom handoff.';
  }
  if (warningCount > 0) {
    return 'Review flagged warnings before treating the package as classroom-ready.';
  }
  if (repaired) {
    return `Spot-check ${repairScope} plus institution-specific facts before handoff.`;
  }
  return 'Spot-check institution-specific facts, official dates, and copyrighted readings before handoff.';
}
