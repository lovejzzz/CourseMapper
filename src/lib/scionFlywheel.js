// src/lib/scionFlywheel.js — the house-model flywheel hook (V2.1 D4).
// Local generations bank training signal ON-DEVICE: pass events (verified
// keys, regenerated items with their rejected originals, polish outcomes)
// POST to the local server, which appends them to the ORPO corpus directory.
// Nothing leaves the machine — the server is localhost by construction.
// Fire-and-forget: the flywheel must never slow or fail a generation.
import { getLocalEndpoint } from './localProvider';
import { scionFlywheelEnabled } from './scionContracts';
import { assessScionPreferencePair } from './scionPreferenceGate';

function eventPairKind(event = {}) {
  if (event.kind) return event.kind;
  if (event.chosen?.q || event.chosen?.question || event.rejected?.q || event.rejected?.question) return 'mc-item';
  return '';
}

/**
 * A producer-side `verified: true` flag is not semantic proof. Re-run the
 * repository's pair admission gate before a browser event may reach the
 * localhost corpus writer. This intentionally leaves ordinary generation
 * telemetry diagnostic-only until independent evidence is attached.
 */
export function assessScionFlywheelEvent(event = {}) {
  const issues = [];
  if (event.trainingEligible !== true) issues.push('producer-did-not-authorize-training');
  if (!event.prompt || !event.chosen || !event.rejected) issues.push('incomplete-preference-row');
  if (event.preferenceEvidence?.verified !== true) issues.push('unverified-preference-evidence');
  if (event.preferenceEvidence?.kind && event.preferenceEvidence.kind !== 'deterministic-contract-margin') {
    issues.push('semantic-evidence-requires-offline-source-bound-admission');
  }
  const kind = eventPairKind(event);
  if (!kind) issues.push('unsupported-pair-kind');
  if (issues.length > 0) return { eligible: false, issues };
  const pair = assessScionPreferencePair({
    kind,
    chosen: event.chosen,
    rejected: event.rejected,
    preferenceEvidence: event.preferenceEvidence,
  });
  return { eligible: pair.eligible, issues: pair.issues, kind };
}

export function postFlywheelEvents(events, context = {}) {
  if (!scionFlywheelEnabled()) return;
  // Only pair-level, verified improvements are training data. Telemetry such
  // as a completed polish pass remains visible in the pipeline log but must
  // never be mislabeled as an ORPO preference.
  const rows = (events || []).filter((event) => assessScionFlywheelEvent(event).eligible);
  if (rows.length === 0) return;
  try {
    fetch(`${getLocalEndpoint()}/v1/flywheel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, events: rows }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never let the flywheel touch the generation */
  }
}
