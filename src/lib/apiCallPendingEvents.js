const MAX_PENDING_API_EVENTS = 24;
const PENDING_EVENTS_KEY = 'coursemapper-api-call-pending-events';

function readPendingEvents() {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(PENDING_EVENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingEvents(events) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_EVENTS_KEY, JSON.stringify(events.slice(-MAX_PENDING_API_EVENTS)));
  } catch {
    /* best-effort developer telemetry */
  }
}

export function drainPendingApiCallEvents() {
  const events = readPendingEvents();
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(PENDING_EVENTS_KEY);
    } catch {
      /* ignore */
    }
  }
  return events;
}

export function recordPendingApiCallEvent(event = {}) {
  const events = readPendingEvents();
  writePendingEvents([
    ...events,
    {
      ...event,
      pending: true,
      at: event.at || Date.now(),
    },
  ]);
}
