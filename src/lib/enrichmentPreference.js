// src/lib/enrichmentPreference.js — v0.12.1: the user-facing subject-matter
// enrichment control. The v0.12 audit shipped four mail-merge packages
// because nothing surfaced (or let the user override) the plan's enrichment
// state. The preference is three-state: 'auto' defers to the generation
// plan's adaptive default; 'on' forces enrichment; 'off' disables it.

export const ENRICHMENT_MODE_STORAGE_KEY = 'coursemapper-enrichment-mode';

export function readEnrichmentPreference() {
  try {
    const raw = localStorage.getItem(ENRICHMENT_MODE_STORAGE_KEY);
    return raw === 'on' || raw === 'off' ? raw : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveEnrichmentPreference(mode) {
  try {
    if (mode === 'on' || mode === 'off') localStorage.setItem(ENRICHMENT_MODE_STORAGE_KEY, mode);
    else localStorage.removeItem(ENRICHMENT_MODE_STORAGE_KEY);
  } catch {}
}

// Maps the stored preference onto generateAll's mode-resolution chain:
// 'on' → 'required', 'off' → false, 'auto' → undefined (defer to the plan).
export function enrichmentPreferenceOverride() {
  const pref = readEnrichmentPreference();
  if (pref === 'on') return 'required';
  if (pref === 'off') return false;
  return undefined;
}

// Human caption for the resolved state, shown under the control.
export function describeEnrichmentResolution(pref, planDefault) {
  if (pref === 'on')
    return 'Always runs — adds real subject matter to compiled deliverables (adaptive batching on long-output models).';
  if (pref === 'off') return 'Off — deliverables compile from templates only (mail-merge risk).';
  if (planDefault === 'adaptive') {
    return 'Adaptive — runs when the course map has enough source signal (batch size follows model output capacity).';
  }
  if (!planDefault) return 'Off for this model — it cannot follow the structured enrichment contract.';
  return 'Follows the generation plan for this model.';
}
