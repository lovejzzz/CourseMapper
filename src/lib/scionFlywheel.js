// src/lib/scionFlywheel.js — the house-model flywheel hook (V2.1 D4).
// Local generations can bank training signal ON-DEVICE: pass events
// (verified keys, regenerated items with their rejected originals, polish
// outcomes) POST to the local server, which appends them to the Scion eval
// ledger. This is opt-in because full examples are storage, even though
// nothing leaves the machine.
// Fire-and-forget: the flywheel must never slow or fail a generation.
import { getLocalEndpoint } from './localProvider';
import { scionFlywheelEnabled } from './scionContracts';

export function postFlywheelEvents(events, context = {}) {
  if (!scionFlywheelEnabled()) return;
  const rows = (events || []).filter(Boolean);
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
