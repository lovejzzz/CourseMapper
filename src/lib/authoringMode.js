// localStorage/dev setting, same channel discipline as enrichmentPreference:
// read where generation starts, no UI. 'native' is the default; 'prose' is
// the explicit compatibility fallback.
export const AUTHORING_MODE_STORAGE_KEY = 'coursemapper-authoring-mode';

export function readAuthoringMode() {
  try {
    return localStorage.getItem(AUTHORING_MODE_STORAGE_KEY) === 'prose' ? 'prose' : 'native';
  } catch {
    return 'native';
  }
}

export function saveAuthoringMode(mode) {
  try {
    if (mode === 'prose') localStorage.setItem(AUTHORING_MODE_STORAGE_KEY, 'prose');
    else localStorage.removeItem(AUTHORING_MODE_STORAGE_KEY);
  } catch {
    /* storage unavailable - the default ('native') applies */
  }
}
