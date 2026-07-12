// src/lib/scionFlywheel.js — the house-model flywheel hook (V2.1 D4).
// Local generations bank training signal ON-DEVICE: pass events (verified
// keys, regenerated items with their rejected originals, polish outcomes)
// POST to the local server, which appends them to the ORPO corpus directory.
// Nothing leaves the machine — the server is localhost by construction.
// Fire-and-forget: the flywheel must never slow or fail a generation.
import { getLocalEndpoint } from './localProvider';
import { scionFlywheelEnabled } from './scionContracts';

export function postFlywheelEvents(events, context = {}) {
  if (!scionFlywheelEnabled()) return;
  // Only pair-level, verified improvements are training data. Telemetry such
  // as a completed polish pass remains visible in the pipeline log but must
  // never be mislabeled as an ORPO preference.
  const rows = (events || []).filter(
    (event) =>
      event?.trainingEligible === true &&
      event?.preferenceEvidence?.verified === true &&
      event?.prompt &&
      event?.chosen &&
      event?.rejected,
  );
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
