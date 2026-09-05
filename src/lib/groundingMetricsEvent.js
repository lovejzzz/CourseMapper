// v0.15.187: grounding is measured per run — enrichment-tagged prose bytes
// per deliverable plus how often the compiler's dictionaries fell through to
// their generic defaults. This module lives OUTSIDE the AppFlow chunk
// (useDeliverables lazy-imports it after compile) per the bundle ratchet:
// measurement code must not grow the workspace bundle.
import { measurePackageGroundedFraction } from './quality/groundedFraction';
import { getContentFallbackTelemetry } from './contentFallbackTelemetry';

export function buildGroundingMetricsEvent(compiled) {
  const grounded = measurePackageGroundedFraction(compiled);
  const fallbacks = getContentFallbackTelemetry();
  return {
    event: {
      type: 'pipelineDecision',
      stage: 'groundingMetrics',
      label: 'Grounded fraction',
      detail: `overall ${(grounded.overall.fraction * 100).toFixed(1)}% · ${Object.entries(grounded.perFeature)
        .map(([fid, m]) => `${fid} ${(m.fraction * 100).toFixed(0)}%`)
        .join(' · ')}`,
      groundedFraction: grounded,
      contentFallbacks: fallbacks,
    },
    trace: {
      overall: grounded.overall,
      perFeature: Object.fromEntries(Object.entries(grounded.perFeature).map(([fid, m]) => [fid, m.fraction])),
      contentFallbacks: Object.fromEntries(Object.entries(fallbacks).map(([id, entry]) => [id, entry.hits])),
    },
  };
}
