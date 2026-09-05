const SCION_COMPILER_PROVENANCE = 'scion-compiler';
const NOT_APPLICABLE_STATUS = 'not-applicable';

/**
 * A selected material can be complete without containing item rows. For
 * example, an exam-only course needs an exam paper and answer key, but no
 * separate Assignment Brief. Persist the reason with the deliverable so
 * validation, readiness, export, reload, and the UI all interpret the same
 * compiler decision.
 */
export function buildNotApplicableDisposition(
  featureId,
  { reasonCode, summary, detail = '', routeFeatureId = '', routeLabel = '' } = {},
) {
  return {
    status: NOT_APPLICABLE_STATUS,
    featureId,
    provenance: SCION_COMPILER_PROVENANCE,
    reasonCode: String(reasonCode || '').trim(),
    summary: String(summary || '').trim(),
    detail: String(detail || '').trim(),
    routeFeatureId: String(routeFeatureId || '').trim(),
    routeLabel: String(routeLabel || '').trim(),
  };
}

export function getNotApplicableDisposition(featureId, data) {
  const disposition = data?.deliverableDisposition;
  if (
    !disposition ||
    disposition.status !== NOT_APPLICABLE_STATUS ||
    disposition.featureId !== featureId ||
    disposition.provenance !== SCION_COMPILER_PROVENANCE ||
    !String(disposition.reasonCode || '').trim() ||
    !String(disposition.summary || '').trim()
  ) {
    return null;
  }
  return disposition;
}

export function isDeliverableNotApplicable(featureId, data) {
  return Boolean(getNotApplicableDisposition(featureId, data));
}
